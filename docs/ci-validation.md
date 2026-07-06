# Guide: validating your spec in CI

`mcpscaffold validate <file>` exits **non-zero** on any problem, so it drops
straight into a CI pipeline as a gate. It accepts either a bare tools array or a
full `ServerSpec` and auto-detects which.

```sh
$ mcpscaffold validate spec.json && echo "spec ok"
OK: ServerSpec "my-server" valid (2 tool(s), 1 resource(s), 1 template(s), 1 prompt(s))
spec ok

$ mcpscaffold validate broken.json ; echo "exit=$?"
FAIL: tool catalog — 3 issue(s)
  - tool[0] (bad name): name "bad name" does not match /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/
  - tool[0] (bad name): missing or empty description
  - tool[0] (bad name): inputSchema at /type: unknown type "nope"
exit=1
```

## GitHub Actions

```yaml
name: validate-mcp-spec
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22" }
      - run: npx @cognis-digital/mcpscaffold validate spec.json
```

## Pre-commit hook

```sh
#!/bin/sh
# .git/hooks/pre-commit
npx @cognis-digital/mcpscaffold validate spec.json || {
  echo "spec.json failed MCP validation — commit aborted." >&2
  exit 1
}
```

## Programmatic

```ts
import { validateAny } from "@cognis-digital/mcpscaffold";
import { readFileSync } from "node:fs";

const result = validateAny(JSON.parse(readFileSync("spec.json", "utf8")));
if (!result.ok) {
  for (const i of result.issues) console.error(i.message);
  process.exit(1);
}
```

See [MCP-CONFORMANCE.md](MCP-CONFORMANCE.md) for the exact rules enforced.
