import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ToolRegistry,
  ResourceRegistry,
  PromptRegistry,
} from "../src/registry.js";

test("ToolRegistry.list preserves title, outputSchema, annotations", () => {
  const r = new ToolRegistry();
  r.register(
    {
      name: "add",
      title: "Add",
      description: "Add.",
      inputSchema: { type: "object", properties: { a: { type: "integer" } }, required: ["a"] },
      outputSchema: { type: "object", properties: { sum: { type: "integer" } } },
      annotations: { readOnlyHint: true },
    },
    (args) => ({ sum: args.a })
  );
  const def = r.list()[0];
  assert.equal(def.title, "Add");
  assert.ok(def.outputSchema);
  assert.deepEqual(def.annotations, { readOnlyHint: true });
});

test("ResourceRegistry registers, lists and reads by uri", async () => {
  const r = new ResourceRegistry();
  r.register(
    { uri: "info://about", name: "about", mimeType: "text/plain" },
    (uri) => ({ uri, mimeType: "text/plain", text: "hi" })
  );
  assert.equal(r.size(), 1);
  assert.equal(r.has("info://about"), true);
  assert.equal(r.list()[0].uri, "info://about");
  assert.equal("handler" in (r.list()[0] as object), false);

  const read = await r.read("info://about");
  assert.equal(read.ok, true);
  assert.deepEqual(read.value, { uri: "info://about", mimeType: "text/plain", text: "hi" });

  const miss = await r.read("info://nope");
  assert.equal(miss.ok, false);
  assert.equal(miss.error?.code, "unknown_resource");
});

test("ResourceRegistry rejects bad uris and duplicates", () => {
  const r = new ResourceRegistry();
  assert.throws(
    () => r.register({ uri: "not-a-uri", name: "x" }, () => ({ uri: "x" })),
    /invalid resource uri/
  );
  r.register({ uri: "info://x", name: "x" }, () => ({ uri: "info://x" }));
  assert.throws(
    () => r.register({ uri: "info://x", name: "y" }, () => ({ uri: "info://x" })),
    /already registered/
  );
});

test("PromptRegistry renders and enforces required arguments", async () => {
  const r = new PromptRegistry();
  r.register(
    {
      name: "summarize",
      description: "Summarize text.",
      arguments: [{ name: "text", required: true }],
    },
    (args) => ({
      description: "Summarize",
      messages: [{ role: "user", content: { type: "text", text: String(args.text) } }],
    })
  );

  assert.equal(r.size(), 1);
  assert.equal(r.list()[0].name, "summarize");

  const ok = await r.render("summarize", { text: "hello" });
  assert.equal(ok.ok, true);

  const missing = await r.render("summarize", {});
  assert.equal(missing.ok, false);
  assert.equal(missing.error?.code, "invalid_args");
  assert.match(missing.error!.message, /missing required argument/);

  const unknown = await r.render("nope", {});
  assert.equal(unknown.error?.code, "unknown_prompt");
});
