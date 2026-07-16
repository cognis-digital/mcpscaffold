/**
 * Structural diff and backward-compatibility analysis for MCP server specs.
 *
 * When an MCP server evolves, some changes are safe for existing clients and
 * some silently break them: removing a tool, adding a newly-required argument,
 * or changing an argument's type all break callers that were written against the
 * previous surface. {@link diffSpecs} compares two {@link ServerSpec}s (or two
 * bare tool catalogs) and classifies every change as **breaking** or
 * **compatible**, from the perspective of a client written against the *old*
 * spec.
 *
 * Compatibility rules (old → new):
 *   Tools
 *     - tool removed .......................... BREAKING (callers vanish)
 *     - tool added ............................ compatible
 *     - input: property became required ....... BREAKING (callers omit it)
 *     - input: new required property added .... BREAKING
 *     - input: property type changed .......... BREAKING
 *     - input: required → optional ............ compatible (loosening)
 *     - input: optional property removed ...... compatible
 *     - description/title/output/annotations .. compatible (recorded)
 *   Resources (keyed by uri)
 *     - resource removed ...................... BREAKING
 *     - resource added / metadata changed ..... compatible
 *   Resource templates (keyed by name)
 *     - template removed ...................... BREAKING
 *     - uriTemplate changed ................... BREAKING (URIs stop matching)
 *     - template added / metadata changed ..... compatible
 *   Prompts (keyed by name)
 *     - prompt removed ........................ BREAKING
 *     - argument became required / new req .... BREAKING
 *     - prompt added / arg removed / meta ..... compatible
 *   Server identity
 *     - name changed .......................... BREAKING (server identity)
 *     - version / title / instructions ........ compatible (recorded)
 *
 * Pure and dependency-free. Original Cognis Digital implementation.
 */

import type {
  JsonSchema,
  JsonSchemaType,
  PromptDefinition,
  ResourceDefinition,
  ResourceTemplateDefinition,
  ServerSpec,
  ToolDefinition,
} from "./types.js";
import { isServerSpec } from "./validate.js";

/** Whether a primitive was added, removed, or modified between two specs. */
export type ChangeKind = "added" | "removed" | "changed";

/** Which MCP primitive (or the server itself) a change concerns. */
export type DiffTarget =
  | "tool"
  | "resource"
  | "resourceTemplate"
  | "prompt"
  | "server";

/** A single classified difference between two specs. */
export interface SpecChange {
  kind: ChangeKind;
  target: DiffTarget;
  /** Tool/prompt/template name, resource uri, or "" for server-level changes. */
  name: string;
  /** True when the change breaks a client written against the old spec. */
  breaking: boolean;
  /** Human-readable explanation of the change. */
  detail: string;
}

/** The full result of comparing two specs. */
export interface SpecDiff {
  /** All changes, breaking ones first, then by target/name. */
  changes: SpecChange[];
  /** True if any change is breaking. */
  breaking: boolean;
  /** Counts by change kind, plus a breaking tally. */
  summary: {
    added: number;
    removed: number;
    changed: number;
    breaking: number;
  };
}

/** Coerce a spec-or-tool-array input into a normalized ServerSpec shell. */
function asSpec(value: ServerSpec | ToolDefinition[]): ServerSpec {
  if (Array.isArray(value)) {
    return { name: "", version: "", tools: value };
  }
  return value;
}

function indexByKey<T>(items: T[], key: (t: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    const k = key(item);
    if (typeof k === "string" && k.length > 0 && !map.has(k)) {
      map.set(k, item);
    }
  }
  return map;
}

/** Normalize a schema's declared type to a comparable list of type names. */
function typeList(schema: JsonSchema | undefined): JsonSchemaType[] {
  if (!schema || schema.type === undefined) return [];
  const t = Array.isArray(schema.type) ? schema.type : [schema.type];
  return [...t].sort() as JsonSchemaType[];
}

function sameType(a: JsonSchema | undefined, b: JsonSchema | undefined): boolean {
  const ta = typeList(a);
  const tb = typeList(b);
  if (ta.length !== tb.length) return false;
  return ta.every((t, i) => t === tb[i]);
}

function requiredSet(schema: JsonSchema | undefined): Set<string> {
  const req = schema && Array.isArray(schema.required) ? schema.required : [];
  return new Set(req.filter((r): r is string => typeof r === "string"));
}

function properties(schema: JsonSchema | undefined): Record<string, JsonSchema> {
  return schema && schema.properties ? schema.properties : {};
}

/** Compare two tools' input schemas and emit any input-surface changes. */
function diffToolInput(
  name: string,
  before: ToolDefinition,
  after: ToolDefinition
): SpecChange[] {
  const changes: SpecChange[] = [];
  const oldProps = properties(before.inputSchema);
  const newProps = properties(after.inputSchema);
  const oldReq = requiredSet(before.inputSchema);
  const newReq = requiredSet(after.inputSchema);

  for (const key of Object.keys(newProps)) {
    const existedBefore = Object.prototype.hasOwnProperty.call(oldProps, key);
    const nowRequired = newReq.has(key);
    if (!existedBefore) {
      changes.push({
        kind: "changed",
        target: "tool",
        name,
        breaking: nowRequired,
        detail: nowRequired
          ? `input adds required property "${key}"`
          : `input adds optional property "${key}"`,
      });
      continue;
    }
    // Property existed before — check for a tightening or a type change.
    if (!oldReq.has(key) && nowRequired) {
      changes.push({
        kind: "changed",
        target: "tool",
        name,
        breaking: true,
        detail: `input property "${key}" became required`,
      });
    } else if (oldReq.has(key) && !nowRequired) {
      changes.push({
        kind: "changed",
        target: "tool",
        name,
        breaking: false,
        detail: `input property "${key}" is no longer required`,
      });
    }
    if (!sameType(oldProps[key], newProps[key])) {
      const from = typeList(oldProps[key]).join("|") || "any";
      const to = typeList(newProps[key]).join("|") || "any";
      changes.push({
        kind: "changed",
        target: "tool",
        name,
        breaking: true,
        detail: `input property "${key}" type changed ${from} → ${to}`,
      });
    }
  }

  for (const key of Object.keys(oldProps)) {
    if (!Object.prototype.hasOwnProperty.call(newProps, key)) {
      changes.push({
        kind: "changed",
        target: "tool",
        name,
        breaking: false,
        detail: `input property "${key}" removed`,
      });
    }
  }
  return changes;
}

/** Compare two prompts' argument lists. */
function diffPromptArgs(
  name: string,
  before: PromptDefinition,
  after: PromptDefinition
): SpecChange[] {
  const changes: SpecChange[] = [];
  const oldArgs = indexByKey(before.arguments ?? [], (a) => a.name);
  const newArgs = indexByKey(after.arguments ?? [], (a) => a.name);

  for (const [argName, arg] of newArgs) {
    const prev = oldArgs.get(argName);
    if (!prev) {
      changes.push({
        kind: "changed",
        target: "prompt",
        name,
        breaking: Boolean(arg.required),
        detail: arg.required
          ? `adds required argument "${argName}"`
          : `adds optional argument "${argName}"`,
      });
    } else if (!prev.required && arg.required) {
      changes.push({
        kind: "changed",
        target: "prompt",
        name,
        breaking: true,
        detail: `argument "${argName}" became required`,
      });
    } else if (prev.required && !arg.required) {
      changes.push({
        kind: "changed",
        target: "prompt",
        name,
        breaking: false,
        detail: `argument "${argName}" is no longer required`,
      });
    }
  }
  for (const argName of oldArgs.keys()) {
    if (!newArgs.has(argName)) {
      changes.push({
        kind: "changed",
        target: "prompt",
        name,
        breaking: false,
        detail: `removes argument "${argName}"`,
      });
    }
  }
  return changes;
}

function diffTools(before: ServerSpec, after: ServerSpec): SpecChange[] {
  const changes: SpecChange[] = [];
  const oldTools = indexByKey(before.tools ?? [], (t) => t.name);
  const newTools = indexByKey(after.tools ?? [], (t) => t.name);

  for (const [name, tool] of newTools) {
    if (!oldTools.has(name)) {
      changes.push({
        kind: "added",
        target: "tool",
        name,
        breaking: false,
        detail: `tool "${name}" added`,
      });
    } else {
      const prev = oldTools.get(name)!;
      changes.push(...diffToolInput(name, prev, tool));
      if ((prev.description ?? "") !== (tool.description ?? "")) {
        changes.push({
          kind: "changed",
          target: "tool",
          name,
          breaking: false,
          detail: `description changed`,
        });
      }
      const hadOutput = prev.outputSchema !== undefined;
      const hasOutput = tool.outputSchema !== undefined;
      if (hadOutput !== hasOutput) {
        changes.push({
          kind: "changed",
          target: "tool",
          name,
          breaking: false,
          detail: hasOutput ? "outputSchema added" : "outputSchema removed",
        });
      }
    }
  }
  for (const name of oldTools.keys()) {
    if (!newTools.has(name)) {
      changes.push({
        kind: "removed",
        target: "tool",
        name,
        breaking: true,
        detail: `tool "${name}" removed`,
      });
    }
  }
  return changes;
}

function diffResources(before: ServerSpec, after: ServerSpec): SpecChange[] {
  const changes: SpecChange[] = [];
  const oldRes = indexByKey<ResourceDefinition>(before.resources ?? [], (r) => r.uri);
  const newRes = indexByKey<ResourceDefinition>(after.resources ?? [], (r) => r.uri);
  for (const [uri, res] of newRes) {
    const prev = oldRes.get(uri);
    if (!prev) {
      changes.push({
        kind: "added",
        target: "resource",
        name: uri,
        breaking: false,
        detail: `resource "${uri}" added`,
      });
    } else if (
      (prev.mimeType ?? "") !== (res.mimeType ?? "") ||
      (prev.description ?? "") !== (res.description ?? "") ||
      (prev.name ?? "") !== (res.name ?? "")
    ) {
      changes.push({
        kind: "changed",
        target: "resource",
        name: uri,
        breaking: false,
        detail: `resource "${uri}" metadata changed`,
      });
    }
  }
  for (const uri of oldRes.keys()) {
    if (!newRes.has(uri)) {
      changes.push({
        kind: "removed",
        target: "resource",
        name: uri,
        breaking: true,
        detail: `resource "${uri}" removed`,
      });
    }
  }
  return changes;
}

function diffTemplates(before: ServerSpec, after: ServerSpec): SpecChange[] {
  const changes: SpecChange[] = [];
  const oldT = indexByKey<ResourceTemplateDefinition>(
    before.resourceTemplates ?? [],
    (t) => t.name
  );
  const newT = indexByKey<ResourceTemplateDefinition>(
    after.resourceTemplates ?? [],
    (t) => t.name
  );
  for (const [name, tmpl] of newT) {
    const prev = oldT.get(name);
    if (!prev) {
      changes.push({
        kind: "added",
        target: "resourceTemplate",
        name,
        breaking: false,
        detail: `resource template "${name}" added`,
      });
    } else if (prev.uriTemplate !== tmpl.uriTemplate) {
      changes.push({
        kind: "changed",
        target: "resourceTemplate",
        name,
        breaking: true,
        detail: `uriTemplate changed "${prev.uriTemplate}" → "${tmpl.uriTemplate}"`,
      });
    }
  }
  for (const name of oldT.keys()) {
    if (!newT.has(name)) {
      changes.push({
        kind: "removed",
        target: "resourceTemplate",
        name,
        breaking: true,
        detail: `resource template "${name}" removed`,
      });
    }
  }
  return changes;
}

function diffPrompts(before: ServerSpec, after: ServerSpec): SpecChange[] {
  const changes: SpecChange[] = [];
  const oldP = indexByKey<PromptDefinition>(before.prompts ?? [], (p) => p.name);
  const newP = indexByKey<PromptDefinition>(after.prompts ?? [], (p) => p.name);
  for (const [name, prompt] of newP) {
    if (!oldP.has(name)) {
      changes.push({
        kind: "added",
        target: "prompt",
        name,
        breaking: false,
        detail: `prompt "${name}" added`,
      });
    } else {
      changes.push(...diffPromptArgs(name, oldP.get(name)!, prompt));
    }
  }
  for (const name of oldP.keys()) {
    if (!newP.has(name)) {
      changes.push({
        kind: "removed",
        target: "prompt",
        name,
        breaking: true,
        detail: `prompt "${name}" removed`,
      });
    }
  }
  return changes;
}

function diffServerIdentity(before: ServerSpec, after: ServerSpec): SpecChange[] {
  const changes: SpecChange[] = [];
  if ((before.name ?? "") !== (after.name ?? "") && before.name && after.name) {
    changes.push({
      kind: "changed",
      target: "server",
      name: "",
      breaking: true,
      detail: `server name changed "${before.name}" → "${after.name}"`,
    });
  }
  if ((before.version ?? "") !== (after.version ?? "") && before.version) {
    changes.push({
      kind: "changed",
      target: "server",
      name: "",
      breaking: false,
      detail: `version changed "${before.version}" → "${after.version}"`,
    });
  }
  if ((before.instructions ?? "") !== (after.instructions ?? "")) {
    changes.push({
      kind: "changed",
      target: "server",
      name: "",
      breaking: false,
      detail: `instructions changed`,
    });
  }
  return changes;
}

const KIND_RANK: Record<ChangeKind, number> = { removed: 0, changed: 1, added: 2 };

/**
 * Compare two specs (or two tool catalogs) and classify every difference as
 * breaking or compatible for a client written against `before`.
 *
 * Accepts either a full {@link ServerSpec} or a bare `ToolDefinition[]` on
 * either side, mirroring `validateAny`. Tool-array inputs only produce
 * tool-level changes (no server-identity comparison).
 */
export function diffSpecs(
  before: ServerSpec | ToolDefinition[],
  after: ServerSpec | ToolDefinition[]
): SpecDiff {
  const a = asSpec(before);
  const b = asSpec(after);
  const bothSpecs = isServerSpec(before) && isServerSpec(after);

  const changes: SpecChange[] = [
    ...(bothSpecs ? diffServerIdentity(a, b) : []),
    ...diffTools(a, b),
    ...diffResources(a, b),
    ...diffTemplates(a, b),
    ...diffPrompts(a, b),
  ];

  // Breaking first, then removed → changed → added, then by name.
  changes.sort((x, y) => {
    if (x.breaking !== y.breaking) return x.breaking ? -1 : 1;
    if (KIND_RANK[x.kind] !== KIND_RANK[y.kind]) {
      return KIND_RANK[x.kind] - KIND_RANK[y.kind];
    }
    return x.name.localeCompare(y.name);
  });

  const summary = {
    added: changes.filter((c) => c.kind === "added").length,
    removed: changes.filter((c) => c.kind === "removed").length,
    changed: changes.filter((c) => c.kind === "changed").length,
    breaking: changes.filter((c) => c.breaking).length,
  };

  return { changes, breaking: summary.breaking > 0, summary };
}

/** Render a {@link SpecDiff} as human-readable lines (used by the CLI). */
export function formatDiff(diff: SpecDiff): string {
  if (diff.changes.length === 0) {
    return "No differences: the specs are identical in surface.";
  }
  const lines: string[] = [];
  const sign: Record<ChangeKind, string> = { added: "+", removed: "-", changed: "~" };
  for (const c of diff.changes) {
    const flag = c.breaking ? "BREAKING" : "ok      ";
    lines.push(`  ${flag}  ${sign[c.kind]} [${c.target}] ${c.detail}`);
  }
  lines.push("");
  lines.push(
    `${diff.summary.added} added, ${diff.summary.removed} removed, ` +
      `${diff.summary.changed} changed — ${diff.summary.breaking} breaking`
  );
  return lines.join("\n");
}
