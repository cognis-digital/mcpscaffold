/**
 * Minimal, dependency-free JSON Schema validator.
 *
 * Supports the keyword subset that matters for MCP tool inputs:
 *   - type (including the "integer" type and arrays of types)
 *   - required
 *   - properties (recursive)
 *   - items (recursive, for arrays)
 *   - enum
 *
 * Two entry points:
 *   - isWellFormedSchema(): structural check that a value is a usable schema.
 *   - validate(): check that data conforms to a schema, returning errors.
 *
 * Original Cognis Digital implementation. Not a full draft implementation by
 * design; it deliberately covers only the keywords above.
 */

import type { JsonSchema, JsonSchemaType } from "./types.js";

const VALID_TYPES: ReadonlySet<string> = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "object",
  "array",
  "null",
]);

export interface SchemaError {
  /** JSON-pointer-ish path to the offending value, e.g. "/foo/0". */
  path: string;
  message: string;
}

function jsonType(value: unknown): JsonSchemaType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  const t = typeof value;
  if (t === "number") {
    return Number.isInteger(value) ? "integer" : "number";
  }
  if (t === "boolean") return "boolean";
  if (t === "string") return "string";
  if (t === "object") return "object";
  // functions, undefined, symbol, bigint — not representable JSON
  return "null";
}

/** True if a runtime value matches a single declared schema type. */
function matchesType(value: unknown, type: JsonSchemaType): boolean {
  switch (type) {
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    case "array":
      return Array.isArray(value);
    case "object":
      return (
        typeof value === "object" && value !== null && !Array.isArray(value)
      );
    default:
      return false;
  }
}

/**
 * Structural check: is `schema` a usable JSON Schema object per our subset?
 * Returns a list of problems; empty means well-formed.
 */
export function checkSchemaShape(
  schema: unknown,
  path = ""
): SchemaError[] {
  const errors: SchemaError[] = [];
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    errors.push({ path: path || "/", message: "schema must be an object" });
    return errors;
  }
  const s = schema as JsonSchema;

  if (s.type !== undefined) {
    const types = Array.isArray(s.type) ? s.type : [s.type];
    if (types.length === 0) {
      errors.push({ path: `${path}/type`, message: "type must not be empty" });
    }
    for (const t of types) {
      if (typeof t !== "string" || !VALID_TYPES.has(t)) {
        errors.push({
          path: `${path}/type`,
          message: `unknown type "${String(t)}"`,
        });
      }
    }
  }

  if (s.required !== undefined) {
    if (!Array.isArray(s.required)) {
      errors.push({ path: `${path}/required`, message: "required must be an array" });
    } else {
      for (let i = 0; i < s.required.length; i++) {
        if (typeof s.required[i] !== "string") {
          errors.push({
            path: `${path}/required/${i}`,
            message: "required entries must be strings",
          });
        }
      }
    }
  }

  if (s.enum !== undefined && !Array.isArray(s.enum)) {
    errors.push({ path: `${path}/enum`, message: "enum must be an array" });
  }

  if (s.properties !== undefined) {
    if (
      typeof s.properties !== "object" ||
      s.properties === null ||
      Array.isArray(s.properties)
    ) {
      errors.push({
        path: `${path}/properties`,
        message: "properties must be an object",
      });
    } else {
      for (const [key, sub] of Object.entries(s.properties)) {
        errors.push(...checkSchemaShape(sub, `${path}/properties/${key}`));
      }
    }
  }

  if (s.items !== undefined) {
    errors.push(...checkSchemaShape(s.items, `${path}/items`));
  }

  return errors;
}

/** Convenience boolean wrapper around {@link checkSchemaShape}. */
export function isWellFormedSchema(schema: unknown): boolean {
  return checkSchemaShape(schema).length === 0;
}

/**
 * Validate `data` against `schema`. Returns a list of errors; empty == valid.
 */
export function validate(
  data: unknown,
  schema: JsonSchema,
  path = ""
): SchemaError[] {
  const errors: SchemaError[] = [];
  const here = path || "/";

  // type
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(data, t))) {
      errors.push({
        path: here,
        message: `expected type ${types.join(" | ")}, got ${jsonType(data)}`,
      });
      // If the fundamental type is wrong, deeper checks are noise.
      return errors;
    }
  }

  // enum
  if (schema.enum !== undefined && Array.isArray(schema.enum)) {
    const ok = schema.enum.some((candidate) => deepEqual(candidate, data));
    if (!ok) {
      errors.push({
        path: here,
        message: `value not in enum: ${JSON.stringify(schema.enum)}`,
      });
    }
  }

  // object: required + properties
  if (matchesType(data, "object")) {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!Object.prototype.hasOwnProperty.call(obj, key)) {
          errors.push({
            path: `${path}/${key}`,
            message: `missing required property "${key}"`,
          });
        }
      }
    }
    if (schema.properties) {
      for (const [key, sub] of Object.entries(schema.properties)) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          errors.push(...validate(obj[key], sub, `${path}/${key}`));
        }
      }
    }
  }

  // array: items
  if (matchesType(data, "array") && schema.items) {
    const arr = data as unknown[];
    for (let i = 0; i < arr.length; i++) {
      errors.push(...validate(arr[i], schema.items, `${path}/${i}`));
    }
  }

  return errors;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    if (ka.length !== kb.length) return false;
    return ka.every((k) =>
      deepEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k]
      )
    );
  }
  return false;
}
