#!/usr/bin/env node
// Portable test runner: enumerate the compiled *.test.js files under
// dist-test/test and pass them to `node --test <files...>` (explicit paths, no
// glob). This works identically on Node 20 / 22 / 24 and on Windows + POSIX,
// where shell glob expansion and `node --test <glob>` are unreliable.
// Original Cognis Digital implementation.

import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const testDir = join(here, "..", "dist-test", "test");

let files;
try {
  files = readdirSync(testDir)
    .filter((f) => f.endsWith(".test.js"))
    .map((f) => join(testDir, f));
} catch {
  console.error(`cannot read ${testDir} — run the build first (npm run build:test).`);
  process.exit(1);
}

if (files.length === 0) {
  console.error(`no test files found in ${testDir}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
  shell: false,
});
process.exit(result.status ?? 1);
