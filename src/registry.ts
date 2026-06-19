/**
 * ToolRegistry + dispatch harness.
 *
 * A ToolRegistry holds a set of tools (definition + handler) and lets authors
 * dispatch a tool call by name with arguments. Arguments are validated against
 * the tool's JSON-Schema before the handler runs, so tools can be unit-tested
 * without a live MCP client.
 *
 * Original Cognis Digital implementation.
 */

import { validate } from "./jsonschema.js";
import { NAME_PATTERN } from "./validate.js";
import type {
  RegisteredTool,
  ToolDefinition,
  ToolHandler,
} from "./types.js";

/** Error thrown when a dispatch fails before reaching the handler. */
export class DispatchError extends Error {
  constructor(
    message: string,
    readonly code: "unknown_tool" | "invalid_args"
  ) {
    super(message);
    this.name = "DispatchError";
  }
}

export interface DispatchResult {
  ok: boolean;
  /** Handler return value when ok. */
  value?: unknown;
  /** Failure reason when not ok. */
  error?: DispatchError;
}

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  /** Register a tool. Throws on bad name or duplicate registration. */
  register(def: ToolDefinition, handler: ToolHandler): this {
    if (typeof def.name !== "string" || !NAME_PATTERN.test(def.name)) {
      throw new Error(`invalid tool name: ${JSON.stringify(def.name)}`);
    }
    if (this.tools.has(def.name)) {
      throw new Error(`tool already registered: ${def.name}`);
    }
    if (typeof handler !== "function") {
      throw new Error(`handler for ${def.name} must be a function`);
    }
    this.tools.set(def.name, { ...def, handler });
    return this;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /** Tool definitions only (without handlers), suitable for advertising. */
  list(): ToolDefinition[] {
    return [...this.tools.values()].map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    }));
  }

  size(): number {
    return this.tools.size;
  }

  /**
   * Dispatch a tool call. Validates args against the tool's inputSchema, then
   * invokes the handler. Never throws for the common failure modes — returns a
   * DispatchResult so callers/tests can assert on the outcome. Handler
   * exceptions are propagated (rejected promise).
   */
  async dispatch(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<DispatchResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        ok: false,
        error: new DispatchError(`unknown tool: ${name}`, "unknown_tool"),
      };
    }

    const errors = validate(args, tool.inputSchema);
    if (errors.length > 0) {
      const detail = errors
        .map((e) => `${e.path || "/"}: ${e.message}`)
        .join("; ");
      return {
        ok: false,
        error: new DispatchError(
          `invalid arguments for ${name}: ${detail}`,
          "invalid_args"
        ),
      };
    }

    const value = await tool.handler(args);
    return { ok: true, value };
  }
}
