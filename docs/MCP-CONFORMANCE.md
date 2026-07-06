# MCP conformance

**Target spec version: [`2025-06-18`](https://modelcontextprotocol.io/specification/2025-06-18)**
(the value of `MCP_PROTOCOL_VERSION`). Generated servers advertise and negotiate
this version in `initialize`.

This document states exactly which methods and primitive shapes a generated
server implements, and what is intentionally out of scope.

## Transport

| Aspect | Status |
| --- | --- |
| **stdio** (newline-delimited JSON-RPC, UTF-8) | ✅ Implemented. Each message is one line; `JSON.stringify` guarantees no embedded newlines. stdout carries only protocol messages; logs go to stderr. |
| **Streamable HTTP / SSE** | ❌ Out of scope (see issues). stdio is the recommended default transport for local servers. |

## Lifecycle

| Method / notification | Status | Notes |
| --- | --- | --- |
| `initialize` | ✅ | Returns `protocolVersion`, `capabilities`, `serverInfo` (`name`, `version`, `title?`), `instructions?`. Version negotiation: echoes the client's version if it matches ours, else offers ours. |
| `notifications/initialized` | ✅ | Accepted and ignored (no response), per spec (notifications have no `id`). |
| `ping` | ✅ | Returns `{}`. |
| Shutdown | ✅ (transport-level) | Server exits when stdin closes; no explicit shutdown message exists in the spec. |

## Tools

| Method | Status |
| --- | --- |
| `tools/list` | ✅ Returns `{tools: [...]}`. Each tool carries `name`, `description`, `inputSchema`, and — when present — `title`, `outputSchema`, `annotations`. |
| `tools/call` | ✅ Returns `{content: [{type:"text", text}], structuredContent?, isError?}`. Handler throws become `{content:[...], isError:true}`; unknown tool → `-32602`. |

`outputSchema` and `annotations` (`readOnlyHint`/`destructiveHint`/
`idempotentHint`/`openWorldHint`/`title`) are modeled in `ToolDefinition`,
validated, advertised in `tools/list`, and preserved through the generator.
Emitting `structuredContent` that conforms to `outputSchema` is left to the
generated handler (the `echo`/`add` samples show the shape).

## Resources

| Method | Status |
| --- | --- |
| `resources/list` | ✅ `{resources: [{uri, name, title?, description?, mimeType?}]}`. |
| `resources/read` | ✅ `{contents: [{uri, mimeType?, text? \| blob?}]}`. Exact-URI match first, then resource templates; no match → `-32002` (resource not found). |
| `resources/templates/list` | ✅ `{resourceTemplates: [{uriTemplate, name, title?, description?, mimeType?}]}`. |
| `resources/subscribe` / `notifications/resources/updated` | ❌ Out of scope (see issues). Generated servers advertise `resources.subscribe: false`. |

Resource-template matching implements RFC 6570 **level 1** (`{var}` simple string
expansion) — enough for the common `scheme://{id}` shape. Higher levels
(`{+var}`, `{?query}`, etc.) are not expanded.

## Prompts

| Method | Status |
| --- | --- |
| `prompts/list` | ✅ `{prompts: [{name, title?, description?, arguments:[{name, description?, required?}]}]}`. |
| `prompts/get` | ✅ `{description?, messages: [{role, content:{type:"text", text}}]}`. Missing required args are caught by `PromptRegistry` before the handler runs. |

Prompt message content is generated as `text`. `image`/`audio`/embedded-resource
content types are valid per spec but not emitted by the scaffolder's stubs.

## Error codes

Generated servers use the standard JSON-RPC / MCP codes:

| Code | Meaning | Used for |
| --- | --- | --- |
| `-32700` | Parse error | Unparseable stdin line. |
| `-32601` | Method not found | Unknown JSON-RPC method. |
| `-32602` | Invalid params | Unknown tool/prompt name. |
| `-32002` | Resource not found | `resources/read` with no matching URI/template. |
| `-32001` | (implementation) | Default code the auth hook returns on rejection. |

## Capabilities

`initialize` advertises only the capabilities backed by the spec's primitives:
`tools` if any tools, `resources` if any resources or templates, `prompts` if
any prompts. Sub-capabilities (`listChanged`, `subscribe`) are advertised as
`false` because list-change notifications and subscriptions are out of scope.

## Intentionally out of scope

- Streamable HTTP / SSE transport and session management.
- Resource subscriptions and `*/list_changed` notifications.
- Pagination (`cursor`/`nextCursor`) — generated `*/list` returns everything.
- Client features: sampling, elicitation, roots.
- Utilities: completion, logging, progress, cancellation.

These are deliberate scope choices for a local, stdio-first scaffolder, not
spec misunderstandings. Several are tracked as enhancement issues.
