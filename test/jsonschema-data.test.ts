import { test } from "node:test";
import assert from "node:assert/strict";
import { validate } from "../src/jsonschema.js";
import type { JsonSchema } from "../src/types.js";

/**
 * Focused coverage of the runtime data validator `validate(data, schema)` — the
 * function the registries use to gate tool arguments. The existing suite covers
 * schema *shape* checking; these exercise data *conformance* across the keyword
 * subset (type, integer vs number, type arrays, required, nested properties,
 * array items, enum).
 */

test("valid object with required + typed properties passes", () => {
  const schema: JsonSchema = {
    type: "object",
    properties: { a: { type: "integer" }, b: { type: "string" } },
    required: ["a", "b"],
  };
  assert.deepEqual(validate({ a: 1, b: "x" }, schema), []);
});

test("missing required property is reported with a pointer path", () => {
  const schema: JsonSchema = {
    type: "object",
    properties: { a: { type: "integer" } },
    required: ["a"],
  };
  const errs = validate({}, schema);
  assert.equal(errs.length, 1);
  assert.equal(errs[0].path, "/a");
  assert.match(errs[0].message, /missing required property "a"/);
});

test("integer type rejects a non-integer number", () => {
  const errs = validate(1.5, { type: "integer" });
  assert.equal(errs.length, 1);
  assert.match(errs[0].message, /expected type integer/);
});

test("number type accepts an integer value", () => {
  assert.deepEqual(validate(3, { type: "number" }), []);
});

test("number type rejects a non-finite value", () => {
  // Infinity is a JS number but not a valid JSON number.
  const errs = validate(Infinity, { type: "number" });
  assert.equal(errs.length, 1);
});

test("type array accepts any listed type", () => {
  const schema: JsonSchema = { type: ["string", "null"] };
  assert.deepEqual(validate("x", schema), []);
  assert.deepEqual(validate(null, schema), []);
  assert.equal(validate(5, schema).length, 1);
});

test("wrong fundamental type short-circuits deeper checks", () => {
  const schema: JsonSchema = {
    type: "object",
    properties: { a: { type: "integer" } },
    required: ["a"],
  };
  // Passing a string yields exactly one error (the type mismatch), not also a
  // spurious 'missing required' error.
  const errs = validate("not an object", schema);
  assert.equal(errs.length, 1);
  assert.match(errs[0].message, /expected type object/);
});

test("nested object errors carry the full path", () => {
  const schema: JsonSchema = {
    type: "object",
    properties: {
      user: {
        type: "object",
        properties: { age: { type: "integer" } },
        required: ["age"],
      },
    },
    required: ["user"],
  };
  const errs = validate({ user: { age: "old" } }, schema);
  assert.equal(errs.length, 1);
  assert.equal(errs[0].path, "/user/age");
});

test("array items are validated element-by-element with indexed paths", () => {
  const schema: JsonSchema = { type: "array", items: { type: "integer" } };
  const errs = validate([1, "two", 3, "four"], schema);
  assert.equal(errs.length, 2);
  assert.equal(errs[0].path, "/1");
  assert.equal(errs[1].path, "/3");
});

test("enum accepts a listed value and rejects an unlisted one", () => {
  const schema: JsonSchema = { enum: ["red", "green", "blue"] };
  assert.deepEqual(validate("green", schema), []);
  const errs = validate("purple", schema);
  assert.equal(errs.length, 1);
  assert.match(errs[0].message, /value not in enum/);
});

test("enum works with non-string members via deep equality", () => {
  const schema: JsonSchema = { enum: [1, 2, { k: "v" }] };
  assert.deepEqual(validate({ k: "v" }, schema), []);
  assert.equal(validate({ k: "other" }, schema).length, 1);
});

test("a property not listed in the schema is ignored (open by default)", () => {
  const schema: JsonSchema = {
    type: "object",
    properties: { a: { type: "integer" } },
  };
  assert.deepEqual(validate({ a: 1, extra: "ignored" }, schema), []);
});

test("empty schema accepts anything", () => {
  assert.deepEqual(validate({ anything: [1, 2, 3] }, {}), []);
  assert.deepEqual(validate(42, {}), []);
});
