/**
 * Public library surface for @cognis-digital/mcpscaffold.
 *
 * Original Cognis Digital implementation.
 */

export type {
  JsonSchema,
  JsonSchemaType,
  ToolDefinition,
  ToolHandler,
  RegisteredTool,
  ValidationIssue,
  ValidationResult,
} from "./types.js";

export {
  validate,
  checkSchemaShape,
  isWellFormedSchema,
  type SchemaError,
} from "./jsonschema.js";

export { validateTool, validateTools, NAME_PATTERN } from "./validate.js";

export {
  ToolRegistry,
  DispatchError,
  type DispatchResult,
} from "./registry.js";

export {
  scaffold,
  SAMPLE_TOOL,
  type ScaffoldOptions,
  type ScaffoldResult,
} from "./scaffold.js";
