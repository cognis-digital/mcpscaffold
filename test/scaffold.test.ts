import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffold, scaffoldFromSpec, SAMPLE_TOOL } from "../src/scaffold.js";
import { validateTools, validateServerSpec } from "../src/validate.js";
import { EXAMPLE_SPEC } from "../src/spec.js";

test("scaffold writes a valid, runnable starter project", () => {
  const base = mkdtempSync(join(tmpdir(), "mcpscaffold-"));
  try {
    const target = join(base, "myserver");
    const result = scaffold({ name: "myserver", dir: target });

    for (const f of [
      "spec.json",
      "tools.json",
      "src/server.mjs",
      "src/transport.mjs",
      "src/auth.mjs",
      "src/tools/echo.mjs",
      "package.json",
      "README.md",
      ".gitignore",
      "test/server.test.mjs",
      "scripts/smoke.mjs",
    ]) {
      assert.ok(result.files.includes(f), `missing ${f}`);
      assert.ok(existsSync(join(target, f)), `not written: ${f}`);
    }

    // generated catalog validates
    const catalog = JSON.parse(readFileSync(join(target, "tools.json"), "utf8"));
    assert.equal(validateTools(catalog).ok, true);
    assert.equal(catalog[0].name, SAMPLE_TOOL.name);

    // generated spec.json validates as a ServerSpec
    const spec = JSON.parse(readFileSync(join(target, "spec.json"), "utf8"));
    assert.equal(validateServerSpec(spec).ok, true);

    // package.json is well formed and credits Cognis Digital
    const pkg = JSON.parse(readFileSync(join(target, "package.json"), "utf8"));
    assert.equal(pkg.name, "myserver");
    assert.equal(pkg.author, "Cognis Digital");
    assert.equal(pkg.type, "module");
    assert.ok(pkg.scripts.start);
    assert.ok(pkg.scripts.test);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("starter project scaffolds one tool + resource + template + prompt", () => {
  const base = mkdtempSync(join(tmpdir(), "mcpscaffold-"));
  try {
    const target = join(base, "s2");
    scaffold({ name: "s2", dir: target });
    for (const f of [
      "src/resources/readme.mjs",
      "src/resource_templates/greeting.mjs",
      "src/prompts/summarize.mjs",
    ]) {
      assert.ok(existsSync(join(target, f)), `missing ${f}`);
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("scaffoldFromSpec generates one handler file per primitive", () => {
  const base = mkdtempSync(join(tmpdir(), "mcpscaffold-"));
  try {
    const target = join(base, "ex");
    const result = scaffoldFromSpec({ ...EXAMPLE_SPEC, name: "ex" }, target);
    // 3 tools, 2 resources, 1 template, 2 prompts in EXAMPLE_SPEC
    assert.ok(result.files.includes("src/tools/echo.mjs"));
    assert.ok(result.files.includes("src/tools/add.mjs"));
    assert.ok(result.files.includes("src/tools/word_count.mjs"));
    assert.ok(result.files.includes("src/resources/about.mjs"));
    assert.ok(result.files.includes("src/resource_templates/greeting.mjs"));
    assert.ok(result.files.includes("src/prompts/summarize.mjs"));
    assert.ok(result.files.includes("src/prompts/code_review.mjs"));

    // bearer auth example present since EXAMPLE_SPEC.auth.scheme === "bearer"
    const auth = readFileSync(join(target, "src/auth.mjs"), "utf8");
    assert.match(auth, /bearer/i);
    assert.match(auth, /return \{ ok: true \}/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("scaffold refuses bad names and existing dirs", () => {
  const base = mkdtempSync(join(tmpdir(), "mcpscaffold-"));
  try {
    assert.throws(() => scaffold({ name: "bad name", dir: join(base, "x") }), /invalid project name/);
    assert.throws(() => scaffold({ name: "ok", dir: base }), /already exists/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
