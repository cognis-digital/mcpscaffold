import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EXAMPLE_SPEC } from "../src/spec.js";

/**
 * End-to-end CLI tests: run the *built* `dist/cli.js` as a child process (as a
 * user would) and assert on stdout/stderr/exit code. Requires `npm run build`
 * to have produced dist/cli.js — the `pretest` script guarantees this.
 */
const here = dirname(fileURLToPath(import.meta.url)); // dist-test/test
const CLI = join(here, "..", "..", "dist", "cli.js");

interface Run {
  status: number;
  stdout: string;
  stderr: string;
}

function run(args: string[], cwd?: string): Run {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    cwd,
    shell: false,
  });
  return { status: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function withTmp<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "mcpcli-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("cli built artifact exists", () => {
  assert.ok(existsSync(CLI), `expected ${CLI} to exist (run npm run build)`);
});

test("--help prints usage including new subcommands and exits 0", () => {
  const r = run(["--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
  assert.match(r.stdout, /mcpscaffold diff/);
  assert.match(r.stdout, /validate <file> \[--json\]/);
});

test("no arguments prints usage and exits non-zero", () => {
  const r = run([]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Usage:/);
});

test("unknown command exits non-zero", () => {
  const r = run(["frobnicate"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown command/);
});

test("init-spec writes a spec that then validates OK", () =>
  withTmp((dir) => {
    const specPath = join(dir, "spec.json");
    const gen = run(["init-spec", specPath]);
    assert.equal(gen.status, 0);
    assert.ok(existsSync(specPath));

    const val = run(["validate", specPath]);
    assert.equal(val.status, 0);
    assert.match(val.stdout, /OK: ServerSpec/);
  }));

test("init-spec refuses to overwrite an existing file", () =>
  withTmp((dir) => {
    const specPath = join(dir, "spec.json");
    writeFileSync(specPath, "{}", "utf8");
    const r = run(["init-spec", specPath]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /refusing to overwrite/);
  }));

test("validate --json emits machine-readable output and exits 0 for a valid spec", () =>
  withTmp((dir) => {
    const specPath = join(dir, "spec.json");
    writeFileSync(specPath, JSON.stringify(EXAMPLE_SPEC), "utf8");
    const r = run(["validate", specPath, "--json"]);
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.kind, "ServerSpec");
    assert.deepEqual(parsed.issues, []);
  }));

test("validate flags a broken tool catalog with a non-zero exit and issue detail", () =>
  withTmp((dir) => {
    const badPath = join(dir, "bad.json");
    writeFileSync(
      badPath,
      JSON.stringify([{ name: "bad name", description: "", inputSchema: { type: "nope" } }]),
      "utf8"
    );
    const human = run(["validate", badPath]);
    assert.equal(human.status, 1);
    assert.match(human.stderr, /FAIL: tool catalog/);

    const asJson = run(["validate", badPath, "--json"]);
    assert.equal(asJson.status, 1);
    const parsed = JSON.parse(asJson.stdout);
    assert.equal(parsed.ok, false);
    assert.ok(parsed.issues.length >= 1);
    assert.ok(parsed.issues.some((i: { message: string }) => /does not match/.test(i.message)));
  }));

test("validate reports invalid JSON with a clear error", () =>
  withTmp((dir) => {
    const p = join(dir, "broken.json");
    writeFileSync(p, "{ not json", "utf8");
    const r = run(["validate", p]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /invalid JSON/);
  }));

test("list pretty-prints a ServerSpec", () =>
  withTmp((dir) => {
    const specPath = join(dir, "spec.json");
    writeFileSync(specPath, JSON.stringify(EXAMPLE_SPEC), "utf8");
    const r = run(["list", specPath]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /tool\(s\)/);
    assert.match(r.stdout, /add/);
  }));

test("new --spec scaffolds a project into a fresh directory", () =>
  withTmp((dir) => {
    const specPath = join(dir, "spec.json");
    writeFileSync(specPath, JSON.stringify({ ...EXAMPLE_SPEC, name: "demo-x" }), "utf8");
    const target = join(dir, "out");
    const r = run(["new", "demo-x", "--spec", specPath, "--dir", target]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Scaffolded MCP server/);
    assert.ok(existsSync(join(target, "src", "server.mjs")));
    assert.ok(existsSync(join(target, "package.json")));
  }));

test("diff exits 0 for identical specs and 1 for a breaking change", () =>
  withTmp((dir) => {
    const v1 = join(dir, "v1.json");
    writeFileSync(v1, JSON.stringify(EXAMPLE_SPEC), "utf8");

    const same = run(["diff", v1, v1]);
    assert.equal(same.status, 0);
    assert.match(same.stdout, /no surface changes/);

    // v2 removes a tool -> breaking.
    const v2spec = JSON.parse(readFileSync(v1, "utf8"));
    v2spec.version = "2.0.0";
    v2spec.tools = v2spec.tools.filter((t: { name: string }) => t.name !== "word_count");
    const v2 = join(dir, "v2.json");
    writeFileSync(v2, JSON.stringify(v2spec), "utf8");

    const breaking = run(["diff", v1, v2]);
    assert.equal(breaking.status, 1);
    assert.match(breaking.stderr, /BREAKING/);
    assert.match(breaking.stderr, /word_count/);
  }));

test("diff --json returns the structured diff and a breaking exit code", () =>
  withTmp((dir) => {
    const v1 = join(dir, "v1.json");
    const v2 = join(dir, "v2.json");
    writeFileSync(v1, JSON.stringify(EXAMPLE_SPEC), "utf8");
    const v2spec = JSON.parse(JSON.stringify(EXAMPLE_SPEC));
    v2spec.tools = v2spec.tools.filter((t: { name: string }) => t.name !== "echo");
    writeFileSync(v2, JSON.stringify(v2spec), "utf8");

    const r = run(["diff", v1, v2, "--json"]);
    assert.equal(r.status, 1);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.breaking, true);
    assert.equal(parsed.summary.removed, 1);
    assert.ok(parsed.changes.some((c: { detail: string }) => /echo/.test(c.detail)));
  }));

test("diff usage error when a file argument is missing", () => {
  const r = run(["diff", "only-one.json"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /usage: mcpscaffold diff/);
});
