#!/usr/bin/env node
/**
 * mcpscaffold CLI.
 *
 * Subcommands:
 *   new <name> [--spec <spec.json>] [--dir <path>]
 *                        Scaffold a new MCP server project. With --spec, build
 *                        from a full ServerSpec; without it, a starter server
 *                        (one tool + one resource + one prompt).
 *   validate <file>      Validate a tools array (back-compat) or a full
 *                        ServerSpec; non-zero exit on errors (CI gate).
 *   list <file>          Pretty-print a tools array or ServerSpec.
 *   init-spec [file]     Write an example ServerSpec (default spec.json).
 *   --help               Show usage.
 *
 * Original Cognis Digital implementation.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { scaffold, scaffoldFromSpec } from "./scaffold.js";
import {
  validateAny,
  validateServerSpec,
  isServerSpec,
} from "./validate.js";
import { EXAMPLE_SPEC } from "./spec.js";
import { MCP_PROTOCOL_VERSION } from "./types.js";
import type {
  PromptDefinition,
  ResourceDefinition,
  ServerSpec,
  ToolDefinition,
} from "./types.js";

const USAGE = `mcpscaffold — scaffold, validate, and test MCP servers (spec ${MCP_PROTOCOL_VERSION})

Usage:
  mcpscaffold new <name> [--spec <spec.json>] [--dir <path>]
                                     Scaffold a new MCP server project
  mcpscaffold validate <file>        Validate a tools array or ServerSpec (CI gate)
  mcpscaffold list <file>            Pretty-print a tools array or ServerSpec
  mcpscaffold init-spec [file]       Write an example ServerSpec (default spec.json)
  mcpscaffold --help                 Show this help

License: COCL 1.0`;

function fail(msg: string): never {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

function readJson(file: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    fail(`cannot read file: ${file}`);
  }
  try {
    // Strip a leading UTF-8 BOM (common on Windows-authored JSON) before parse.
    return JSON.parse(raw.replace(/^﻿/, ""));
  } catch (e) {
    fail(`invalid JSON in ${file}: ${(e as Error).message}`);
  }
}

function cmdNew(args: string[]): number {
  const name = args[0];
  if (!name || name.startsWith("-")) {
    fail("usage: mcpscaffold new <name> [--spec <spec.json>] [--dir <path>]");
  }

  let dir: string | undefined;
  const dirIdx = args.indexOf("--dir");
  if (dirIdx >= 0) {
    dir = args[dirIdx + 1];
    if (!dir) fail("--dir requires a path");
  }

  let specFile: string | undefined;
  const specIdx = args.indexOf("--spec");
  if (specIdx >= 0) {
    specFile = args[specIdx + 1];
    if (!specFile) fail("--spec requires a path");
  }

  try {
    let result;
    if (specFile) {
      const parsed = readJson(specFile);
      const check = validateServerSpec(parsed);
      if (!check.ok) {
        process.stderr.write(`spec is invalid (${check.issues.length} issue(s)):\n`);
        for (const i of check.issues) process.stderr.write(`  - ${i.message}\n`);
        return 1;
      }
      const spec = parsed as ServerSpec;
      // The project name from the CLI overrides the spec name when both differ.
      if (name !== spec.name) spec.name = name;
      result = scaffoldFromSpec(spec, dir);
    } else {
      result = scaffold({ name, dir });
    }
    process.stdout.write(`Scaffolded MCP server "${name}" at ${result.dir}\n`);
    for (const f of result.files) process.stdout.write(`  + ${f}\n`);
    process.stdout.write(
      `\nNext:\n  cd ${name}\n  npm start          # run the server on stdio\n` +
        `  npm test           # run the generated tests\n` +
        `  node scripts/smoke.mjs   # end-to-end MCP smoke test\n`
    );
    return 0;
  } catch (e) {
    fail((e as Error).message);
  }
}

function cmdValidate(args: string[]): number {
  const file = args[0];
  if (!file) fail("usage: mcpscaffold validate <file>");
  const parsed = readJson(file);
  const result = validateAny(parsed);
  const kind = isServerSpec(parsed) ? "ServerSpec" : "tool catalog";
  if (result.ok) {
    if (isServerSpec(parsed)) {
      const s = parsed as ServerSpec;
      process.stdout.write(
        `OK: ServerSpec "${s.name}" valid ` +
          `(${(s.tools ?? []).length} tool(s), ${(s.resources ?? []).length} resource(s), ` +
          `${(s.resourceTemplates ?? []).length} template(s), ${(s.prompts ?? []).length} prompt(s))\n`
      );
    } else {
      const count = Array.isArray(parsed) ? parsed.length : 0;
      process.stdout.write(`OK: ${count} tool(s) valid\n`);
    }
    return 0;
  }
  process.stderr.write(`FAIL: ${kind} — ${result.issues.length} issue(s)\n`);
  for (const issue of result.issues) {
    const where =
      issue.index < 0
        ? issue.kind ?? "spec"
        : `${issue.kind ?? "item"}[${issue.index}]${issue.tool ? ` (${issue.tool})` : ""}`;
    process.stderr.write(`  - ${where}: ${issue.message}\n`);
  }
  return 1;
}

function cmdList(args: string[]): number {
  const file = args[0];
  if (!file) fail("usage: mcpscaffold list <file>");
  const parsed = readJson(file);

  let tools: ToolDefinition[];
  let resources: ResourceDefinition[] = [];
  let prompts: PromptDefinition[] = [];

  if (isServerSpec(parsed)) {
    const s = parsed as ServerSpec;
    process.stdout.write(`ServerSpec "${s.name}" v${s.version}\n\n`);
    tools = s.tools ?? [];
    resources = s.resources ?? [];
    prompts = s.prompts ?? [];
  } else if (Array.isArray(parsed)) {
    tools = parsed as ToolDefinition[];
  } else {
    fail("file must be a tools array or a ServerSpec object");
  }

  if (tools.length === 0 && resources.length === 0 && prompts.length === 0) {
    process.stdout.write("(empty)\n");
    return 0;
  }

  process.stdout.write(`${tools.length} tool(s):\n\n`);
  for (const t of tools) {
    const props =
      t?.inputSchema && t.inputSchema.properties
        ? Object.keys(t.inputSchema.properties)
        : [];
    const required = new Set(
      Array.isArray(t?.inputSchema?.required) ? t.inputSchema!.required : []
    );
    process.stdout.write(`  ${t?.name ?? "(unnamed)"}\n`);
    process.stdout.write(`    ${t?.description ?? "(no description)"}\n`);
    if (props.length > 0) {
      const rendered = props.map((p) => (required.has(p) ? `${p}*` : p)).join(", ");
      process.stdout.write(`    args: ${rendered}   (* = required)\n`);
    } else {
      process.stdout.write(`    args: (none)\n`);
    }
    if (t?.outputSchema) process.stdout.write(`    (has outputSchema)\n`);
    process.stdout.write("\n");
  }

  if (resources.length > 0) {
    process.stdout.write(`${resources.length} resource(s):\n\n`);
    for (const r of resources) {
      process.stdout.write(`  ${r.name} — ${r.uri}\n`);
      if (r.description) process.stdout.write(`    ${r.description}\n`);
    }
    process.stdout.write("\n");
  }
  if (prompts.length > 0) {
    process.stdout.write(`${prompts.length} prompt(s):\n\n`);
    for (const p of prompts) {
      const argNames = (p.arguments ?? [])
        .map((a) => (a.required ? `${a.name}*` : a.name))
        .join(", ");
      process.stdout.write(`  ${p.name}\n`);
      if (p.description) process.stdout.write(`    ${p.description}\n`);
      process.stdout.write(`    args: ${argNames || "(none)"}\n`);
    }
    process.stdout.write("\n");
  }
  return 0;
}

function cmdInitSpec(args: string[]): number {
  const file = args[0] && !args[0].startsWith("-") ? args[0] : "spec.json";
  if (existsSync(file)) fail(`refusing to overwrite existing file: ${file}`);
  writeFileSync(file, JSON.stringify(EXAMPLE_SPEC, null, 2) + "\n", "utf8");
  process.stdout.write(`Wrote example ServerSpec to ${file}\n`);
  process.stdout.write(`Next:\n  mcpscaffold validate ${file}\n  mcpscaffold new my-server --spec ${file}\n`);
  return 0;
}

function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "new":
      return cmdNew(rest);
    case "validate":
      return cmdValidate(rest);
    case "list":
      return cmdList(rest);
    case "init-spec":
      return cmdInitSpec(rest);
    case "--help":
    case "-h":
    case undefined:
      process.stdout.write(USAGE + "\n");
      return cmd === undefined ? 1 : 0;
    default:
      process.stderr.write(`unknown command: ${cmd}\n\n${USAGE}\n`);
      return 1;
  }
}

process.exit(main(process.argv.slice(2)));
