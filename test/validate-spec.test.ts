import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateResource,
  validateResourceTemplate,
  validatePrompt,
  validateServerSpec,
  validateAny,
  isServerSpec,
} from "../src/validate.js";
import { EXAMPLE_SPEC, starterSpec } from "../src/spec.js";

test("EXAMPLE_SPEC and starterSpec are valid ServerSpecs", () => {
  assert.equal(validateServerSpec(EXAMPLE_SPEC).ok, true);
  assert.equal(validateServerSpec(starterSpec("demo")).ok, true);
});

test("validateResource requires a well-formed absolute uri", () => {
  assert.equal(validateResource({ name: "r", uri: "info://x" }, 0).length, 0);
  const bad = validateResource({ name: "r", uri: "not-a-uri" }, 0);
  assert.ok(bad.some((i) => /well-formed absolute URI/.test(i.message)));
});

test("validateResource flags bad name", () => {
  const issues = validateResource({ name: "bad name", uri: "info://x" }, 0);
  assert.ok(issues.some((i) => /does not match/.test(i.message)));
});

test("validateResourceTemplate requires a {variable}", () => {
  assert.equal(
    validateResourceTemplate({ name: "t", uriTemplate: "file:///{path}" }, 0).length,
    0
  );
  const noVar = validateResourceTemplate({ name: "t", uriTemplate: "file:///static" }, 0);
  assert.ok(noVar.some((i) => /no \{variable\}/.test(i.message)));
});

test("validatePrompt checks argument shapes and uniqueness", () => {
  assert.equal(
    validatePrompt(
      { name: "p", arguments: [{ name: "a", required: true }] },
      0
    ).length,
    0
  );
  const dup = validatePrompt(
    { name: "p", arguments: [{ name: "a" }, { name: "a" }] },
    0
  );
  assert.ok(dup.some((i) => /duplicate argument name/.test(i.message)));
  const badReq = validatePrompt(
    { name: "p", arguments: [{ name: "a", required: "yes" }] },
    0
  );
  assert.ok(badReq.some((i) => /required must be a boolean/.test(i.message)));
});

test("validateServerSpec requires name and version", () => {
  const r = validateServerSpec({ tools: [] });
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => /spec.name is required/.test(i.message)));
  assert.ok(r.issues.some((i) => /spec.version is required/.test(i.message)));
});

test("validateServerSpec catches duplicate uris across resources", () => {
  const r = validateServerSpec({
    name: "x",
    version: "1.0.0",
    resources: [
      { name: "a", uri: "info://same" },
      { name: "b", uri: "info://same" },
    ],
  });
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => /duplicate resource uri/.test(i.message)));
});

test("validateServerSpec rejects bad auth scheme", () => {
  const r = validateServerSpec({
    name: "x",
    version: "1.0.0",
    auth: { scheme: "oauth" as never },
  });
  assert.ok(r.issues.some((i) => /auth.scheme must be/.test(i.message)));
});

test("isServerSpec distinguishes spec from tools array", () => {
  assert.equal(isServerSpec({ name: "x", version: "1" }), true);
  assert.equal(isServerSpec([{ name: "t" }]), false);
});

test("validateAny accepts both a tools array and a ServerSpec", () => {
  assert.equal(
    validateAny([
      { name: "t", description: "d", inputSchema: { type: "object" } },
    ]).ok,
    true
  );
  assert.equal(validateAny(EXAMPLE_SPEC).ok, true);
});
