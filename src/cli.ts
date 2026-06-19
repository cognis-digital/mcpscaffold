#!/usr/bin/env node
/**
 * mcpscaffold CLI.
 *
 * Subcommands:
 *   new <server-name>   scaffold a new MCP server project
 *   validate <file>     validate a tool catalog (exit non-zero on errors)
 *   list <file>         pretty-print a tool catalog
 *
 * Original Cognis Digital implementation.
 */

import { readFileSync } from "node:fs";
import { scaffold } from "./scaffold.js";
import { validateTools } from "./validate.js";
import type { ToolDefinition } from "./types.js";

const USAGE = `mcpscaffold — scaffold, validate, and test MCP servers

Usage:
  mcpscaffold new <server-name> [--dir <path>]   Scaffold a new MCP server project
  mcpscaffold validate <tools.json>              Validate a tool catalog (CI gate)
  mcpscaffold list <tools.json>                  Pretty-print the tool catalog
  mcpscaffold --help                             Show this help

License: COCL 1.0`;

function fail(msg: string): never {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

function readCatalog(file: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    fail(`cannot read file: ${file}`);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    fail(`invalid JSON in ${file}: ${(e as Error).message}`);
  }
}

function cmdNew(args: string[]): number {
  const name = args[0];
  if (!name || name.startsWith("-")) fail("usage: mcpscaffold new <server-name> [--dir <path>]");
  let dir: string | undefined;
  const dirIdx = args.indexOf("--dir");
  if (dirIdx >= 0) {
    dir = args[dirIdx + 1];
    if (!dir) fail("--dir requires a path");
  }
  try {
    const result = scaffold({ name, dir });
    process.stdout.write(`Scaffolded MCP server "${name}" at ${result.dir}\n`);
    for (const f of result.files) process.stdout.write(`  + ${f}\n`);
    process.stdout.write(`\nNext:\n  cd ${name}\n  npm start\n`);
    return 0;
  } catch (e) {
    fail((e as Error).message);
  }
}

function cmdValidate(args: string[]): number {
  const file = args[0];
  if (!file) fail("usage: mcpscaffold validate <tools.json>");
  const catalog = readCatalog(file);
  const result = validateTools(catalog);
  if (result.ok) {
    const count = Array.isArray(catalog) ? catalog.length : 0;
    process.stdout.write(`OK: ${count} tool(s) valid\n`);
    return 0;
  }
  process.stderr.write(`FAIL: ${result.issues.length} issue(s)\n`);
  for (const issue of result.issues) {
    const where =
      issue.index < 0
        ? "catalog"
        : `tool[${issue.index}]${issue.tool ? ` (${issue.tool})` : ""}`;
    process.stderr.write(`  - ${where}: ${issue.message}\n`);
  }
  return 1;
}

function cmdList(args: string[]): number {
  const file = args[0];
  if (!file) fail("usage: mcpscaffold list <tools.json>");
  const catalog = readCatalog(file);
  if (!Array.isArray(catalog)) fail("tool catalog must be a JSON array");
  const tools = catalog as ToolDefinition[];
  if (tools.length === 0) {
    process.stdout.write("(empty catalog)\n");
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
      const rendered = props
        .map((p) => (required.has(p) ? `${p}*` : p))
        .join(", ");
      process.stdout.write(`    args: ${rendered}   (* = required)\n`);
    } else {
      process.stdout.write(`    args: (none)\n`);
    }
    process.stdout.write("\n");
  }
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
