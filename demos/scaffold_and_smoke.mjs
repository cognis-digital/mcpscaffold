#!/usr/bin/env node
// Demo: scaffold a full MCP server from demos/example-spec.json into a temp
// dir, then run the generated server's end-to-end smoke test (initialize +
// tools/list + tools/call over stdio). Exits 0 on success. Cross-platform.
//
// Original Cognis Digital implementation.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const cli = join(repoRoot, "dist", "cli.js");
const specPath = join(here, "example-spec.json");

if (!existsSync(cli)) {
  console.error("dist/cli.js not found — run `npm run build` first.");
  process.exit(1);
}

function run(label, cmd, args, opts = {}) {
  console.log(`\n$ ${label}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: false, ...opts });
  if (r.status !== 0) {
    console.error(`FAILED: ${label} (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

const base = mkdtempSync(join(tmpdir(), "mcpscaffold-demo-"));
const projectDir = join(base, "weather-desk");
try {
  run("mcpscaffold validate example-spec.json", process.execPath, [cli, "validate", specPath]);
  run(
    "mcpscaffold new weather-desk --spec example-spec.json",
    process.execPath,
    [cli, "new", "weather-desk", "--spec", specPath, "--dir", projectDir]
  );

  const t0 = Date.now();
  run("(generated) node scripts/smoke.mjs", process.execPath, [join(projectDir, "scripts", "smoke.mjs")]);
  run("(generated) node --test test/*.test.mjs", process.execPath, ["--test", join(projectDir, "test", "server.test.mjs")]);
  console.log(`\nDemo OK — scaffolded + smoke-tested a server in ${Date.now() - t0} ms of runtime after generation.`);
} finally {
  rmSync(base, { recursive: true, force: true });
}
process.exit(0);
