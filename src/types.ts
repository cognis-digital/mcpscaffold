/**
 * Core type definitions for the Model Context Protocol (MCP) primitives that
 * mcpscaffold understands.
 *
 * These mirror the shapes an MCP server advertises to clients over JSON-RPC,
 * targeting MCP specification version 2025-06-18:
 *   - Tools    (name, title?, description, inputSchema, outputSchema?, annotations?)
 *   - Resources (uri, name, title?, description?, mimeType?)
 *   - Resource templates (uriTemplate, name, title?, description?, mimeType?)
 *   - Prompts  (name, title?, description?, arguments[])
 *
 * A {@link ServerSpec} bundles all four primitives (plus name/version and an
 * optional auth block) into a single document that fully describes a server to
 * scaffold. Original Cognis Digital implementation.
 */

/** The MCP protocol version these types target. */
export const MCP_PROTOCOL_VERSION = "2025-06-18" as const;

/** A subset of JSON Schema sufficient to describe MCP tool inputs and outputs. */
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

/**
 * Optional behavioral hints a server may attach to a tool (MCP `annotations`).
 * Per the spec these are untrusted hints; the scaffolder emits them verbatim.
 */
export interface ToolAnnotations {
  /** Human-readable title for display. */
  title?: string;
  /** If true, the tool does not modify its environment. */
  readOnlyHint?: boolean;
  /** If true, the tool may perform destructive updates. */
  destructiveHint?: boolean;
  /** If true, repeated calls with the same args have no additional effect. */
  idempotentHint?: boolean;
  /** If true, the tool may interact with an "open world" of external entities. */
  openWorldHint?: boolean;
  [key: string]: unknown;
}

/** A single MCP tool definition. */
export interface ToolDefinition {
  name: string;
  /** Optional human-readable display name (MCP `title`). */
  title?: string;
  description: string;
  inputSchema: JsonSchema;
  /** Optional JSON Schema describing the tool's structured output. */
  outputSchema?: JsonSchema;
  /** Optional behavioral hints. */
  annotations?: ToolAnnotations;
}

/** A resource the server can expose for reading (MCP `resources/list`). */
export interface ResourceDefinition {
  /** Unique identifier (URI) for the resource. */
  uri: string;
  /** Programmatic name of the resource. */
  name: string;
  /** Optional human-readable display name. */
  title?: string;
  /** Optional human-readable description. */
  description?: string;
  /** Optional MIME type of the resource contents. */
  mimeType?: string;
}

/** A parameterized resource exposed via a URI template (RFC 6570). */
export interface ResourceTemplateDefinition {
  /** URI template, e.g. "file:///{path}". */
  uriTemplate: string;
  /** Programmatic name of the template. */
  name: string;
  /** Optional human-readable display name. */
  title?: string;
  /** Optional human-readable description. */
  description?: string;
  /** Optional MIME type for resources produced by the template. */
  mimeType?: string;
}

/** A single argument accepted by a prompt (MCP `prompts/list`). */
export interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

/** A prompt template the server can render (MCP `prompts/list`/`prompts/get`). */
export interface PromptDefinition {
  name: string;
  /** Optional human-readable display name. */
  title?: string;
  description?: string;
  arguments?: PromptArgument[];
}

/**
 * Optional authentication/authorization configuration for a scaffolded server.
 *
 * Defensive scope only: this describes a *place to plug in* auth. The generated
 * `authorize()` hook defaults to allow-with-TODO; setting `scheme: "bearer"`
 * additionally emits a commented bearer-token example for the author to enable.
 */
export interface AuthConfig {
  /** Auth scheme to scaffold a hook for. Default "none" emits an allow stub. */
  scheme?: "none" | "bearer";
  /**
   * For `scheme: "bearer"`, the environment variable the generated example
   * reads the expected token from (default MCP_BEARER_TOKEN). Never a literal.
   */
  tokenEnvVar?: string;
  /** Optional human note rendered into the generated auth stub. */
  note?: string;
}

/**
 * A complete description of an MCP server to scaffold: identity plus every
 * primitive. All primitive arrays are optional and default to empty.
 */
export interface ServerSpec {
  name: string;
  version: string;
  /** Optional human-readable display title for the server. */
  title?: string;
  /** Optional free-text instructions surfaced in the initialize result. */
  instructions?: string;
  tools?: ToolDefinition[];
  resources?: ResourceDefinition[];
  resourceTemplates?: ResourceTemplateDefinition[];
  prompts?: PromptDefinition[];
  auth?: AuthConfig;
}

/** A handler that implements a tool's behavior. */
export type ToolHandler = (
  args: Record<string, unknown>
) => unknown | Promise<unknown>;

/** A tool definition paired with its runtime handler. */
export interface RegisteredTool extends ToolDefinition {
  handler: ToolHandler;
}

/** A handler that produces the contents for a concrete resource read. */
export type ResourceHandler = (
  uri: string
) => ResourceContents | Promise<ResourceContents>;

/** The contents of a single resource read (text or binary). */
export interface ResourceContents {
  uri: string;
  mimeType?: string;
  /** Text payload (mutually exclusive with `blob`). */
  text?: string;
  /** Base64-encoded binary payload (mutually exclusive with `text`). */
  blob?: string;
}

/** A resource definition paired with its runtime read handler. */
export interface RegisteredResource extends ResourceDefinition {
  handler: ResourceHandler;
}

/** A single message returned by a prompt render. */
export interface PromptMessage {
  role: "user" | "assistant";
  content: { type: "text"; text: string };
}

/** The result of rendering a prompt (MCP `prompts/get` result). */
export interface PromptGetResult {
  description?: string;
  messages: PromptMessage[];
}

/** A handler that renders a prompt into messages. */
export type PromptHandler = (
  args: Record<string, unknown>
) => PromptGetResult | Promise<PromptGetResult>;

/** A prompt definition paired with its runtime render handler. */
export interface RegisteredPrompt extends PromptDefinition {
  handler: PromptHandler;
}

/** Result of a validation pass. */
export interface ValidationIssue {
  /**
   * Index of the offending item in its source list, or -1 for whole-list /
   * whole-spec issues.
   */
  index: number;
  /** Which primitive the issue concerns (for spec-level validation). */
  kind?: "tool" | "resource" | "resourceTemplate" | "prompt" | "spec";
  /** Item name/uri if known. */
  tool?: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}
