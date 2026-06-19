import { test } from "node:test";
import assert from "node:assert/strict";
import { ToolRegistry } from "../src/registry.js";
import type { ToolDefinition } from "../src/types.js";

const addTool: ToolDefinition = {
  name: "add",
  description: "Add two integers.",
  inputSchema: {
    type: "object",
    properties: { a: { type: "integer" }, b: { type: "integer" } },
    required: ["a", "b"],
  },
};

function makeRegistry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(addTool, (args) => (args.a as number) + (args.b as number));
  return r;
}

test("register + list + has", () => {
  const r = makeRegistry();
  assert.equal(r.size(), 1);
  assert.equal(r.has("add"), true);
  assert.equal(r.list()[0].name, "add");
  // list returns definitions without handler
  assert.equal("handler" in (r.list()[0] as object), false);
});

test("register rejects duplicates and bad names", () => {
  const r = makeRegistry();
  assert.throws(() => r.register(addTool, () => 0), /already registered/);
  assert.throws(
    () =>
      r.register(
        { name: "bad name", description: "x", inputSchema: {} },
        () => 0
      ),
    /invalid tool name/
  );
});

test("dispatch with good args returns handler value", async () => {
  const r = makeRegistry();
  const res = await r.dispatch("add", { a: 2, b: 3 });
  assert.equal(res.ok, true);
  assert.equal(res.value, 5);
});

test("dispatch unknown tool fails gracefully", async () => {
  const r = makeRegistry();
  const res = await r.dispatch("nope", {});
  assert.equal(res.ok, false);
  assert.equal(res.error?.code, "unknown_tool");
});

test("dispatch with bad args is rejected before handler", async () => {
  const r = makeRegistry();
  // missing b, and a is a string
  const res = await r.dispatch("add", { a: "two" });
  assert.equal(res.ok, false);
  assert.equal(res.error?.code, "invalid_args");
  assert.match(res.error!.message, /invalid arguments for add/);
});

test("dispatch supports async handlers", async () => {
  const r = new ToolRegistry();
  r.register(
    { name: "delayed", description: "async", inputSchema: { type: "object" } },
    async () => {
      await Promise.resolve();
      return "done";
    }
  );
  const res = await r.dispatch("delayed", {});
  assert.equal(res.value, "done");
});
