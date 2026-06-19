import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTools, validateTool } from "../src/validate.js";

const goodTool = {
  name: "search_docs",
  description: "Search the documentation corpus.",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  },
};

test("validateTools passes a clean catalog", () => {
  const result = validateTools([goodTool]);
  assert.equal(result.ok, true);
  assert.equal(result.issues.length, 0);
});

test("validateTools rejects non-array", () => {
  const result = validateTools({ not: "an array" });
  assert.equal(result.ok, false);
  assert.equal(result.issues[0].index, -1);
});

test("validateTool flags bad name format", () => {
  const issues = validateTool(
    { name: "has spaces", description: "x", inputSchema: { type: "object" } },
    0
  );
  assert.ok(issues.some((i) => /does not match/.test(i.message)));
});

test("validateTool flags empty description and missing schema", () => {
  const issues = validateTool({ name: "ok_name", description: "   " }, 0);
  assert.ok(issues.some((i) => /empty description/.test(i.message)));
  assert.ok(issues.some((i) => /missing inputSchema/.test(i.message)));
});

test("validateTool flags malformed inputSchema", () => {
  const issues = validateTool(
    { name: "ok_name", description: "fine", inputSchema: { type: "bogus" } },
    0
  );
  assert.ok(issues.some((i) => /inputSchema/.test(i.message)));
});

test("validateTools detects duplicate names", () => {
  const result = validateTools([goodTool, { ...goodTool }]);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => /duplicate tool name/.test(i.message)));
});
