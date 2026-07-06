import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { scaffoldFromSpec } from "../src/scaffold.js";
import { EXAMPLE_SPEC } from "../src/spec.js";
import { MCP_PROTOCOL_VERSION } from "../src/types.js";

/**
 * Spawn the generated server (a real child process) and exchange JSON-RPC
 * messages with it over stdio, exactly as an MCP client would. Cross-platform:
 * uses process.execPath + the script path with shell:false so Windows works.
 */
test("generated server answers initialize + tools/call over stdio", async () => {
  const base = mkdtempSync(join(tmpdir(), "mcpint-"));
  let child: ChildProcessWithoutNullStreams | undefined;
  try {
    const target = join(base, "intsrv");
    scaffoldFromSpec({ ...EXAMPLE_SPEC, name: "intsrv" }, target);
    const serverPath = join(target, "src", "server.mjs");

    child = spawn(process.execPath, [serverPath], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });

    let buffer = "";
    const pending = new Map<number, (msg: any) => void>();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        const resolve = pending.get(msg.id);
        if (resolve) {
          pending.delete(msg.id);
          resolve(msg);
        }
      }
    });

    function send(msg: Record<string, unknown>): Promise<any> {
      return new Promise((resolve, reject) => {
        const id = msg.id as number;
        const timer = setTimeout(() => reject(new Error(`timeout waiting for id ${id}`)), 10_000);
        pending.set(id, (m) => {
          clearTimeout(timer);
          resolve(m);
        });
        child!.stdin.write(JSON.stringify(msg) + "\n");
      });
    }

    // initialize
    const init = await send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "integration-test", version: "0" },
      },
    });
    assert.equal(init.jsonrpc, "2.0");
    assert.equal(init.result.protocolVersion, MCP_PROTOCOL_VERSION);
    assert.equal(init.result.serverInfo.name, "intsrv");

    // notifications/initialized — no response expected; just don't crash.
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

    // tools/list
    const listed = await send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    assert.ok(Array.isArray(listed.result.tools));
    assert.equal(listed.result.tools.length, EXAMPLE_SPEC.tools!.length);

    // tools/call
    const called = await send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "echo", arguments: { text: "over-stdio" } },
    });
    assert.ok(Array.isArray(called.result.content));
    assert.equal(called.result.content[0].type, "text");

    // prompts/get
    const prompt = await send({
      jsonrpc: "2.0",
      id: 4,
      method: "prompts/get",
      params: { name: "summarize", arguments: { text: "hello" } },
    });
    assert.ok(Array.isArray(prompt.result.messages));
  } finally {
    child?.stdin.end();
    child?.kill();
    rmSync(base, { recursive: true, force: true });
  }
});
