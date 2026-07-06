/**
 * Public library surface for @cognis-digital/mcpscaffold.
 *
 * Original Cognis Digital implementation.
 */

export type {
  JsonSchema,
  JsonSchemaType,
  ToolAnnotations,
  ToolDefinition,
  ToolHandler,
  RegisteredTool,
  ResourceDefinition,
  ResourceTemplateDefinition,
  ResourceHandler,
  ResourceContents,
  RegisteredResource,
  PromptArgument,
  PromptDefinition,
  PromptHandler,
  PromptMessage,
  PromptGetResult,
  RegisteredPrompt,
  AuthConfig,
  ServerSpec,
  ValidationIssue,
  ValidationResult,
} from "./types.js";

export { MCP_PROTOCOL_VERSION } from "./types.js";

export {
  validate,
  checkSchemaShape,
  isWellFormedSchema,
  type SchemaError,
} from "./jsonschema.js";

export {
  validateTool,
  validateTools,
  validateResource,
  validateResourceTemplate,
  validatePrompt,
  validateServerSpec,
  validateAny,
  isServerSpec,
  NAME_PATTERN,
  URI_PATTERN,
} from "./validate.js";

export {
  ToolRegistry,
  ResourceRegistry,
  PromptRegistry,
  DispatchError,
  type DispatchResult,
} from "./registry.js";

export {
  scaffold,
  scaffoldFromSpec,
  SAMPLE_TOOL,
  type ScaffoldOptions,
  type ScaffoldResult,
} from "./scaffold.js";

export {
  generateServerFiles,
  type GeneratedFile,
} from "./generate.js";

export { starterSpec, EXAMPLE_SPEC } from "./spec.js";
