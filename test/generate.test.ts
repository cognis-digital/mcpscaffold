import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { generateServerFiles } from "../src/generate.js";
import { scaffoldFromSpec } from "../src/scaffold.js";
import { EXAMPLE_SPEC, starterSpec } from "../src/spec.js";
import { MCP_PROTOCOL_VERSION } from "../src/types.js";

test("generateServerFiles is pure and emits the expected core files", () => {
  const files = generateServerFiles(EXAMPLE_SPEC);
  const paths = files.map((f) => f.path);
  for (const p of [
    "spec.json",
    "tools.json",
    "src/server.mjs",
    "src/transport.mjs",
    "src/auth.mjs",
    "test/server.test.mjs",
    "scripts/smoke.mjs",
    "README.md",
  ]) {
    assert.ok(paths.includes(p), `expected generated file ${p}`);
  }
});

test("generated server.mjs targets the correct protocol version and methods", () => {
  const server = generateServerFiles(EXAMPLE_SPEC).find((f) => f.path === "src/server.mjs")!;
  assert.match(server.contents, new RegExp(MCP_PROTOCOL_VERSION));
  for (const method of [
    "initialize",
    "tools/list",
    "tools/call",
    "resources/list",
    "resources/read",
    "resources/templates/list",
    "prompts/list",
    "prompts/get",
    "ping",
  ]) {
    assert.match(server.contents, new RegExp(`"${method.replace("/", "\\/")}"`), `missing case ${method}`);
  }
});

test("generated transport uses newline framing and stdout discipline", () => {
  const t = generateServerFiles(starterSpec("x")).find((f) => f.path === "src/transport.mjs")!;
  assert.match(t.contents, /JSON\.stringify\(message\) \+ "\\n"/);
  assert.match(t.contents, /createInterface/);
});

test("no-auth spec emits allow-with-TODO and no bearer example", () => {
  const spec = starterSpec("noauth"); // auth.scheme === "none"
  const auth = generateServerFiles(spec).find((f) => f.path === "src/auth.mjs")!;
  assert.match(auth.contents, /return \{ ok: true \}/);
  assert.doesNotMatch(auth.contents, /MCP_PRESENTED_TOKEN/);
});

// Import the generated server module in-process and drive its router. This
// proves the generated JS is syntactically valid and returns MCP-shaped results
// without spawning a child (that is covered by integration.test.ts).
test("generated server module handles initialize + tools/call in-process", async () => {
  const base = mkdtempSync(join(tmpdir(), "mcpgen-"));
  try {
    const target = join(base, "srv");
    scaffoldFromSpec({ ...EXAMPLE_SPEC, name: "srv" }, target);
    const mod = await import(pathToFileURL(join(target, "src", "server.mjs")).href);

    const init = await mod.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "t", version: "0" } },
    });
    assert.equal(init.result.protocolVersion, MCP_PROTOCOL_VERSION);
    assert.equal(init.result.serverInfo.name, "srv");
    assert.ok(init.result.capabilities.tools);
    assert.ok(init.result.capabilities.resources);
    assert.ok(init.result.capabilities.prompts);

    const list = await mod.handleRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    assert.equal(list.result.tools.length, 3);

    const add = await mod.handleRequest({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "echo", arguments: { text: "hi" } },
    });
    assert.ok(Array.isArray(add.result.content));
    assert.equal(add.result.content[0].type, "text");

    // resource templates + read
    const tmpls = await mod.handleRequest({ jsonrpc: "2.0", id: 4, method: "resources/templates/list" });
    assert.equal(tmpls.result.resourceTemplates.length, 1);

    const readTmpl = await mod.handleRequest({
      jsonrpc: "2.0",
      id: 5,
      method: "resources/read",
      params: { uri: "greeting://world" },
    });
    assert.ok(readTmpl.result.contents[0].text.includes("world"));

    const prompt = await mod.handleRequest({
      jsonrpc: "2.0",
      id: 6,
      method: "prompts/get",
      params: { name: "summarize", arguments: { text: "abc" } },
    });
    assert.ok(Array.isArray(prompt.result.messages));

    const unknownRes = await mod.handleRequest({
      jsonrpc: "2.0",
      id: 7,
      method: "resources/read",
      params: { uri: "info://missing" },
    });
    assert.equal(unknownRes.error.code, -32002);

    const unknownMethod = await mod.handleRequest({ jsonrpc: "2.0", id: 8, method: "no/such" });
    assert.equal(unknownMethod.error.code, -32601);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
