/**
 * Validation of MCP primitives and whole server specifications.
 *
 * Tool rules (back-compat with the original catalog validator):
 *   - each entry is an object with name/description/inputSchema
 *   - name matches a conservative identifier format
 *   - description is a non-empty string
 *   - inputSchema (and optional outputSchema) is a well-formed JSON Schema
 *   - names are unique across the catalog
 *
 * Resource / resource-template / prompt rules and whole-{@link ServerSpec}
 * conformance checks are layered on top. Original Cognis Digital implementation.
 */

import { checkSchemaShape } from "./jsonschema.js";
import type {
  PromptDefinition,
  ResourceDefinition,
  ResourceTemplateDefinition,
  ServerSpec,
  ToolDefinition,
  ValidationIssue,
  ValidationResult,
} from "./types.js";

/** Tool/prompt names: letters/digits/underscore/hyphen/dot, 1-64 chars, must start alnum. */
export const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

/**
 * Well-formed URI check (absolute URI with a scheme, per RFC 3986 §3.1).
 * Deliberately permissive about the scheme-specific part; MCP allows custom
 * schemes (file, git, https, resource, ...).
 */
export const URI_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:.+/;

/** Validate a single tool definition, returning issues for the given index. */
export function validateTool(tool: unknown, index: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (typeof tool !== "object" || tool === null || Array.isArray(tool)) {
    issues.push({ index, kind: "tool", message: "tool must be an object" });
    return issues;
  }
  const t = tool as Partial<ToolDefinition>;
  const named = typeof t.name === "string" ? t.name : undefined;

  // name
  if (typeof t.name !== "string" || t.name.length === 0) {
    issues.push({ index, kind: "tool", tool: named, message: "missing or non-string name" });
  } else if (!NAME_PATTERN.test(t.name)) {
    issues.push({
      index,
      kind: "tool",
      tool: named,
      message: `name "${t.name}" does not match ${NAME_PATTERN}`,
    });
  }

  // description
  if (typeof t.description !== "string" || t.description.trim().length === 0) {
    issues.push({
      index,
      kind: "tool",
      tool: named,
      message: "missing or empty description",
    });
  }

  // inputSchema
  if (t.inputSchema === undefined) {
    issues.push({ index, kind: "tool", tool: named, message: "missing inputSchema" });
  } else {
    for (const e of checkSchemaShape(t.inputSchema)) {
      issues.push({
        index,
        kind: "tool",
        tool: named,
        message: `inputSchema${e.path === "/" ? "" : " at " + e.path}: ${e.message}`,
      });
    }
  }

  // outputSchema (optional)
  if (t.outputSchema !== undefined) {
    for (const e of checkSchemaShape(t.outputSchema)) {
      issues.push({
        index,
        kind: "tool",
        tool: named,
        message: `outputSchema${e.path === "/" ? "" : " at " + e.path}: ${e.message}`,
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
      issues: [{ index: -1, kind: "spec", message: "tool catalog must be a JSON array" }],
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
          kind: "tool",
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

/** Validate a single resource definition. */
export function validateResource(resource: unknown, index: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (typeof resource !== "object" || resource === null || Array.isArray(resource)) {
    issues.push({ index, kind: "resource", message: "resource must be an object" });
    return issues;
  }
  const r = resource as Partial<ResourceDefinition>;
  const named = typeof r.name === "string" ? r.name : undefined;

  if (typeof r.name !== "string" || r.name.length === 0) {
    issues.push({ index, kind: "resource", tool: named, message: "missing or non-string name" });
  } else if (!NAME_PATTERN.test(r.name)) {
    issues.push({
      index,
      kind: "resource",
      tool: named,
      message: `name "${r.name}" does not match ${NAME_PATTERN}`,
    });
  }

  if (typeof r.uri !== "string" || r.uri.length === 0) {
    issues.push({ index, kind: "resource", tool: named, message: "missing or non-string uri" });
  } else if (!URI_PATTERN.test(r.uri)) {
    issues.push({
      index,
      kind: "resource",
      tool: named,
      message: `uri "${r.uri}" is not a well-formed absolute URI (need a scheme, e.g. file://)`,
    });
  }

  if (r.description !== undefined && typeof r.description !== "string") {
    issues.push({ index, kind: "resource", tool: named, message: "description must be a string" });
  }
  if (r.mimeType !== undefined && typeof r.mimeType !== "string") {
    issues.push({ index, kind: "resource", tool: named, message: "mimeType must be a string" });
  }
  return issues;
}

/** Validate a single resource-template definition. */
export function validateResourceTemplate(
  tmpl: unknown,
  index: number
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (typeof tmpl !== "object" || tmpl === null || Array.isArray(tmpl)) {
    issues.push({ index, kind: "resourceTemplate", message: "resource template must be an object" });
    return issues;
  }
  const t = tmpl as Partial<ResourceTemplateDefinition>;
  const named = typeof t.name === "string" ? t.name : undefined;

  if (typeof t.name !== "string" || t.name.length === 0) {
    issues.push({ index, kind: "resourceTemplate", tool: named, message: "missing or non-string name" });
  } else if (!NAME_PATTERN.test(t.name)) {
    issues.push({
      index,
      kind: "resourceTemplate",
      tool: named,
      message: `name "${t.name}" does not match ${NAME_PATTERN}`,
    });
  }

  if (typeof t.uriTemplate !== "string" || t.uriTemplate.length === 0) {
    issues.push({
      index,
      kind: "resourceTemplate",
      tool: named,
      message: "missing or non-string uriTemplate",
    });
  } else if (!URI_PATTERN.test(t.uriTemplate)) {
    issues.push({
      index,
      kind: "resourceTemplate",
      tool: named,
      message: `uriTemplate "${t.uriTemplate}" is not a well-formed URI template (need a scheme)`,
    });
  } else if (!/\{[^}]+\}/.test(t.uriTemplate)) {
    issues.push({
      index,
      kind: "resourceTemplate",
      tool: named,
      message: `uriTemplate "${t.uriTemplate}" has no {variable} expansion (use a plain resource instead)`,
    });
  }
  return issues;
}

/** Validate a single prompt definition. */
export function validatePrompt(prompt: unknown, index: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (typeof prompt !== "object" || prompt === null || Array.isArray(prompt)) {
    issues.push({ index, kind: "prompt", message: "prompt must be an object" });
    return issues;
  }
  const p = prompt as Partial<PromptDefinition>;
  const named = typeof p.name === "string" ? p.name : undefined;

  if (typeof p.name !== "string" || p.name.length === 0) {
    issues.push({ index, kind: "prompt", tool: named, message: "missing or non-string name" });
  } else if (!NAME_PATTERN.test(p.name)) {
    issues.push({
      index,
      kind: "prompt",
      tool: named,
      message: `name "${p.name}" does not match ${NAME_PATTERN}`,
    });
  }

  if (p.description !== undefined && typeof p.description !== "string") {
    issues.push({ index, kind: "prompt", tool: named, message: "description must be a string" });
  }

  if (p.arguments !== undefined) {
    if (!Array.isArray(p.arguments)) {
      issues.push({ index, kind: "prompt", tool: named, message: "arguments must be an array" });
    } else {
      const seenArg = new Set<string>();
      for (let a = 0; a < p.arguments.length; a++) {
        const arg = p.arguments[a] as { name?: unknown; required?: unknown; description?: unknown };
        if (typeof arg !== "object" || arg === null) {
          issues.push({ index, kind: "prompt", tool: named, message: `argument[${a}] must be an object` });
          continue;
        }
        if (typeof arg.name !== "string" || arg.name.length === 0) {
          issues.push({ index, kind: "prompt", tool: named, message: `argument[${a}] missing name` });
        } else {
          if (seenArg.has(arg.name)) {
            issues.push({
              index,
              kind: "prompt",
              tool: named,
              message: `duplicate argument name "${arg.name}"`,
            });
          }
          seenArg.add(arg.name);
        }
        if (arg.required !== undefined && typeof arg.required !== "boolean") {
          issues.push({
            index,
            kind: "prompt",
            tool: named,
            message: `argument "${String(arg.name)}" required must be a boolean`,
          });
        }
        if (arg.description !== undefined && typeof arg.description !== "string") {
          issues.push({
            index,
            kind: "prompt",
            tool: named,
            message: `argument "${String(arg.name)}" description must be a string`,
          });
        }
      }
    }
  }
  return issues;
}

/** True if a parsed JSON value looks like a ServerSpec rather than a tools array. */
export function isServerSpec(value: unknown): value is ServerSpec {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as ServerSpec).name === "string"
  );
}

function checkUnique(
  items: Array<{ name?: unknown }>,
  kind: ValidationIssue["kind"],
  key: "name" | "uri" = "name"
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Map<string, number>();
  for (let i = 0; i < items.length; i++) {
    const val = (items[i] as Record<string, unknown>)?.[key];
    if (typeof val === "string") {
      if (seen.has(val)) {
        issues.push({
          index: i,
          kind,
          tool: val,
          message: `duplicate ${kind} ${key} "${val}" (first seen at index ${seen.get(val)})`,
        });
      } else {
        seen.set(val, i);
      }
    }
  }
  return issues;
}

/**
 * Validate a whole {@link ServerSpec}: identity fields plus every primitive,
 * with MCP-conformance checks and per-primitive uniqueness.
 */
export function validateServerSpec(spec: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (typeof spec !== "object" || spec === null || Array.isArray(spec)) {
    return {
      ok: false,
      issues: [{ index: -1, kind: "spec", message: "ServerSpec must be a JSON object" }],
    };
  }
  const s = spec as Partial<ServerSpec>;

  if (typeof s.name !== "string" || s.name.trim().length === 0) {
    issues.push({ index: -1, kind: "spec", message: "spec.name is required (non-empty string)" });
  }
  if (typeof s.version !== "string" || s.version.trim().length === 0) {
    issues.push({ index: -1, kind: "spec", message: "spec.version is required (non-empty string)" });
  }
  if (s.instructions !== undefined && typeof s.instructions !== "string") {
    issues.push({ index: -1, kind: "spec", message: "spec.instructions must be a string" });
  }

  const tools = s.tools ?? [];
  const resources = s.resources ?? [];
  const resourceTemplates = s.resourceTemplates ?? [];
  const prompts = s.prompts ?? [];

  for (const [arr, label] of [
    [s.tools, "tools"],
    [s.resources, "resources"],
    [s.resourceTemplates, "resourceTemplates"],
    [s.prompts, "prompts"],
  ] as const) {
    if (arr !== undefined && !Array.isArray(arr)) {
      issues.push({ index: -1, kind: "spec", message: `spec.${label} must be an array` });
    }
  }

  if (Array.isArray(tools)) {
    for (let i = 0; i < tools.length; i++) issues.push(...validateTool(tools[i], i));
    issues.push(...checkUnique(tools as Array<{ name?: unknown }>, "tool"));
  }
  if (Array.isArray(resources)) {
    for (let i = 0; i < resources.length; i++) issues.push(...validateResource(resources[i], i));
    issues.push(...checkUnique(resources as Array<{ name?: unknown }>, "resource"));
    issues.push(...checkUnique(resources as Array<{ name?: unknown }>, "resource", "uri"));
  }
  if (Array.isArray(resourceTemplates)) {
    for (let i = 0; i < resourceTemplates.length; i++) {
      issues.push(...validateResourceTemplate(resourceTemplates[i], i));
    }
    issues.push(...checkUnique(resourceTemplates as Array<{ name?: unknown }>, "resourceTemplate"));
  }
  if (Array.isArray(prompts)) {
    for (let i = 0; i < prompts.length; i++) issues.push(...validatePrompt(prompts[i], i));
    issues.push(...checkUnique(prompts as Array<{ name?: unknown }>, "prompt"));
  }

  if (s.auth !== undefined) {
    if (typeof s.auth !== "object" || s.auth === null || Array.isArray(s.auth)) {
      issues.push({ index: -1, kind: "spec", message: "spec.auth must be an object" });
    } else if (
      s.auth.scheme !== undefined &&
      s.auth.scheme !== "none" &&
      s.auth.scheme !== "bearer"
    ) {
      issues.push({
        index: -1,
        kind: "spec",
        message: `spec.auth.scheme must be "none" or "bearer", got "${String(s.auth.scheme)}"`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Validate either a bare tools array (back-compat) or a full {@link ServerSpec}.
 * Used by the `validate` CLI command so both inputs are accepted.
 */
export function validateAny(value: unknown): ValidationResult {
  if (isServerSpec(value)) return validateServerSpec(value);
  return validateTools(value);
}
