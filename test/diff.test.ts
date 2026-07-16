import { test } from "node:test";
import assert from "node:assert/strict";
import { diffSpecs, formatDiff } from "../src/diff.js";
import type { ServerSpec, ToolDefinition } from "../src/types.js";

function baseSpec(): ServerSpec {
  return {
    name: "srv",
    version: "1.0.0",
    tools: [
      {
        name: "add",
        description: "Add two integers.",
        inputSchema: {
          type: "object",
          properties: { a: { type: "integer" }, b: { type: "integer" } },
          required: ["a", "b"],
        },
      },
    ],
    resources: [{ uri: "info://about", name: "about" }],
    resourceTemplates: [{ uriTemplate: "greeting://{who}", name: "greeting" }],
    prompts: [
      {
        name: "summarize",
        arguments: [{ name: "text", required: true }],
      },
    ],
  };
}

/** Find a change touching a given target/name, for focused assertions. */
function find(changes: ReturnType<typeof diffSpecs>["changes"], detailRe: RegExp) {
  return changes.find((c) => detailRe.test(c.detail));
}

test("identical specs produce no changes and are non-breaking", () => {
  const d = diffSpecs(baseSpec(), baseSpec());
  assert.equal(d.changes.length, 0);
  assert.equal(d.breaking, false);
  assert.deepEqual(d.summary, { added: 0, removed: 0, changed: 0, breaking: 0 });
});

test("adding a tool is compatible", () => {
  const after = baseSpec();
  after.tools!.push({
    name: "sub",
    description: "Subtract.",
    inputSchema: { type: "object" },
  });
  const d = diffSpecs(baseSpec(), after);
  assert.equal(d.breaking, false);
  const c = find(d.changes, /tool "sub" added/);
  assert.ok(c);
  assert.equal(c!.kind, "added");
  assert.equal(c!.breaking, false);
});

test("removing a tool is breaking", () => {
  const after = baseSpec();
  after.tools = [];
  const d = diffSpecs(baseSpec(), after);
  assert.equal(d.breaking, true);
  const c = find(d.changes, /tool "add" removed/);
  assert.ok(c);
  assert.equal(c!.kind, "removed");
  assert.equal(c!.breaking, true);
});

test("adding a new required input property is breaking", () => {
  const after = baseSpec();
  after.tools![0].inputSchema.properties!.c = { type: "integer" };
  after.tools![0].inputSchema.required = ["a", "b", "c"];
  const d = diffSpecs(baseSpec(), after);
  const c = find(d.changes, /input adds required property "c"/);
  assert.ok(c);
  assert.equal(c!.breaking, true);
  assert.equal(d.breaking, true);
});

test("adding a new optional input property is compatible", () => {
  const after = baseSpec();
  after.tools![0].inputSchema.properties!.c = { type: "integer" };
  const d = diffSpecs(baseSpec(), after);
  const c = find(d.changes, /input adds optional property "c"/);
  assert.ok(c);
  assert.equal(c!.breaking, false);
  assert.equal(d.breaking, false);
});

test("making an existing property required is breaking", () => {
  const before = baseSpec();
  before.tools![0].inputSchema.properties!.c = { type: "integer" };
  const after = baseSpec();
  after.tools![0].inputSchema.properties!.c = { type: "integer" };
  after.tools![0].inputSchema.required = ["a", "b", "c"];
  const d = diffSpecs(before, after);
  const c = find(d.changes, /property "c" became required/);
  assert.ok(c);
  assert.equal(c!.breaking, true);
});

test("relaxing a required property to optional is compatible", () => {
  const after = baseSpec();
  after.tools![0].inputSchema.required = ["a"]; // b no longer required
  const d = diffSpecs(baseSpec(), after);
  const c = find(d.changes, /property "b" is no longer required/);
  assert.ok(c);
  assert.equal(c!.breaking, false);
  assert.equal(d.breaking, false);
});

test("changing an input property's type is breaking", () => {
  const after = baseSpec();
  after.tools![0].inputSchema.properties!.a = { type: "string" };
  const d = diffSpecs(baseSpec(), after);
  const c = find(d.changes, /property "a" type changed integer → string/);
  assert.ok(c);
  assert.equal(c!.breaking, true);
});

test("removing an input property is compatible", () => {
  const after = baseSpec();
  delete after.tools![0].inputSchema.properties!.b;
  after.tools![0].inputSchema.required = ["a"];
  const d = diffSpecs(baseSpec(), after);
  const c = find(d.changes, /input property "b" removed/);
  assert.ok(c);
  assert.equal(c!.breaking, false);
});

test("description and outputSchema changes are recorded but compatible", () => {
  const after = baseSpec();
  after.tools![0].description = "Add two whole numbers.";
  after.tools![0].outputSchema = {
    type: "object",
    properties: { sum: { type: "integer" } },
  };
  const d = diffSpecs(baseSpec(), after);
  assert.ok(find(d.changes, /description changed/));
  assert.ok(find(d.changes, /outputSchema added/));
  assert.equal(d.breaking, false);
});

test("removing a resource is breaking; adding one is compatible", () => {
  const after = baseSpec();
  after.resources = [{ uri: "info://version", name: "version" }];
  const d = diffSpecs(baseSpec(), after);
  assert.ok(find(d.changes, /resource "info:\/\/about" removed/)!.breaking);
  assert.equal(find(d.changes, /resource "info:\/\/version" added/)!.breaking, false);
  assert.equal(d.breaking, true);
});

test("changing a resource template's uriTemplate is breaking", () => {
  const after = baseSpec();
  after.resourceTemplates![0].uriTemplate = "greeting://{name}";
  const d = diffSpecs(baseSpec(), after);
  const c = find(d.changes, /uriTemplate changed/);
  assert.ok(c);
  assert.equal(c!.breaking, true);
});

test("removing a prompt is breaking", () => {
  const after = baseSpec();
  after.prompts = [];
  const d = diffSpecs(baseSpec(), after);
  assert.ok(find(d.changes, /prompt "summarize" removed/)!.breaking);
});

test("adding a required prompt argument is breaking; optional is not", () => {
  const after = baseSpec();
  after.prompts![0].arguments = [
    { name: "text", required: true },
    { name: "lang", required: true },
    { name: "style", required: false },
  ];
  const d = diffSpecs(baseSpec(), after);
  assert.equal(find(d.changes, /adds required argument "lang"/)!.breaking, true);
  assert.equal(find(d.changes, /adds optional argument "style"/)!.breaking, false);
});

test("promoting an optional prompt arg to required is breaking", () => {
  const before = baseSpec();
  before.prompts![0].arguments = [
    { name: "text", required: true },
    { name: "style", required: false },
  ];
  const after = baseSpec();
  after.prompts![0].arguments = [
    { name: "text", required: true },
    { name: "style", required: true },
  ];
  const d = diffSpecs(before, after);
  assert.equal(find(d.changes, /argument "style" became required/)!.breaking, true);
});

test("changing the server name is breaking; version bump is not", () => {
  const after = baseSpec();
  after.name = "srv2";
  after.version = "2.0.0";
  const d = diffSpecs(baseSpec(), after);
  assert.equal(find(d.changes, /server name changed/)!.breaking, true);
  assert.equal(find(d.changes, /version changed/)!.breaking, false);
});

test("diffSpecs accepts bare tool catalogs and skips server identity", () => {
  const before: ToolDefinition[] = [
    { name: "a", description: "x", inputSchema: { type: "object" } },
  ];
  const after: ToolDefinition[] = [
    { name: "b", description: "y", inputSchema: { type: "object" } },
  ];
  const d = diffSpecs(before, after);
  assert.ok(find(d.changes, /tool "a" removed/)!.breaking);
  assert.ok(find(d.changes, /tool "b" added/));
  // No server-identity change should appear for tool-array inputs.
  assert.equal(d.changes.some((c) => c.target === "server"), false);
});

test("changes are sorted breaking-first", () => {
  const after = baseSpec();
  after.tools!.push({
    name: "zzz",
    description: "compatible add",
    inputSchema: { type: "object" },
  });
  after.tools = after.tools!.filter((t) => t.name !== "add"); // breaking removal
  const d = diffSpecs(baseSpec(), after);
  assert.equal(d.changes[0].breaking, true);
  assert.equal(d.changes[d.changes.length - 1].breaking, false);
});

test("summary counts reflect the classified changes", () => {
  const after = baseSpec();
  after.tools = []; // remove 'add' (1 removed, breaking)
  after.prompts![0].arguments = [
    { name: "text", required: true },
    { name: "extra", required: false }, // 1 changed, compatible
  ];
  const d = diffSpecs(baseSpec(), after);
  assert.equal(d.summary.removed, 1);
  assert.ok(d.summary.changed >= 1);
  assert.equal(d.summary.breaking, 1);
});

test("formatDiff renders identical specs and breaking changes readably", () => {
  assert.match(formatDiff(diffSpecs(baseSpec(), baseSpec())), /identical/);
  const after = baseSpec();
  after.tools = [];
  const text = formatDiff(diffSpecs(baseSpec(), after));
  assert.match(text, /BREAKING/);
  assert.match(text, /1 breaking/);
});
