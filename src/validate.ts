/**
 * Validation of MCP tool-definition catalogs.
 *
 * Rules enforced:
 *   - each entry is an object with name/description/inputSchema
 *   - name matches a conservative identifier format
 *   - description is a non-empty string
 *   - inputSchema is a well-formed JSON Schema (per our subset)
 *   - names are unique across the catalog
 *
 * Original Cognis Digital implementation.
 */

import { checkSchemaShape } from "./jsonschema.js";
import type {
  ToolDefinition,
  ValidationIssue,
  ValidationResult,
} from "./types.js";

/** Tool names: letters/digits/underscore/hyphen/dot, 1-64 chars, must start alnum. */
export const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

/** Validate a single tool definition, returning issues for the given index. */
export function validateTool(tool: unknown, index: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (typeof tool !== "object" || tool === null || Array.isArray(tool)) {
    issues.push({ index, message: "tool must be an object" });
    return issues;
  }
  const t = tool as Partial<ToolDefinition>;
  const named = typeof t.name === "string" ? t.name : undefined;

  // name
  if (typeof t.name !== "string" || t.name.length === 0) {
    issues.push({ index, tool: named, message: "missing or non-string name" });
  } else if (!NAME_PATTERN.test(t.name)) {
    issues.push({
      index,
      tool: named,
      message: `name "${t.name}" does not match ${NAME_PATTERN}`,
    });
  }

  // description
  if (typeof t.description !== "string" || t.description.trim().length === 0) {
    issues.push({
      index,
      tool: named,
      message: "missing or empty description",
    });
  }

  // inputSchema
  if (t.inputSchema === undefined) {
    issues.push({ index, tool: named, message: "missing inputSchema" });
  } else {
    for (const e of checkSchemaShape(t.inputSchema)) {
      issues.push({
        index,
        tool: named,
        message: `inputSchema${e.path === "/" ? "" : " at " + e.path}: ${e.message}`,
      });
    }
  }

  return issues;
}

/** Validate an entire catalog of tool definitions. */
export function validateTools(tools: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!Array.isArray(tools)) {
    return {
      ok: false,
      issues: [{ index: -1, message: "tool catalog must be a JSON array" }],
    };
  }

  const seen = new Map<string, number>();
  for (let i = 0; i < tools.length; i++) {
    issues.push(...validateTool(tools[i], i));
    const tool = tools[i] as { name?: unknown };
    if (typeof tool?.name === "string") {
      if (seen.has(tool.name)) {
        issues.push({
          index: i,
          tool: tool.name,
          message: `duplicate tool name "${tool.name}" (first seen at index ${seen.get(
            tool.name
          )})`,
        });
      } else {
        seen.set(tool.name, i);
      }
    }
  }

  return { ok: issues.length === 0, issues };
}
