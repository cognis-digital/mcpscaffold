# Guide: writing a ServerSpec

A `ServerSpec` is a single JSON document that fully describes an MCP server to
generate. Start from the example:

```sh
mcpscaffold init-spec spec.json
mcpscaffold validate spec.json
mcpscaffold new my-server --spec spec.json
```

## Shape

```jsonc
{
  "name": "my-server",          // required; also the package name (must match NAME_PATTERN)
  "version": "1.0.0",           // required
  "title": "My Server",         // optional display name
  "instructions": "…",          // optional; surfaced in the initialize result
  "tools": [ /* ToolDefinition[] */ ],
  "resources": [ /* ResourceDefinition[] */ ],
  "resourceTemplates": [ /* ResourceTemplateDefinition[] */ ],
  "prompts": [ /* PromptDefinition[] */ ],
  "auth": { "scheme": "none" | "bearer", "tokenEnvVar": "…", "note": "…" }
}
```

All primitive arrays are optional (default empty).

## Tool

```jsonc
{
  "name": "add",                         // NAME_PATTERN: ^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$
  "title": "Add integers",               // optional
  "description": "Add two integers.",    // required, non-empty
  "inputSchema": {                       // required; JSON Schema subset
    "type": "object",
    "properties": { "a": { "type": "integer" }, "b": { "type": "integer" } },
    "required": ["a", "b"]
  },
  "outputSchema": {                      // optional; describes structuredContent
    "type": "object",
    "properties": { "sum": { "type": "integer" } },
    "required": ["sum"]
  },
  "annotations": {                       // optional behavioral hints
    "readOnlyHint": true,
    "idempotentHint": true,
    "openWorldHint": false
  }
}
```

Supported schema keywords: `type` (incl. `integer` and type arrays),
`required`, `properties`, `items`, `enum`, `description`.

## Resource

```jsonc
{
  "uri": "info://about",        // required; absolute URI with a scheme (URI_PATTERN)
  "name": "about",              // required; NAME_PATTERN
  "title": "About",             // optional
  "description": "…",           // optional
  "mimeType": "text/markdown"   // optional
}
```

## Resource template

```jsonc
{
  "uriTemplate": "weather://{city}",  // required; must contain a {variable}
  "name": "weather_by_city",
  "title": "Weather by city",
  "description": "…",
  "mimeType": "application/json"
}
```

## Prompt

```jsonc
{
  "name": "summarize",
  "title": "Summarize text",
  "description": "…",
  "arguments": [
    { "name": "text", "description": "The text to summarize.", "required": true },
    { "name": "style", "required": false }
  ]
}
```

## Validation rules enforced

`mcpscaffold validate spec.json` checks:

- `name` and `version` present and non-empty.
- Every tool/resource/template/prompt name matches `NAME_PATTERN`.
- Every resource `uri` and template `uriTemplate` is a well-formed absolute URI;
  templates must contain at least one `{variable}`.
- `inputSchema`/`outputSchema` are well-formed per the JSON Schema subset.
- Prompt arguments have string names, boolean `required`, no duplicates.
- Names are unique within each primitive; resource URIs are unique.
- `auth.scheme` is `"none"` or `"bearer"`.

Any violation → non-zero exit (see [ci-validation.md](ci-validation.md)).
