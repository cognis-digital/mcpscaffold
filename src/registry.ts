/**
 * Registries + dispatch harness for MCP primitives.
 *
 * A {@link ToolRegistry} holds tools (definition + handler) and dispatches a
 * call by name, validating arguments against the tool's JSON Schema before the
 * handler runs. {@link ResourceRegistry} and {@link PromptRegistry} do the same
 * for resources (read by URI) and prompts (render with arguments). All three
 * let authors unit-test their server logic without a live MCP client.
 *
 * Original Cognis Digital implementation.
 */

import { validate } from "./jsonschema.js";
import { NAME_PATTERN, URI_PATTERN } from "./validate.js";
import type {
  PromptDefinition,
  PromptGetResult,
  PromptHandler,
  RegisteredPrompt,
  RegisteredResource,
  RegisteredTool,
  ResourceContents,
  ResourceDefinition,
  ResourceHandler,
  ToolDefinition,
  ToolHandler,
} from "./types.js";

/** Error thrown when a dispatch fails before reaching the handler. */
export class DispatchError extends Error {
  constructor(
    message: string,
    readonly code:
      | "unknown_tool"
      | "invalid_args"
      | "unknown_resource"
      | "unknown_prompt"
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

  /**
   * Tool definitions only (without handlers), suitable for advertising via
   * `tools/list`. Includes optional `title`, `outputSchema`, and `annotations`.
   */
  list(): ToolDefinition[] {
    return [...this.tools.values()].map((t) => {
      const def: ToolDefinition = {
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      };
      if (t.title !== undefined) def.title = t.title;
      if (t.outputSchema !== undefined) def.outputSchema = t.outputSchema;
      if (t.annotations !== undefined) def.annotations = t.annotations;
      return def;
    });
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

export class ResourceRegistry {
  private resources = new Map<string, RegisteredResource>();

  /** Register a resource keyed by its URI. */
  register(def: ResourceDefinition, handler: ResourceHandler): this {
    if (typeof def.uri !== "string" || !URI_PATTERN.test(def.uri)) {
      throw new Error(`invalid resource uri: ${JSON.stringify(def.uri)}`);
    }
    if (typeof def.name !== "string" || !NAME_PATTERN.test(def.name)) {
      throw new Error(`invalid resource name: ${JSON.stringify(def.name)}`);
    }
    if (this.resources.has(def.uri)) {
      throw new Error(`resource already registered: ${def.uri}`);
    }
    if (typeof handler !== "function") {
      throw new Error(`handler for ${def.uri} must be a function`);
    }
    this.resources.set(def.uri, { ...def, handler });
    return this;
  }

  has(uri: string): boolean {
    return this.resources.has(uri);
  }

  get(uri: string): RegisteredResource | undefined {
    return this.resources.get(uri);
  }

  /** Resource definitions (without handlers) for `resources/list`. */
  list(): ResourceDefinition[] {
    return [...this.resources.values()].map((r) => {
      const def: ResourceDefinition = { uri: r.uri, name: r.name };
      if (r.title !== undefined) def.title = r.title;
      if (r.description !== undefined) def.description = r.description;
      if (r.mimeType !== undefined) def.mimeType = r.mimeType;
      return def;
    });
  }

  size(): number {
    return this.resources.size;
  }

  /** Read a resource by URI. Returns a DispatchResult with ResourceContents. */
  async read(uri: string): Promise<DispatchResult> {
    const resource = this.resources.get(uri);
    if (!resource) {
      return {
        ok: false,
        error: new DispatchError(`unknown resource: ${uri}`, "unknown_resource"),
      };
    }
    const contents: ResourceContents = await resource.handler(uri);
    return { ok: true, value: contents };
  }
}

export class PromptRegistry {
  private prompts = new Map<string, RegisteredPrompt>();

  /** Register a prompt keyed by its name. */
  register(def: PromptDefinition, handler: PromptHandler): this {
    if (typeof def.name !== "string" || !NAME_PATTERN.test(def.name)) {
      throw new Error(`invalid prompt name: ${JSON.stringify(def.name)}`);
    }
    if (this.prompts.has(def.name)) {
      throw new Error(`prompt already registered: ${def.name}`);
    }
    if (typeof handler !== "function") {
      throw new Error(`handler for ${def.name} must be a function`);
    }
    this.prompts.set(def.name, { ...def, handler });
    return this;
  }

  has(name: string): boolean {
    return this.prompts.has(name);
  }

  get(name: string): RegisteredPrompt | undefined {
    return this.prompts.get(name);
  }

  /** Prompt definitions (without handlers) for `prompts/list`. */
  list(): PromptDefinition[] {
    return [...this.prompts.values()].map((p) => {
      const def: PromptDefinition = { name: p.name };
      if (p.title !== undefined) def.title = p.title;
      if (p.description !== undefined) def.description = p.description;
      if (p.arguments !== undefined) def.arguments = p.arguments;
      return def;
    });
  }

  size(): number {
    return this.prompts.size;
  }

  /**
   * Render a prompt. Checks that all required arguments are present before
   * invoking the handler. Returns a DispatchResult with a PromptGetResult.
   */
  async render(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<DispatchResult> {
    const prompt = this.prompts.get(name);
    if (!prompt) {
      return {
        ok: false,
        error: new DispatchError(`unknown prompt: ${name}`, "unknown_prompt"),
      };
    }
    const missing = (prompt.arguments ?? [])
      .filter((a) => a.required && !(a.name in args))
      .map((a) => a.name);
    if (missing.length > 0) {
      return {
        ok: false,
        error: new DispatchError(
          `missing required argument(s) for ${name}: ${missing.join(", ")}`,
          "invalid_args"
        ),
      };
    }
    const result: PromptGetResult = await prompt.handler(args);
    return { ok: true, value: result };
  }
}
