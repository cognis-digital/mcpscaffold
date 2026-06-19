/**
 * Core type definitions for MCP tool descriptions.
 *
 * These mirror the shape an MCP server advertises to clients: each tool has a
 * machine name, a human-readable description, and a JSON-Schema describing its
 * input arguments. Original Cognis Digital implementation.
 */

/** A subset of JSON Schema sufficient to describe MCP tool inputs. */
export interface JsonSchema {
  type?: JsonSchemaType | JsonSchemaType[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  description?: string;
  /** Allow unknown keywords without failing validation of the schema itself. */
  [keyword: string]: unknown;
}

export type JsonSchemaType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "object"
  | "array"
  | "null";

/** A single MCP tool definition. */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

/** A handler that implements a tool's behavior. */
export type ToolHandler = (
  args: Record<string, unknown>
) => unknown | Promise<unknown>;

/** A tool definition paired with its runtime handler. */
export interface RegisteredTool extends ToolDefinition {
  handler: ToolHandler;
}

/** Result of a validation pass. */
export interface ValidationIssue {
  /** Index of the offending tool in the source list, or -1 for whole-list issues. */
  index: number;
  /** Tool name if known. */
  tool?: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}
