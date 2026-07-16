# Usage

A task-oriented guide to the `mcpscaffold` CLI and library. For the primitive
model see [writing-a-serverspec.md](writing-a-serverspec.md); for the internals
see [ARCHITECTURE.md](ARCHITECTURE.md); for backward-compatibility checking see
[COMPATIBILITY.md](COMPATIBILITY.md).

## The CLI

```
mcpscaffold new <name> [--spec <spec.json>] [--dir <path>]
mcpscaffold validate <file> [--json]
mcpscaffold diff <old> <new> [--json]
mcpscaffold list <file>
mcpscaffold init-spec [file]
mcpscaffold --help
```

Every command exits `0` on success and non-zero on failure, so each drops
directly into a shell pipeline or CI step.

### Scaffold a server

```sh
# Starter server (one tool + resource + template + prompt), no spec needed:
mcpscaffold new my-server

# From a full ServerSpec:
mcpscaffold init-spec spec.json
mcpscaffold new my-server --spec spec.json --dir ./out
```

The generated project runs on Node built-ins only:

```sh
cd my-server
npm start                # serve on stdio
npm test                 # generated node:test suite
node scripts/smoke.mjs   # end-to-end initialize + tools/call smoke test
```

### Validate a spec (CI gate)

`validate` accepts either a bare tools array (back-compat) or a full
`ServerSpec`, and runs MCP-conformance checks.

```sh
mcpscaffold validate spec.json
# OK: ServerSpec "example-mcp-server" valid (3 tool(s), 2 resource(s), 1 template(s), 2 prompt(s))
```

For machine-readable output, add `--json`. The exit code still reflects
validity, and stdout is a single JSON document:

```sh
mcpscaffold validate spec.json --json
```

```json
{
  "ok": true,
  "kind": "ServerSpec",
  "issues": []
}
```

On failure, `issues` is a non-empty array of `{ index, kind, tool?, message }`
objects and the command exits `1`:

```sh
mcpscaffold validate broken.json --json | jq '.issues[].message'
```

### Diff two specs (compatibility gate)

`diff` classifies every change between two specs as **breaking** or
**compatible** for a client written against the old spec, and exits non-zero when
any breaking change is present:

```sh
mcpscaffold diff v1.json v2.json
```

```
BREAKING: 1 breaking change(s) from v1.json to v2.json
  BREAKING  - [tool] tool "word_count" removed
  ok        ~ [server] version changed "1.0.0" → "2.0.0"

0 added, 1 removed, 1 changed — 1 breaking
```

`--json` emits the full `SpecDiff` structure. See
[COMPATIBILITY.md](COMPATIBILITY.md) for the complete rule table.

### Inspect a spec

```sh
mcpscaffold list spec.json
```

Pretty-prints tools (with required-argument markers), resources, and prompts.

## The library

`mcpscaffold` is also an importable, dependency-free library.

### Generate files in memory

```ts
import { generateServerFiles, type ServerSpec } from "@cognis-digital/mcpscaffold";

const files = generateServerFiles(spec); // GeneratedFile[] { path, contents }
```

`generateServerFiles` is pure — no filesystem side effects — so you can inspect
or post-process the generated source before writing it.

### Validate programmatically

```ts
import { validateServerSpec, validateAny } from "@cognis-digital/mcpscaffold";

const result = validateServerSpec(spec); // { ok, issues }
if (!result.ok) throw new Error(result.issues.map((i) => i.message).join("\n"));
```

### Diff programmatically

```ts
import { diffSpecs, formatDiff } from "@cognis-digital/mcpscaffold";

const diff = diffSpecs(previousSpec, nextSpec);
if (diff.breaking) {
  console.error(formatDiff(diff));
  process.exit(1);
}
```

### Test server logic without a client

The registries validate inputs and dispatch to your handlers, so you can
unit-test server behavior with no live MCP client:

```ts
import { ToolRegistry } from "@cognis-digital/mcpscaffold";

const tools = new ToolRegistry();
tools.register(
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

await tools.dispatch("add", { a: 2, b: 3 }); // { ok: true, value: 5 }
await tools.dispatch("add", { a: "two" });   // { ok: false, error: DispatchError }
```

### URI-template helpers

Level-1 RFC 6570 helpers, useful when implementing resource-template handlers:

```ts
import {
  matchUriTemplate,
  expandUriTemplate,
  templateVariables,
} from "@cognis-digital/mcpscaffold";

matchUriTemplate("greeting://{who}", "greeting://ada"); // { who: "ada" }
expandUriTemplate("greeting://{who}", { who: "Ada L" }); // "greeting://Ada%20L"
templateVariables("file:///{dir}/{name}");              // ["dir", "name"]
```

## Configuration reference (`ServerSpec`)

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | yes | Server + package name. Also the scaffold directory. |
| `version` | string | yes | Semantic version string. |
| `title` | string | no | Human-readable display title (`serverInfo.title`). |
| `instructions` | string | no | Free text surfaced in the `initialize` result. |
| `tools` | `ToolDefinition[]` | no | `name`, `description`, `inputSchema`, optional `title`/`outputSchema`/`annotations`. |
| `resources` | `ResourceDefinition[]` | no | `uri`, `name`, optional `title`/`description`/`mimeType`. |
| `resourceTemplates` | `ResourceTemplateDefinition[]` | no | `uriTemplate` (must contain a `{var}`), `name`, optional metadata. |
| `prompts` | `PromptDefinition[]` | no | `name`, optional `description`/`title`/`arguments[]`. |
| `auth` | `AuthConfig` | no | `scheme` (`"none"` \| `"bearer"`), optional `tokenEnvVar`, `note`. Allow-with-TODO by default. |

All primitive arrays default to empty. Names must match
`^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$`; resource URIs must be absolute (carry a
scheme).
