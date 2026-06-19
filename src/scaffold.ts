/**
 * Project scaffolder.
 *
 * Generates a ready-to-run MCP server skeleton: a tool catalog (tools.json), a
 * server entrypoint that wires those tools into a ToolRegistry, a sample tool
 * handler, plus package.json / tsconfig / README for the generated project.
 *
 * The generated code depends only on Node built-ins and this package's library,
 * so it runs without a network install once the library is available.
 *
 * Original Cognis Digital implementation.
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type { ToolDefinition } from "./types.js";

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

/** The sample tool shipped with every scaffolded project. */
export const SAMPLE_TOOL: ToolDefinition = {
  name: "echo",
  description: "Echo back the provided text. A minimal sample tool.",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to echo back." },
    },
    required: ["text"],
  },
};

function writeFileTracked(
  base: string,
  rel: string,
  contents: string,
  written: string[]
): void {
  const full = join(base, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, contents, "utf8");
  written.push(rel);
}

export function scaffold(opts: ScaffoldOptions): ScaffoldResult {
  const name = opts.name;
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)) {
    throw new Error(`invalid project name: ${JSON.stringify(name)}`);
  }
  const dir = opts.dir ?? join(process.cwd(), name);
  if (existsSync(dir)) {
    throw new Error(`target directory already exists: ${dir}`);
  }
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, "src"), { recursive: true });

  const written: string[] = [];

  // tools.json — the catalog this server advertises.
  writeFileTracked(
    dir,
    "tools.json",
    JSON.stringify([SAMPLE_TOOL], null, 2) + "\n",
    written
  );

  // server entrypoint
  writeFileTracked(dir, "src/server.mjs", SERVER_TEMPLATE, written);

  // sample tool handler
  writeFileTracked(dir, "src/tools/echo.mjs", ECHO_HANDLER_TEMPLATE, written);

  // package.json for the generated project
  writeFileTracked(
    dir,
    "package.json",
    JSON.stringify(
      {
        name,
        version: "0.1.0",
        description: `MCP server: ${name}`,
        type: "module",
        private: true,
        scripts: {
          start: "node src/server.mjs",
        },
        author: "Cognis Digital",
      },
      null,
      2
    ) + "\n",
    written
  );

  writeFileTracked(dir, "README.md", readmeTemplate(name), written);
  writeFileTracked(dir, ".gitignore", "node_modules/\n*.log\n", written);

  return { dir, files: written };
}

const ECHO_HANDLER_TEMPLATE = `// Sample tool handler. Replace with your own logic.
export function echo(args) {
  return { text: String(args.text ?? "") };
}
`;

const SERVER_TEMPLATE = `#!/usr/bin/env node
// MCP server entrypoint (scaffolded by mcpscaffold).
//
// This is a self-contained dispatch loop: it reads the tool catalog from
// tools.json and registers handlers. Wire it to your MCP transport of choice
// (stdio, etc.); the dispatch logic below is transport-agnostic and unit-testable.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { echo } from "./tools/echo.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Map of tool name -> handler.
const handlers = {
  echo,
};

async function loadCatalog() {
  const raw = await readFile(join(__dirname, "..", "tools.json"), "utf8");
  return JSON.parse(raw);
}

// Minimal dispatch: look up the named tool and call its handler.
export async function dispatch(name, args = {}) {
  const handler = handlers[name];
  if (!handler) throw new Error("unknown tool: " + name);
  return await handler(args);
}

async function main() {
  const catalog = await loadCatalog();
  console.error(
    "[" + (catalog.length) + " tools] " + catalog.map((t) => t.name).join(", ")
  );
  // Demo dispatch so 'npm start' shows something useful.
  const result = await dispatch("echo", { text: "hello from MCP" });
  console.log(JSON.stringify(result));
}

if (import.meta.url === \`file://\${process.argv[1]}\` || process.argv[1]?.endsWith("server.mjs")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
`;

function readmeTemplate(name: string): string {
  return `# ${name}

A Model Context Protocol (MCP) server scaffolded with [mcpscaffold](https://github.com/cognis-digital/mcpscaffold).

## Run

\`\`\`sh
npm start
\`\`\`

## Layout

- \`tools.json\` — the tool catalog this server advertises.
- \`src/server.mjs\` — entrypoint + dispatch loop.
- \`src/tools/\` — one handler per tool.

## Validate the catalog

\`\`\`sh
npx @cognis-digital/mcpscaffold validate tools.json
\`\`\`

License: COCL 1.0
`;
}
