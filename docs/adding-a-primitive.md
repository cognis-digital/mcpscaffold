# Guide: adding a tool, resource, or prompt

There are two ways to add a primitive to a generated server.

## A. Regenerate from the spec (recommended)

1. Edit `spec.json` — add your tool/resource/template/prompt.
2. Validate: `mcpscaffold validate spec.json`.
3. Regenerate into a fresh directory and copy over your handler edits, **or**
   run `mcpscaffold new` into a temp dir and diff.

This keeps `spec.json`, `src/server.mjs` wiring, and the handler stubs in sync.

## B. Hand-add to an existing generated project

The generated `src/server.mjs` bakes in three things you must update together.

### Add a tool

1. Create `src/tools/<name>.mjs`:
   ```js
   export function my_tool(args) {
     // args are already schema-validated by the caller if you use ToolRegistry;
     // here they arrive from tools/call.
     return { content: [{ type: "text", text: "…" }] };
   }
   ```
2. In `src/server.mjs`:
   - add `import { my_tool } from "./tools/my_tool.mjs";`
   - add an entry to `TOOLS` (`{ name, description, inputSchema, … }`)
   - add `"my_tool": my_tool,` to `toolHandlers`.

`tools/call` returns your handler's value; if you return a bare object it is
wrapped as `{content:[{type:"text", text: JSON.stringify(value)}]}`. To emit
`structuredContent`, return the full result yourself:
```js
return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out };
```

### Add a resource

1. Create `src/resources/<name>.mjs`:
   ```js
   export function my_res(uri) {
     return { uri, mimeType: "text/plain", text: "…" }; // or { blob: base64 }
   }
   ```
2. In `src/server.mjs`: import it, add to `RESOURCES`, and add
   `"<uri>": my_res,` to `resourceHandlers`.

### Add a resource template

1. Create `src/resource_templates/<name>.mjs` exporting `uriTemplate` and a
   handler `(uri, vars) => ({ uri, mimeType, text })`.
2. In `src/server.mjs`: import both, add to `RESOURCE_TEMPLATES`, and push
   `{ uriTemplate, handler }` into `templateHandlers`.

`resources/read` tries exact URIs first, then each template via the level-1
RFC 6570 matcher, passing the extracted `{var}` bindings to your handler.

### Add a prompt

1. Create `src/prompts/<name>.mjs`:
   ```js
   export function my_prompt(args) {
     return { description: "…", messages: [{ role: "user", content: { type: "text", text: "…" } }] };
   }
   ```
2. In `src/server.mjs`: import it, add to `PROMPTS` (with `arguments`), and add
   `"<name>": my_prompt,` to `promptHandlers`.

## Test it

Add a case to `test/server.test.mjs` (it already covers `initialize`,
`tools/list`, the first tool, a resource, a prompt, and the unknown-method
error), then `npm test`. Re-run `node scripts/smoke.mjs` for an end-to-end check.
