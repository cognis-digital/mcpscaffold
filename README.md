# mcpscaffold

Scaffolder, validator, and test harness for local Model Context Protocol (MCP) servers.

`mcpscaffold` helps you stand up an MCP server skeleton, keep your tool
definitions honest (CI-gateable validation), and unit-test tool dispatch
without a live MCP client. Zero runtime dependencies — pure Node + TypeScript.

## Install

```sh
# one-off, no install
npx @cognis-digital/mcpscaffold new my-server

# or install globally
npm install -g @cognis-digital/mcpscaffold
```

## Build from source

```sh
git clone https://github.com/cognis-digital/mcpscaffold
cd mcpscaffold
npm install
npm run build
npm test
```

## Usage

### Scaffold a new server

```sh
$ mcpscaffold new my-server
Scaffolded MCP server "my-server" at /path/to/my-server
  + tools.json
  + src/server.mjs
  + src/tools/echo.mjs
  + package.json
  + README.md
  + .gitignore

Next:
  cd my-server
  npm start
```

### Validate a tool catalog (CI gate)

Exits non-zero when anything is wrong, so it drops straight into CI.

```sh
$ mcpscaffold validate examples/tools.json
OK: 2 tool(s) valid

$ mcpscaffold validate broken.json
FAIL: 2 issue(s)
  - tool[0] (my tool): name "my tool" does not match /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/
  - tool[1] (search): inputSchema at /type: unknown type "stringy"
```

### List a catalog

```sh
$ mcpscaffold list examples/tools.json
2 tool(s):

  search_docs
    Search a documentation corpus and return matching passages.
    args: query*, limit   (* = required)

  get_weather
    Return the current weather for a city (sample/defensive read-only tool).
    args: city*, units   (* = required)
```

## Library

The package also exports a small reusable library:

```ts
import { ToolRegistry, validateTools } from "@cognis-digital/mcpscaffold";

const registry = new ToolRegistry();
registry.register(
  {
    name: "add",
    description: "Add two integers.",
    inputSchema: {
      type: "object",
      properties: { a: { type: "integer" }, b: { type: "integer" } },
      required: ["a", "b"],
    },
  },
  (args) => (args.a as number) + (args.b as number)
);

// Arguments are validated against the tool's JSON Schema before the handler runs.
const ok = await registry.dispatch("add", { a: 2, b: 3 });
// => { ok: true, value: 5 }

const bad = await registry.dispatch("add", { a: "two" });
// => { ok: false, error: DispatchError { code: "invalid_args", ... } }
```

## Features

- **Scaffold** (`new`) — generates a runnable MCP server skeleton: tool catalog,
  transport-agnostic dispatch entrypoint, a sample tool handler, plus
  `package.json`, `README`, and `.gitignore`.
- **Validate** (`validate`) — checks each tool's name format, non-empty
  description, well-formed `inputSchema`, and uniqueness; non-zero exit on
  failure for CI gating.
- **List** (`list`) — pretty-prints the tool catalog with required-arg markers.
- **`ToolRegistry` + `dispatch()`** — register tools and dispatch calls by name;
  arguments are validated against each tool's JSON Schema before the handler is
  invoked, so tools are unit-testable without a live client.
- **Minimal JSON-Schema validator** — supports `type` (incl. `integer` and type
  arrays), `required`, `properties`, `items`, and `enum`. No heavy dependencies.

## Scope

Defensive / analytical tooling only. `mcpscaffold` generates and validates tool
descriptions and simulates dispatch; it does not execute remote code or act as a
production transport.

## License

License: COCL 1.0
