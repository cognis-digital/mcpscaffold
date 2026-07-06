# Guide: plugging in authorization

`mcpscaffold` scaffolds a **place to plug in** authentication/authorization —
never a bypass. The generated `src/auth.mjs` exports one hook:

```js
export function authorize(request) {
  // DEFENSIVE DEFAULT: allow everything, with a TODO to find later.
  return { ok: true };
}
```

`src/server.mjs` calls `authorize(msg)` before dispatching **every** JSON-RPC
request. Return `{ ok: false, code, message }` to reject; the server turns that
into a JSON-RPC error response (default code `-32001`).

## Why the default is "allow"

A scaffold must run out of the box, and a fail-closed default that rejects
everything would make the generated smoke test and `npm start` fail immediately.
So the default is allow-with-TODO: it is obvious, greppable, and safe to run
locally, but it is clearly a stub you must replace before exposing the server.

## Configuring in the spec

```jsonc
"auth": {
  "scheme": "bearer",              // "none" (default) or "bearer"
  "tokenEnvVar": "MCP_BEARER_TOKEN",
  "note": "Bearer-token hook — disabled by default."
}
```

- `"scheme": "none"` → the plain allow-with-TODO hook.
- `"scheme": "bearer"` → the same allow-with-TODO hook **plus** a commented
  bearer-token example you uncomment and adapt:

  ```js
  // export function authorize(request) {
  //   const expected = process.env[TOKEN_ENV_VAR];
  //   if (!expected) return { ok: true };            // not configured -> allow
  //   const presented = process.env.MCP_PRESENTED_TOKEN; // wire from your transport
  //   if (presented === expected) return { ok: true };
  //   return { ok: false, code: -32001, message: "unauthorized" };
  // }
  ```

## A note on stdio and bearer tokens

The **stdio transport has no HTTP headers**, so there is no standard place for a
bearer token on stdio — a real bearer check belongs in an HTTP transport (out of
scope here). The generated example reads a shared secret from the environment as
a stand-in so the *shape* of the hook is clear. When you add an HTTP transport,
pass the presented credential into `authorize(request)` and decide there.

## Where to enforce

`authorize(request)` receives the full JSON-RPC message, so you can allow
`initialize`/`ping` unauthenticated while gating `tools/call`:

```js
export function authorize(request) {
  if (request.method === "initialize" || request.method === "ping") return { ok: true };
  // ... check credentials for everything else ...
  return { ok: true };
}
```
