# mcpscaffold

Generate a **conformant, typed, tested** Model Context Protocol (MCP) server
from a single spec file — instead of hand-writing the JSON-RPC handshake,
primitive listing, schema validation, and stdio framing every time (and getting
the spec shapes wrong).

Targets **MCP specification version [`2025-06-18`](https://modelcontextprotocol.io/specification/2025-06-18)**.
Zero runtime dependencies — pure Node built-ins + TypeScript.

## The problem

Every MCP server has to re-implement the same plumbing:

- the **`initialize`** handshake with protocol-version and capability negotiation,
- **`tools/list`** / **`tools/call`** with argument validation and MCP-shaped
  `content` results,
- **`resources/list`** / **`resources/read`** / **`resources/templates/list`**,
- **`prompts/list`** / **`prompts/get`**,
- the **stdio transport**: newline-delimited JSON-RPC that MUST NOT contain
  embedded newlines and MUST keep non-protocol chatter off stdout.

Get any of those shapes wrong and clients silently fail to see your tools.
`mcpscaffold` generates all of it — correct to the spec — from a `ServerSpec`,
plus one typed handler stub per primitive, an auth hook, a `node:test` suite,
and an end-to-end stdio smoke test.

## Install

```sh
# one-off, no install
npx @cognis-digital/mcpscaffold init-spec spec.json
npx @cognis-digital/mcpscaffold new my-server --spec spec.json

# or install globally
npm install -g @cognis-digital/mcpscaffold
```

### Install (Windows / macOS / Linux)

```sh
git clone https://github.com/cognis-digital/mcpscaffold
cd mcpscaffold
# macOS / Linux
./install.sh
# Windows PowerShell
./install.ps1
# or, anywhere with make
make install build test
```

All three paths run `npm ci`, build, and (optionally) `npm link` the CLI. See
[`docs/`](docs/) for guides.

## Quick start

```sh
$ mcpscaffold init-spec spec.json
Wrote example ServerSpec to spec.json

$ mcpscaffold validate spec.json
OK: ServerSpec "example-mcp-server" valid (3 tool(s), 2 resource(s), 1 template(s), 2 prompt(s))

$ mcpscaffold new demo-server --spec spec.json
Scaffolded MCP server "demo-server" at .../demo-server
  + spec.json
  + tools.json
  + src/transport.mjs
  + src/auth.mjs
  + src/server.mjs
  + src/tools/echo.mjs
  + src/tools/add.mjs
  + src/tools/word_count.mjs
  + src/resources/about.mjs
  + src/resources/version.mjs
  + src/resource_templates/greeting.mjs
  + src/prompts/summarize.mjs
  + src/prompts/code_review.mjs
  + package.json
  + test/server.test.mjs
  + scripts/smoke.mjs
  + README.md
  + .gitignore

$ cd demo-server && node scripts/smoke.mjs
[demo-server 1.0.0] MCP server ready on stdio (3 tools, 2 resources, 1 templates, 2 prompts)
initialize ok: demo-server 1.0.0
tools/list ok: 3 tool(s)
tools/call ok: {"type":"text","text":"hello"}
SMOKE OK
```

The generated `initialize` response is a real MCP handshake:

```json
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":false},"resources":{"subscribe":false,"listChanged":false},"prompts":{"listChanged":false}},"serverInfo":{"name":"demo-server","version":"1.0.0","title":"Example MCP Server"},"instructions":"..."}}
```

## Commands

| Command | What it does |
| --- | --- |
| `new <name> [--spec <spec.json>] [--dir <path>]` | Scaffold a server. With `--spec`, generate from a full `ServerSpec`; without it, a starter server (one tool + one resource + one template + one prompt). |
| `validate <file> [--json]` | Validate a bare tools array (back-compat) **or** a full `ServerSpec`, with MCP-conformance checks. Non-zero exit on any issue — drops straight into CI. `--json` prints a machine-readable `{ ok, kind, issues }` document. |
| `diff <old> <new> [--json]` | Compare two specs and classify each change as **breaking** or **compatible** for existing clients. Non-zero exit on any breaking change — a compatibility CI gate. `--json` prints the full `SpecDiff`. |
| `list <file>` | Pretty-print a tools array or `ServerSpec`. |
| `init-spec [file]` | Write an example `ServerSpec` (default `spec.json`). |
| `--help` | Usage. |

Full command and library walkthrough: [`docs/USAGE.md`](docs/USAGE.md).

### validate as a CI gate

```sh
$ mcpscaffold validate broken.json
FAIL: tool catalog — 3 issue(s)
  - tool[0] (bad name): name "bad name" does not match /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/
  - tool[0] (bad name): missing or empty description
  - tool[0] (bad name): inputSchema at /type: unknown type "nope"
$ echo $?
1
```

### diff as a compatibility gate

An MCP server is a contract, and some spec changes silently break existing
clients — a removed tool, a newly-required argument, a changed input type.
`diff` classifies every change and fails the build on a breaking one:

```sh
$ mcpscaffold diff v1.json v2.json
BREAKING: 1 breaking change(s) from v1.json to v2.json
  BREAKING  - [tool] tool "word_count" removed
  ok        ~ [server] version changed "1.0.0" → "2.0.0"

0 added, 1 removed, 1 changed — 1 breaking
$ echo $?
1
```

The full rule table (what counts as breaking vs compatible) and a ready-to-paste
CI recipe are in [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md).

## The library

`mcpscaffold` is also an importable library:

```ts
import {
  ToolRegistry,
  ResourceRegistry,
  PromptRegistry,
  validateServerSpec,
  generateServerFiles,
  type ServerSpec,
} from "@cognis-digital/mcpscaffold";

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
await registry.dispatch("add", { a: 2, b: 3 }); // { ok: true, value: 5 }
await registry.dispatch("add", { a: "two" });   // { ok: false, error: DispatchError { code: "invalid_args" } }

// generateServerFiles(spec) returns the whole project in memory (pure, testable).
const files = generateServerFiles(mySpec);
```

It also exposes the compatibility differ and the RFC 6570 level-1 URI-template
helpers used when implementing resource-template handlers:

```ts
import {
  diffSpecs,
  formatDiff,
  matchUriTemplate,
  expandUriTemplate,
  templateVariables,
} from "@cognis-digital/mcpscaffold";

const diff = diffSpecs(previousSpec, nextSpec);
if (diff.breaking) throw new Error(formatDiff(diff));

matchUriTemplate("greeting://{who}", "greeting://ada"); // { who: "ada" }
expandUriTemplate("greeting://{who}", { who: "Ada L" }); // "greeting://Ada%20L"
templateVariables("file:///{dir}/{name}");              // ["dir", "name"]
```

## MCP conformance

Generated servers implement, over the stdio transport:

`initialize` · `ping` · `tools/list` · `tools/call` · `resources/list` ·
`resources/read` · `resources/templates/list` · `prompts/list` · `prompts/get`

Tools carry `inputSchema` and optional `outputSchema` + `annotations`; tool
results are MCP `content` blocks with optional `structuredContent`/`isError`;
resources return `contents` (text or `blob`); resource templates match concrete
URIs via a level-1 RFC 6570 matcher; prompts return `messages`. See
[`docs/MCP-CONFORMANCE.md`](docs/MCP-CONFORMANCE.md) for the full method/primitive
matrix and what is intentionally out of scope (HTTP transport, subscriptions,
sampling/elicitation, pagination).

## Architecture

`mcpscaffold` is a small, pure TypeScript library plus a thin CLI over it. The
spec is the single source of truth; validation, generation, and diffing all
derive from it.

```
ServerSpec ──► validateServerSpec() ──► generateServerFiles() ──► GeneratedFile[] ──► scaffoldFromSpec() writes to disk
  (input)         (conformance)            (pure, in memory)         (path+contents)          (fs)
```

| Module | Responsibility |
| --- | --- |
| `types.ts` | The MCP primitive type model and `MCP_PROTOCOL_VERSION`. |
| `jsonschema.ts` | Dependency-free JSON Schema subset: `checkSchemaShape()` (usable schema?) and `validate()` (does data conform?). |
| `validate.ts` | MCP-conformance validation of every primitive and the whole `ServerSpec`. |
| `registry.ts` | Runtime harnesses (`ToolRegistry`/`ResourceRegistry`/`PromptRegistry`) to unit-test server logic without a live client. |
| `generate.ts` | The pure generation pipeline: `generateServerFiles(spec)` → files in memory. |
| `scaffold.ts` | The filesystem writer. |
| `uritemplate.ts` | Reusable RFC 6570 level-1 URI-template match/expand helpers. |
| `diff.ts` | Backward-compatibility analysis (`diffSpecs`). |
| `cli.ts` | The command-line entry point. |

Full details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). The roadmap is in
[`ROADMAP.md`](ROADMAP.md).

## Configuration reference (`ServerSpec`)

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | yes | Server + package name; also the scaffold directory. |
| `version` | string | yes | Semantic version string. |
| `title` | string | no | Human-readable display title. |
| `instructions` | string | no | Free text surfaced in the `initialize` result. |
| `tools` | `ToolDefinition[]` | no | `name`, `description`, `inputSchema`; optional `title`/`outputSchema`/`annotations`. |
| `resources` | `ResourceDefinition[]` | no | `uri`, `name`; optional `title`/`description`/`mimeType`. |
| `resourceTemplates` | `ResourceTemplateDefinition[]` | no | `uriTemplate` (must contain a `{var}`), `name`, optional metadata. |
| `prompts` | `PromptDefinition[]` | no | `name`; optional `description`/`title`/`arguments[]`. |
| `auth` | `AuthConfig` | no | `scheme` (`"none"` \| `"bearer"`), optional `tokenEnvVar`, `note`. Allow-with-TODO by default. |

Names match `^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$`; resource URIs must be absolute.

## Auth (defensive)

When `spec.auth` is set, the generated `src/auth.mjs` exposes a pluggable
`authorize(request)` hook. It **defaults to allow-with-TODO** (a place to plug
in real authorization, never a bypass). With `"scheme": "bearer"` it also emits
a commented bearer-token example that reads the expected token from an
environment variable. See [`docs/auth.md`](docs/auth.md).

## Measured results

Numbers below were measured on this repo (Node 24.11, Windows), not estimated:

- **Generated server passes the `initialize` + `tools/list` + `tools/call`
  stdio smoke test.** Verified two ways: an in-process router test and a
  child-process spawn test (`test/integration.test.ts`).
- **18 files** generated from the 3-tool / 2-resource / 1-template / 2-prompt
  example spec.
- **Generated project ships a green 6-test `node:test` suite** out of the box.
- **Cold `node src/server.mjs` → `initialize` response: median ~95 ms** (5 runs:
  86–117 ms), start included.
- Library test suite: **105 tests, all green** (`npm test`) — covering
  validation, the JSON Schema data validator, registries, generation,
  spawn-based server integration, URI-template matching, spec diffing, and the
  CLI end-to-end.

Reproduce: `npm test`, then `node demos/scaffold_and_smoke.mjs`.

## Demos

```sh
# macOS / Linux
demos/run_all.sh
# Windows
demos/run_all.ps1
```

- `demos/validate_gate.mjs` — `validate` as a CI gate (valid → exit 0, invalid → non-zero).
- `demos/scaffold_and_smoke.mjs` — scaffold from `demos/example-spec.json`, then
  run the generated smoke test + tests. Both exit 0.

## FAQ

**Does the generated server (or the library) have runtime dependencies?**
No. Both run on Node built-ins only. `devDependencies` are limited to TypeScript
and `@types/node` for building.

**Do I have to use a full spec?** No. `mcpscaffold new my-server` (no `--spec`)
emits a complete starter server with one tool, resource, template, and prompt.
Use `init-spec` to get a richer example spec to edit.

**Can `validate` still read my old bare tools array?** Yes. `validate` (and
`diffSpecs`) accept either a `ToolDefinition[]` catalog (back-compat) or a full
`ServerSpec`, and detect which you passed.

**What MCP version does it target?** `2025-06-18`. See
[`docs/MCP-CONFORMANCE.md`](docs/MCP-CONFORMANCE.md) for the method/primitive
matrix and what is intentionally out of scope (HTTP transport, subscriptions,
sampling/elicitation, pagination).

**How do I catch a breaking change before I ship it?** Run
`mcpscaffold diff <previous-spec> <current-spec>` in CI; it exits non-zero on any
breaking change. See [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md).

**Is the bearer-auth example a real auth check?** No — it is a commented example
that shows where a real check belongs. The default hook allows every request
with a TODO marker; it is never a bypass. The stdio transport has no HTTP
headers, so a real bearer check belongs in an HTTP transport.

## Scope

Defensive / analytical tooling only. `mcpscaffold` generates and validates MCP
server skeletons; the generated `authorize()` hook is a safe allow-with-TODO
stub, and sample tools are read-only.

## License

License: COCL 1.0 — see [LICENSE](LICENSE) and [DISCLAIMER.md](DISCLAIMER.md).
