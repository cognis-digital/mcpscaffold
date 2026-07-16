# Backward-compatibility checking

An MCP server is a contract. When you evolve it, some changes are safe for
existing clients and some silently break them — and the failures are quiet:
a client that calls a removed tool, or omits an argument that just became
required, gets an error at runtime rather than a clear signal at review time.

`mcpscaffold diff <old> <new>` compares two spec revisions, classifies every
change as **breaking** or **compatible** *from the perspective of a client
written against the old spec*, and exits non-zero if any breaking change is
present. Programmatically the same logic is `diffSpecs(before, after)`.

## Classification rules

Direction is always old → new.

### Tools

| Change | Classification |
| --- | --- |
| Tool removed | **breaking** — callers of it fail |
| Tool added | compatible |
| Input: new **required** property | **breaking** — old callers omit it |
| Input: new **optional** property | compatible |
| Input: existing property becomes required | **breaking** |
| Input: required property relaxed to optional | compatible (loosening) |
| Input: property **type** changed | **breaking** |
| Input: property removed | compatible (server ignores extra input) |
| `description` / `title` changed | compatible (recorded) |
| `outputSchema` added / removed | compatible (recorded) |

### Resources (keyed by `uri`)

| Change | Classification |
| --- | --- |
| Resource removed | **breaking** |
| Resource added | compatible |
| `name` / `description` / `mimeType` changed | compatible (recorded) |

### Resource templates (keyed by `name`)

| Change | Classification |
| --- | --- |
| Template removed | **breaking** |
| `uriTemplate` changed | **breaking** — previously-matching URIs stop matching |
| Template added | compatible |

### Prompts (keyed by `name`)

| Change | Classification |
| --- | --- |
| Prompt removed | **breaking** |
| New **required** argument | **breaking** |
| New **optional** argument | compatible |
| Argument becomes required | **breaking** |
| Argument relaxed to optional | compatible |
| Argument removed | compatible |

### Server identity

| Change | Classification |
| --- | --- |
| `name` changed | **breaking** — server identity |
| `version` changed | compatible (recorded) |
| `instructions` changed | compatible (recorded) |

Server-identity changes are only reported when **both** inputs are full
`ServerSpec`s; two bare tool catalogs produce only tool-level changes.

## Output shape

`diffSpecs` returns a `SpecDiff`:

```ts
interface SpecDiff {
  changes: SpecChange[];         // breaking-first, then removed → changed → added
  breaking: boolean;             // true if any change is breaking
  summary: { added: number; removed: number; changed: number; breaking: number };
}

interface SpecChange {
  kind: "added" | "removed" | "changed";
  target: "tool" | "resource" | "resourceTemplate" | "prompt" | "server";
  name: string;                  // tool/prompt/template name, resource uri, or ""
  breaking: boolean;
  detail: string;                // human-readable explanation
}
```

## In CI

Run the diff between the previous published spec and the current one on every
pull request; fail the job when a breaking change is not accompanied by a major
version bump:

```yaml
- name: Check MCP spec compatibility
  run: |
    git show origin/main:spec.json > /tmp/prev-spec.json
    npx @cognis-digital/mcpscaffold diff /tmp/prev-spec.json spec.json
```

Because `diff` exits `1` on any breaking change, this step turns an accidental
contract break into a red check instead of a runtime surprise for clients.
