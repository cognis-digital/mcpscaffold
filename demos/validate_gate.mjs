#!/usr/bin/env node
// Demo: the `validate` command as a CI gate. Runs it against a VALID spec
// (expects exit 0) and an INVALID one (expects non-zero), then asserts the
// exit codes are what CI would rely on. Exits 0 only if both behave correctly.
//
// Original Cognis Digital implementation.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "dist", "cli.js");
const validSpec = join(here, "example-spec.json");

const base = mkdtempSync(join(tmpdir(), "mcpscaffold-gate-"));
const brokenPath = join(base, "broken.json");
writeFileSync(
  brokenPath,
  JSON.stringify([
    { name: "bad name", description: "", inputSchema: { type: "nope" } },
  ]),
  "utf8"
);

function validate(file) {
  return spawnSync(process.execPath, [cli, "validate", file], { encoding: "utf8", shell: false });
}

try {
  console.log("$ mcpscaffold validate example-spec.json  (expect exit 0)");
  const good = validate(validSpec);
  process.stdout.write(good.stdout);
  process.stderr.write(good.stderr);
  if (good.status !== 0) {
    console.error(`FAIL: valid spec exited ${good.status}, expected 0`);
    process.exit(1);
  }

  console.log("\n$ mcpscaffold validate broken.json  (expect non-zero)");
  const bad = validate(brokenPath);
  process.stdout.write(bad.stdout);
  process.stderr.write(bad.stderr);
  if (bad.status === 0) {
    console.error("FAIL: invalid spec exited 0, expected non-zero (CI would not catch it)");
    process.exit(1);
  }

  console.log(`\nGate OK — valid spec => exit 0, invalid spec => exit ${bad.status}. Drop into CI.`);
} finally {
  rmSync(base, { recursive: true, force: true });
}
process.exit(0);
