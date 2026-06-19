import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffold, SAMPLE_TOOL } from "../src/scaffold.js";
import { validateTools } from "../src/validate.js";

test("scaffold writes a valid, runnable project", () => {
  const base = mkdtempSync(join(tmpdir(), "mcpscaffold-"));
  try {
    const target = join(base, "myserver");
    const result = scaffold({ name: "myserver", dir: target });

    // expected files exist
    for (const f of ["tools.json", "src/server.mjs", "src/tools/echo.mjs", "package.json", "README.md", ".gitignore"]) {
      assert.ok(result.files.includes(f), `missing ${f}`);
      assert.ok(existsSync(join(target, f)), `not written: ${f}`);
    }

    // generated catalog validates
    const catalog = JSON.parse(readFileSync(join(target, "tools.json"), "utf8"));
    assert.equal(validateTools(catalog).ok, true);
    assert.equal(catalog[0].name, SAMPLE_TOOL.name);

    // generated package.json is well formed and credits Cognis Digital
    const pkg = JSON.parse(readFileSync(join(target, "package.json"), "utf8"));
    assert.equal(pkg.name, "myserver");
    assert.equal(pkg.author, "Cognis Digital");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("scaffold refuses bad names and existing dirs", () => {
  const base = mkdtempSync(join(tmpdir(), "mcpscaffold-"));
  try {
    assert.throws(() => scaffold({ name: "bad name", dir: join(base, "x") }), /invalid project name/);
    // base already exists
    assert.throws(() => scaffold({ name: "ok", dir: base }), /already exists/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
