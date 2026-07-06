# Architecture

`mcpscaffold` is a small TypeScript library plus a CLI. The library is pure and
dependency-free (Node built-ins only); the CLI is a thin argument parser over it.

## Module map (`src/`)

| Module | Responsibility |
| --- | --- |
| `types.ts` | The MCP primitive type model: `JsonSchema`, `ToolDefinition` (+ `title`, `outputSchema`, `annotations`), `ResourceDefinition`, `ResourceTemplateDefinition`, `PromptDefinition`, and the umbrella `ServerSpec` (`{name, version, tools, resources, resourceTemplates, prompts, auth}`). Also `MCP_PROTOCOL_VERSION`. |
| `jsonschema.ts` | Dependency-free JSON Schema subset: `checkSchemaShape()` (is this a usable schema?) and `validate()` (does data conform?). Supports `type`/`required`/`properties`/`items`/`enum`, incl. `integer` and type arrays. |
| `validate.ts` | MCP-conformance validation. Per-primitive validators (`validateTool`, `validateResource`, `validateResourceTemplate`, `validatePrompt`), whole-spec `validateServerSpec()`, and `validateAny()` which accepts a tools array (back-compat) or a full spec. `NAME_PATTERN`, `URI_PATTERN`. |
| `registry.ts` | Runtime harnesses: `ToolRegistry` (validate args → dispatch), `ResourceRegistry` (read by URI), `PromptRegistry` (render with required-arg checks). Lets you unit-test server logic without a live client. |
| `spec.ts` | `starterSpec(name)` (minimal one-of-each spec) and `EXAMPLE_SPEC` (richer multi-primitive + bearer-auth example) used by `init-spec`, docs, and demos. |
| `generate.ts` | **The generation pipeline.** `generateServerFiles(spec)` — a pure function returning `GeneratedFile[]` (path + contents) for the whole project. No filesystem side effects, so the generated strings are unit-testable. |
| `scaffold.ts` | The filesystem writer: `scaffoldFromSpec(spec, dir)` and the back-compatible `scaffold({name, dir})` (builds a starter spec). Writes each `GeneratedFile` to disk. |
| `cli.ts` | Commands `new`, `validate`, `list`, `init-spec`, `--help`. |
| `index.ts` | Public exports. |

## The generation pipeline

```
ServerSpec  ──►  validateServerSpec()  ──►  generateServerFiles()  ──►  GeneratedFile[]  ──►  scaffoldFromSpec() writes to disk
   (input)          (conformance)              (pure, in memory)          (path+contents)         (fs)
```

`generateServerFiles()` emits, per spec:

- `spec.json`, `tools.json` — the spec and its tool catalog.
- `src/transport.mjs` — stdio, newline-delimited JSON-RPC framing.
- `src/auth.mjs` — `authorize(request)` hook (allow-with-TODO; bearer example if configured).
- `src/server.mjs` — the JSON-RPC router (one `case` per MCP method), with the
  static catalogs and handler maps baked in.
- `src/tools/<name>.mjs`, `src/resources/<name>.mjs`,
  `src/resource_templates/<name>.mjs`, `src/prompts/<name>.mjs` — one handler
  stub per primitive.
- `test/server.test.mjs` — a `node:test` suite for the generated server.
- `scripts/smoke.mjs` — an end-to-end stdio smoke test (spawns the server).
- `package.json`, `README.md`, `.gitignore`.

Keeping generation pure (in `generate.ts`) means the tests can inspect the exact
generated source, and can even `import()` the generated `server.mjs` to drive
its router in-process — separate from the spawn-based integration test.

## How the generated server maps to MCP methods

`src/server.mjs` exports `handleRequest(msg)` (route one JSON-RPC request →
response) and `handleMessage(msg)` (skip notifications, otherwise respond).

| JSON-RPC method | Handled by |
| --- | --- |
| `initialize` | Returns negotiated `protocolVersion`, `capabilities` (only for non-empty primitive sets), `serverInfo`, `instructions?`. |
| `ping` | `{}`. |
| `tools/list` | The baked `TOOLS` catalog. |
| `tools/call` | Looks up the tool handler, calls it; normalizes bare returns into `{content:[{type:"text",...}]}`; catches throws into `{isError:true}`. |
| `resources/list` | The `RESOURCES` catalog. |
| `resources/read` | Exact-URI handler first, then each resource template via a level-1 RFC 6570 matcher (`{var}` → capture group); `-32002` if none match. |
| `resources/templates/list` | The `RESOURCE_TEMPLATES` catalog. |
| `prompts/list` | The `PROMPTS` catalog. |
| `prompts/get` | Looks up the prompt handler and returns its `{description?, messages}`. |
| anything else | `-32601` method not found. |

`authorize(msg)` from `src/auth.mjs` runs before every request; returning
`{ok:false, code, message}` short-circuits to a JSON-RPC error.

## Transport framing

`src/transport.mjs` reads stdin with `readline` (`crlfDelay: Infinity` so CRLF
is handled), parses each non-blank line as one JSON-RPC message, and writes each
response as `JSON.stringify(message) + "\n"`. `JSON.stringify` never emits raw
newlines, so every message is exactly one line — satisfying the spec's "messages
MUST NOT contain embedded newlines." Diagnostics go to stderr; stdout carries
only protocol messages.

## Build layout

- `tsconfig.json` builds `src/**` → `dist/` (so `dist/cli.js`, `dist/index.js`,
  `dist/index.d.ts` are what `bin`/`exports`/`types` point at).
- `tsconfig.test.json` builds `src/**` + `test/**` → `dist-test/` for the test
  run. `dist-test/` is git-ignored and not published.
