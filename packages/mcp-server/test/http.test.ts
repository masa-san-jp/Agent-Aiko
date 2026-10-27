import { randomBytes } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { createAikoServer } from "../src/aiko-server.js";
import { startLocalHttpServer, type LocalHttpOptions } from "../src/http.js";
import type { OAuthResource } from "../src/oauth.js";

const deps = {
  personaRepository: { load: async () => ({
    id: "aiko", version: "0.1.0", identityCore: "あたしはアイコ。",
    invariants: "取り繕わない。", behavioralContract: "仕様を確かめる。", sources: [],
  }) },
  user: { context: { id: "test" }, privacy: { allowRemotePersonaService: false, allowUsageTelemetry: false } },
};
const token = randomBytes(32).toString("base64url");
const auth = { Authorization: `Bearer ${token}` };
const headers = { ...auth, "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
const initialize = { jsonrpc: "2.0", id: 1, method: "initialize", params: {
  protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "http-test", version: "1" },
} };
const start = (options: Omit<LocalHttpOptions, "token"> = {}) => startLocalHttpServer(() => createAikoServer(deps), { port: 0, token, ...options });
async function connect(url: URL) {
  const client = new Client({ name: "http-test", version: "1" });
  const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers: auth } });
  await client.connect(transport as Transport);
  return { client, transport };
}
function body(result: unknown): Record<string, unknown> {
  return JSON.parse((result as { content: { text: string }[] }).content[0]!.text) as Record<string, unknown>;
}

test("HTTP: limits work before OAuth verification and recovers capacity", async () => {
  let releaseVerification!: () => void;
  let startedVerification!: () => void;
  let verified = 0;
  const held = new Promise<void>((resolve) => { releaseVerification = resolve; });
  const started = new Promise<void>((resolve) => { startedVerification = resolve; });
  // Hold the externally supplied verifier; no body parsing or server construction
  // should be reached by additional requests while this request occupies the slot.
  const gateway = await startLocalHttpServer(() => createAikoServer(deps), {
    port: 0, maxConcurrentRequests: 1,
    oauth: {
      verify: async () => { verified++; startedVerification(); await held; return "owner"; },
      challenge: () => "Bearer", metadataPath: "/metadata", metadata: {},
    } as unknown as OAuthResource,
  });
  try {
    const first = fetch(gateway.url, { method: "POST", headers, body: JSON.stringify(initialize) });
    await started;
    const blocked = await fetch(gateway.url, { method: "POST", headers, body: JSON.stringify(initialize) });
    assert.equal(blocked.status, 503);
    assert.equal(blocked.headers.get("retry-after"), "1");
    assert.equal(verified, 1);
    releaseVerification();
    const completed = await first;
    assert.equal(completed.status, 200);
    assert.equal(completed.headers.get("cache-control"), "no-store");
    await completed.text();
    const next = await fetch(gateway.url, { method: "POST", headers, body: JSON.stringify(initialize) });
    assert.equal(next.status, 200);
    await next.text();
    assert.equal(verified, 2);
  } finally { releaseVerification(); await gateway.close(); }
});

test("HTTP: aborting a request cannot bypass the verification work limit", async () => {
  let releaseVerification!: () => void;
  let startedVerification!: () => void;
  const held = new Promise<void>((resolve) => { releaseVerification = resolve; });
  const started = new Promise<void>((resolve) => { startedVerification = resolve; });
  let created = 0;
  const gateway = await startLocalHttpServer(() => { created++; return createAikoServer(deps); }, {
    port: 0, maxConcurrentRequests: 1,
    oauth: {
      verify: async () => { startedVerification(); await held; return "owner"; },
      challenge: () => "Bearer", metadataPath: "/metadata", metadata: {},
    } as unknown as OAuthResource,
  });
  const first = request(gateway.url, { method: "POST", headers }, (res) => res.resume());
  first.on("error", () => {});
  try {
    first.end(JSON.stringify(initialize));
    await started;
    const closed = new Promise<void>((resolve) => { first.once("close", resolve); });
    first.destroy();
    await closed;
    const blocked = await fetch(gateway.url, { method: "POST", headers, body: JSON.stringify(initialize) });
    assert.equal(blocked.status, 503);
    releaseVerification();
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    assert.equal(created, 0, "aborted requests must not allocate MCP servers");
    const next = await fetch(gateway.url, { method: "POST", headers, body: JSON.stringify(initialize) });
    assert.equal(next.status, 200);
    await next.text();
  } finally { releaseVerification(); first.destroy(); await gateway.close(); }
});

test("HTTP: absent, wrong and malformed credentials cannot initialize or use an existing session", async () => {
  let created = 0;
  const gateway = await startLocalHttpServer(() => { created++; return createAikoServer(deps); }, { port: 0, token, maxSessions: 1 });
  const { Authorization: _authorization, ...publicHeaders } = headers;
  try {
    for (const authorization of [undefined, `Bearer ${"x".repeat(43)}`, "Basic abc", "Bearer short"]) {
      const response = await fetch(gateway.url, { method: "POST", headers: {
        ...publicHeaders, ...(authorization ? { Authorization: authorization } : {}),
      }, body: JSON.stringify(initialize) });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("www-authenticate"), 'Bearer realm="aiko-local"');
      assert.equal(response.headers.get("mcp-session-id"), null);
      assert.ok(!(await response.text()).includes(token));
    }
    assert.equal(created, 0);
    const { client, transport } = await connect(gateway.url);
    try {
      const id = transport.sessionId!;
      const call = await fetch(gateway.url, { method: "POST", headers: { ...publicHeaders, "mcp-session-id": id },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "aiko.health", arguments: {} } }),
      });
      assert.equal(call.status, 401);
      assert.equal((await fetch(gateway.url, { method: "DELETE", headers: { "mcp-session-id": id } })).status, 401);
      assert.equal(body(await client.callTool({ name: "aiko.health", arguments: {} }))["status"], "ok");
    } finally { await client.close(); }
  } finally { await gateway.close(); }
});

test("HTTP: CLI refuses to start without a valid token and never echoes it", () => {
  const entry = fileURLToPath(new URL("../dist/server.js", import.meta.url));
  for (const invalid of ["", "short", "sensitive-invalid-value!"]) {
    const result = spawnSync(process.execPath, [entry, "http", "--port", "0"], {
      env: { ...process.env, AIKO_HTTP_TOKEN: invalid }, encoding: "utf8", timeout: 5000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /AIKO_HTTP_TOKEN/);
    if (invalid) assert.ok(!result.stderr.includes(invalid));
    assert.equal(result.stdout, "");
  }
});

test("HTTP: SDK client initializes, lists tools, invokes and reads resources", async () => {
  const gateway = await start();
  const { client, transport } = await connect(gateway.url);
  try {
    assert.ok(transport.sessionId);
    assert.ok((await client.listTools()).tools.some((t) => t.name === "aiko.health"));
    assert.equal(body(await client.callTool({ name: "aiko.health", arguments: {} }))["status"], "ok");
    const resource = await client.readResource({ uri: "persona://aiko/core" });
    assert.equal((resource.contents[0] as { text: string }).text, "あたしはアイコ。");
    await transport.terminateSession();
    const response = await fetch(gateway.url, { method: "DELETE", headers: { ...auth, "mcp-session-id": transport.sessionId ?? "terminated" } });
    assert.equal(response.status, 404);
  } finally { await client.close(); await gateway.close(); }
});

test("HTTP: separate clients cannot read each other's runtime profiles", async () => {
  const gateway = await start();
  const first = await connect(gateway.url);
  const second = await connect(gateway.url);
  try {
    assert.notEqual(first.transport.sessionId, second.transport.sessionId);
    const profile = body(await first.client.callTool({ name: "aiko.bind_runtime", arguments: {
      runtime: "claude-code", injectionMethod: "claude-code:system-prompt-file",
    } }));
    assert.equal(profile["bound"], true);
    const id = profile["profile_id"];
    assert.equal(typeof id, "string");
    const own = await first.client.callTool({ name: "aiko.get_runtime_profile", arguments: { profileId: id } });
    assert.notEqual(own.isError, true);
    const other = await second.client.callTool({ name: "aiko.get_runtime_profile", arguments: { profileId: id } });
    assert.equal(other.isError, true);
  } finally { await first.client.close(); await second.client.close(); await gateway.close(); }
});

test("HTTP: rejects foreign Host/Origin before creating sessions", async () => {
  let created = 0;
  const gateway = await startLocalHttpServer(() => { created++; return createAikoServer(deps); }, { port: 0, token });
  try {
    // fetch may rewrite Host; send this case using the native HTTP client.
    const hostStatus = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(gateway.url, { method: "POST", headers: { ...headers, Host: "evil.example" } }, (res) => {
        res.resume(); resolve(res.statusCode);
      });
      req.on("error", reject);
      req.end(JSON.stringify(initialize));
    });
    assert.equal(hostStatus, 403);
    for (const extra of [{ Origin: "https://evil.example" }, { Origin: "null" }]) {
      const response = await fetch(gateway.url, { method: "POST", headers: { ...headers, ...extra }, body: JSON.stringify(initialize) });
      assert.equal(response.status, 403);
    }
    assert.equal(created, 0);
    assert.equal((await fetch(new URL("/other", gateway.url))).status, 404);
    const get = await fetch(gateway.url, { headers: auth });
    assert.equal(get.status, 405);
    assert.equal(get.headers.get("allow"), "POST, DELETE");
  } finally { await gateway.close(); }
});

test("HTTP: rejects malformed/oversized bodies and releases failed initialization slots", async () => {
  const gateway = await start({ maxSessions: 1 });
  try {
    for (const [payload, status] of [["{", 400], [" ".repeat(1024 * 1024 + 1), 413]] as const) {
      const response = await fetch(gateway.url, { method: "POST", headers, body: payload });
      assert.equal(response.status, status);
    }
    const { client } = await connect(gateway.url);
    await client.close();
  } finally { await gateway.close(); }
});

test("HTTP: session limit, explicit deletion and idle expiry free capacity", async () => {
  const gateway = await start({ maxSessions: 1, idleTimeoutMs: 1000 });
  try {
    const first = await fetch(gateway.url, { method: "POST", headers, body: JSON.stringify(initialize) });
    assert.equal(first.status, 200);
    const id = first.headers.get("mcp-session-id")!;
    await first.text();
    const blocked = await fetch(gateway.url, { method: "POST", headers, body: JSON.stringify(initialize) });
    assert.equal(blocked.status, 503);
    const deleted = await fetch(gateway.url, { method: "DELETE", headers: { ...auth, "mcp-session-id": id } });
    assert.equal(deleted.status, 200);
    const next = await fetch(gateway.url, { method: "POST", headers, body: JSON.stringify(initialize) });
    assert.equal(next.status, 200);
    const nextId = next.headers.get("mcp-session-id")!;
    await next.text();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    assert.equal((await fetch(gateway.url, { method: "DELETE", headers: { ...auth, "mcp-session-id": nextId } })).status, 404);
    const last = await connect(gateway.url);
    await last.client.close();
  } finally { await gateway.close(); }
});

test("HTTP: bundled CLI serves the bundled persona and shuts down on SIGTERM", { timeout: 10_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "aiko-http-cli-"));
  await writeFile(join(home, "user.md"), "# User\nname: FIXTURE_OWNER_NAME\n");
  const customDir = join(home, "persona", "overrides", "custom");
  await mkdir(customDir, { recursive: true });
  await writeFile(join(customDir, "persona.md"), "preserved persona");
  const child = spawn(process.execPath, [fileURLToPath(new URL("../dist/server.js", import.meta.url)), "http", "--port", "0"], {
    env: { ...process.env, AIKO_HOME: home, AIKO_USER_PROFILE: "", AIKO_PERSONA_ID: "aiko", AIKO_HTTP_TOKEN: token },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  child.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
  try {
    const url = await new Promise<URL>((resolve, reject) => {
      let stderr = "";
      child.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
        const match = /http:\/\/127\.0\.0\.1:\d+\/mcp/.exec(stderr);
        if (match) resolve(new URL(match[0]));
      });
      child.once("error", reject);
      child.once("exit", (code) => reject(new Error(`HTTP CLI exited ${code}: ${stderr}`)));
    });
    const { client } = await connect(url);
    try {
      assert.equal(body(await client.callTool({ name: "aiko.health", arguments: {} }))["status"], "ok");
      assert.ok((await client.readResource({ uri: "persona://aiko/core" })).contents.length);
      const prompt = await client.getPrompt({ name: "aiko.activate" });
      assert.match(String((prompt.messages[0]?.content as { text?: string })?.text), /FIXTURE_OWNER_NAME/);
      const denied = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(initialize) });
      assert.equal(denied.status, 401);
      assert.doesNotMatch(await denied.text(), /FIXTURE_OWNER_NAME/);
      const listed = (await client.listTools()).tools.map((tool) => tool.name);
      for (const name of ["aiko.remember_user", "aiko.switch_persona", "aiko.switch_speech_style", "aiko.save_persona", "aiko.delete_persona"]) {
        assert.ok(!listed.includes(name), name);
        const result = await client.callTool({ name, arguments: { name: "custom", content: "injected", address: "injected" } });
        assert.equal(result.isError, true, name);
      }
      assert.equal(await readFile(join(home, "user.md"), "utf8"), "# User\nname: FIXTURE_OWNER_NAME\n");
      assert.equal(await readFile(join(customDir, "persona.md"), "utf8"), "preserved persona");
      assert.deepEqual((await readdir(home)).sort(), ["persona", "user.md"]);
      assert.deepEqual(await readdir(join(home, "persona")), ["overrides"]);
    } finally { await client.close(); }
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    const [code, signal] = await exited;
    assert.equal(code, 0);
    assert.equal(signal, null);
    assert.equal(stdout, "");
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await rm(home, { recursive: true, force: true });
  }
});
