/**
 * Project scaffolder.
 *
 * Writes a full MCP server project to disk from a {@link ServerSpec}: the
 * stdio transport, a JSON-RPC router implementing the MCP 2025-06-18 methods,
 * one typed handler stub per tool/resource/template/prompt, an auth hook, a
 * node:test suite, an end-to-end smoke script, and package.json/README/spec.json.
 *
 * The generated project depends only on Node built-ins, so it runs offline.
 * Generation itself lives in generate.ts (pure); this module is the thin
 * filesystem writer plus back-compatible entry points.
 *
 * Original Cognis Digital implementation.
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { generateServerFiles } from "./generate.js";
import { starterSpec } from "./spec.js";
import type { ServerSpec, ToolDefinition } from "./types.js";

export interface ScaffoldOptions {
  /** Project name (also the package name). */
  name: string;
  /** Directory to create the project in (defaults to ./<name>). */
  dir?: string;
}

export interface ScaffoldResult {
  dir: string;
  files: string[];
}

/**
 * The sample tool shipped in the starter spec. Kept as a named export for
 * back-compatibility with existing tests/imports.
 */
export const SAMPLE_TOOL: ToolDefinition = {
  name: "echo",
  title: "Echo",
  description: "Echo back the provided text. A minimal sample tool.",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to echo back." },
    },
    required: ["text"],
  },
};

function assertName(name: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)) {
    throw new Error(`invalid project name: ${JSON.stringify(name)}`);
  }
}

function targetDir(name: string, dir?: string): string {
  const out = dir ?? join(process.cwd(), name);
  if (existsSync(out)) {
    throw new Error(`target directory already exists: ${out}`);
  }
  return out;
}

function writeFileTracked(
  base: string,
  rel: string,
  contents: string,
  written: string[]
): void {
  const full = join(base, ...rel.split("/"));
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, contents, "utf8");
  written.push(rel);
}

/**
 * Scaffold a project from a full {@link ServerSpec}. The spec's `name` is the
 * project/package name unless `dir` overrides the location.
 */
export function scaffoldFromSpec(spec: ServerSpec, dir?: string): ScaffoldResult {
  assertName(spec.name);
  const out = targetDir(spec.name, dir);
  mkdirSync(out, { recursive: true });

  const written: string[] = [];
  for (const file of generateServerFiles(spec)) {
    writeFileTracked(out, file.path, file.contents, written);
  }
  return { dir: out, files: written };
}

/**
 * Scaffold a starter project (one tool + one resource + one prompt). Retained
 * signature for back-compatibility; internally builds a starter ServerSpec.
 */
export function scaffold(opts: ScaffoldOptions): ScaffoldResult {
  assertName(opts.name);
  const spec = starterSpec(opts.name);
  return scaffoldFromSpec(spec, opts.dir);
}
