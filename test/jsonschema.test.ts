import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validate,
  isWellFormedSchema,
  checkSchemaShape,
} from "../src/jsonschema.js";
import type { JsonSchema } from "../src/types.js";

test("isWellFormedSchema accepts a typical object schema", () => {
  const schema: JsonSchema = {
    type: "object",
    properties: { a: { type: "string" }, n: { type: "integer" } },
    required: ["a"],
  };
  assert.equal(isWellFormedSchema(schema), true);
});

test("checkSchemaShape rejects unknown type and bad required", () => {
  const errs = checkSchemaShape({ type: "stringy", required: "a" });
  assert.ok(errs.length >= 2);
});

test("validate passes good object", () => {
  const schema: JsonSchema = {
    type: "object",
    properties: { a: { type: "string" } },
    required: ["a"],
  };
  assert.deepEqual(validate({ a: "hi" }, schema), []);
});

test("validate flags missing required + wrong type", () => {
  const schema: JsonSchema = {
    type: "object",
    properties: { a: { type: "string" }, n: { type: "integer" } },
    required: ["a", "n"],
  };
  const errs = validate({ n: 1.5 }, schema);
  // missing "a" and n is not an integer
  assert.ok(errs.some((e) => /missing required property "a"/.test(e.message)));
  assert.ok(errs.some((e) => /expected type integer/.test(e.message)));
});

test("validate enforces enum", () => {
  const schema: JsonSchema = { type: "string", enum: ["red", "green"] };
  assert.deepEqual(validate("red", schema), []);
  assert.ok(validate("blue", schema).length === 1);
});

test("validate recurses into arrays", () => {
  const schema: JsonSchema = { type: "array", items: { type: "integer" } };
  assert.deepEqual(validate([1, 2, 3], schema), []);
  assert.equal(validate([1, "x", 3], schema).length, 1);
});

test("integer vs number distinction", () => {
  assert.deepEqual(validate(5, { type: "integer" }), []);
  assert.equal(validate(5.5, { type: "integer" }).length, 1);
  assert.deepEqual(validate(5.5, { type: "number" }), []);
});
