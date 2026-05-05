// AikoRuntime の単体テスト。
//
// MockTransport を仕込んだ CodexClient を AikoRuntime に注入し、
// 一時 ~/.aiko/ フィクスチャと組み合わせて end-to-end の挙動を検証する。

import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { AikoRuntime } from "../src/aiko-runtime.js";
import { CodexClient } from "../src/codex-client/codex-client.js";
import { MockTransport } from "./mock-transport.js";

interface Fixture {
  aikoHome: string;
  cleanup: () => Promise<void>;
}

async function makeAikoFixture(mode: "origin" | "override" = "origin"): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "aiko-runtime-test-"));
  await mkdir(join(root, "persona"), { recursive: true });
  await writeFile(join(root, "persona", "aiko-origin.md"), "# Origin\n");
  await writeFile(join(root, "persona", "aiko-override.md"), "# Override\n");
  await writeFile(join(root, "persona", "INVARIANTS.md"), "# INVARIANTS\n");
  if (mode === "override") {
    await writeFile(join(root, "mode"), "override\n");
  }
  return { aikoHome: root, cleanup: async () => rm(root, { recursive: true, force: true }) };
}

function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = (): void => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("waitFor timeout"));
      setImmediate(tick);
    };
    tick();
  });
}

/** initialize → initialized ハンドシェイクのみ完了させた CodexClient を返す。
 *  thread/start のレスポンスは各テスト側で個別に push する。 */
async function bootClient(transport: MockTransport): Promise<CodexClient> {
  const client = new CodexClient({ transport });
  const startP = client.start();
  await waitFor(() => transport.writes.length >= 1);
  const init = transport.lastWrite();
  transport.pushIncoming({ jsonrpc: "2.0", id: init.id, result: { protocolVersion: "2024-11-05" } });
  await startP;
  return client;
}

describe("AikoRuntime.start", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await makeAikoFixture();
  });
  afterEach(async () => {
    await fixture.cleanup();
  });

  it("loads persona, opens a thread with baseInstructions, and exposes mode", async () => {
    const t = new MockTransport();
    const client = await bootClient(t);

    const runtime = new AikoRuntime({ aikoHome: fixture.aikoHome, codexClient: client });
    const startP = runtime.start();

    await waitFor(() => t.writes.some((w) => JSON.parse(w).method === "thread/start"));
    const threadStart = t.writes.map((w) => JSON.parse(w)).find((m) => m.method === "thread/start");
    assert.ok(threadStart);
    // baseInstructions が含まれていること（spec §6.3 の主要セクション見出し）
    assert.match(threadStart.params.baseInstructions, /# 不変条項/);
    assert.match(threadStart.params.baseInstructions, /# 人格/);
    assert.match(threadStart.params.baseInstructions, /Aiko-origin: /);
    assert.equal(threadStart.params.ephemeral, false);
    t.pushIncoming({ jsonrpc: "2.0", id: threadStart.id, result: { thread: { id: "th-1" } } });
    await startP;

    assert.equal(runtime.isReady, true);
    assert.equal(runtime.mode, "origin");
    assert.equal(runtime.threadId, "th-1");
    await client.stop();
  });

  it("uses override mode when ~/.aiko/mode says override", async () => {
    await fixture.cleanup();
    fixture = await makeAikoFixture("override");
    const t = new MockTransport();
    const client = await bootClient(t);
    const runtime = new AikoRuntime({ aikoHome: fixture.aikoHome, codexClient: client });
    const startP = runtime.start();
    await waitFor(() => t.writes.some((w) => JSON.parse(w).method === "thread/start"));
    const threadStart = t.writes.map((w) => JSON.parse(w)).find((m) => m.method === "thread/start");
    assert.ok(threadStart);
    assert.match(threadStart.params.baseInstructions, /Aiko-override: /);
    t.pushIncoming({ jsonrpc: "2.0", id: threadStart.id, result: { thread: { id: "th-2" } } });
    await startP;
    assert.equal(runtime.mode, "override");
    await client.stop();
  });

  it("rejects mode/threadId access before start()", () => {
    const runtime = new AikoRuntime({ aikoHome: fixture.aikoHome });
    assert.throws(() => runtime.mode, /not started/);
    assert.throws(() => runtime.threadId, /not started/);
    assert.equal(runtime.isReady, false);
  });

  it("rejects restartThread() before start()", async () => {
    const t = new MockTransport();
    const client = await bootClient(t);
    const runtime = new AikoRuntime({ aikoHome: fixture.aikoHome, codexClient: client });
    await assert.rejects(runtime.restartThread(), /not started/);
    await client.stop();
  });

  it("rejects runInvariantsCheck() before start()", async () => {
    const t = new MockTransport();
    const client = await bootClient(t);
    const runtime = new AikoRuntime({ aikoHome: fixture.aikoHome, codexClient: client });
    await assert.rejects(
      runtime.runInvariantsCheck("# IV\nbe polite\n", "test instruction"),
      /not started/
    );
    await client.stop();
  });

  it("rolls back snapshot/threadId when thread/start fails after CodexClient.start succeeds", async () => {
    const t = new MockTransport();
    const client = await bootClient(t);
    const runtime = new AikoRuntime({ aikoHome: fixture.aikoHome, codexClient: client });
    const startP = runtime.start();
    await waitFor(() => t.writes.some((w) => JSON.parse(w).method === "thread/start"));
    const threadStart = t.writes.map((w) => JSON.parse(w)).find((m) => m.method === "thread/start");
    assert.ok(threadStart);
    // thread/start にエラー応答を返す
    t.pushIncoming({
      jsonrpc: "2.0",
      id: threadStart.id,
      error: { code: -32603, message: "thread quota exceeded" },
    });
    await assert.rejects(startP, /thread quota exceeded/);
    // ロールバック確認：未 ready
    assert.equal(runtime.isReady, false);
    assert.throws(() => runtime.threadId, /not started/);
    await client.stop();
  });
});

describe("AikoRuntime.ask (prefix enforcement)", () => {
  let fixture: Fixture;
  let transport: MockTransport;
  let client: CodexClient;
  let runtime: AikoRuntime;

  beforeEach(async () => {
    fixture = await makeAikoFixture();
    transport = new MockTransport();
    client = await bootClient(transport);
    runtime = new AikoRuntime({ aikoHome: fixture.aikoHome, codexClient: client });
    const startP = runtime.start();
    await waitFor(() => transport.writes.some((w) => JSON.parse(w).method === "thread/start"));
    const threadStart = transport.writes
      .map((w) => JSON.parse(w))
      .find((m) => m.method === "thread/start");
    assert.ok(threadStart);
    transport.pushIncoming({
      jsonrpc: "2.0",
      id: threadStart.id,
      result: { thread: { id: "th-prefix" } },
    });
    await startP;
  });

  afterEach(async () => {
    await client.stop();
    await fixture.cleanup();
  });

  async function runOneTurn(deltas: string[]): Promise<{ text: string; collected: string }> {
    const collected: string[] = [];
    const askP = runtime.ask({ text: "hi", onDelta: (c) => collected.push(c) });
    await waitFor(() => transport.writes.some((w) => JSON.parse(w).method === "turn/start"));
    const turnStart = transport.writes
      .map((w) => JSON.parse(w))
      .find((m) => m.method === "turn/start");
    assert.ok(turnStart);
    transport.pushIncoming({
      jsonrpc: "2.0",
      id: turnStart.id,
      result: { turn: { id: "turn-x", items: [], status: "inProgress", error: null } },
    });
    for (const d of deltas) {
      transport.pushIncoming({
        jsonrpc: "2.0",
        method: "item/agentMessage/delta",
        params: { threadId: "th-prefix", turnId: "turn-x", itemId: "i", delta: d },
      });
    }
    transport.pushIncoming({
      jsonrpc: "2.0",
      method: "turn/completed",
      params: {
        threadId: "th-prefix",
        turn: { id: "turn-x", items: [], status: "completed", error: null },
      },
    });
    const result = await askP;
    return { text: result.text, collected: collected.join("") };
  }

  it("does not modify response that already starts with the expected prefix", async () => {
    const { text, collected } = await runOneTurn(["Aiko-origin: ", "ok"]);
    assert.equal(text, "Aiko-origin: ok");
    assert.equal(collected, "Aiko-origin: ok");
    assert.equal(runtime.prefixForcedCount, 0);
  });

  it("forces prefix into both stream output and final text when missing", async () => {
    const { text, collected } = await runOneTurn(["hello", " world"]);
    assert.equal(text, "Aiko-origin: hello world");
    assert.equal(collected, "Aiko-origin: hello world");
    assert.equal(runtime.prefixForcedCount, 1);
  });

  it("counts prefix forcing once even when both stream and text need fixing", async () => {
    const { text } = await runOneTurn(["hi"]);
    assert.equal(text, "Aiko-origin: hi");
    assert.equal(runtime.prefixForcedCount, 1);
  });

  it("does not double-prefix when an empty/whitespace first chunk precedes the real prefix", async () => {
    // 旧バグ：最初の chunk が空白だけだと「prefix が無い」と誤判定して二重 prefix になっていた。
    // 期待挙動：勝手に補完せず、応答の prefix を 1 度だけ通す（先頭空白は元応答のまま温存）。
    const { text, collected } = await runOneTurn(["", "  ", "Aiko-origin: ", "ok"]);
    assert.equal(collected.match(/Aiko-origin:/g)?.length, 1);
    assert.equal(text.match(/Aiko-origin:/g)?.length, 1);
    assert.equal(runtime.prefixForcedCount, 0);
  });

  it("buffers tiny chunks until prefix decision is possible", async () => {
    // prefix 1 文字ずつ流す：判定保留しながらバッファし、確定で flush
    const chunks = ["A", "i", "k", "o", "-", "o", "r", "i", "g", "i", "n", ":", " hi"];
    const { text, collected } = await runOneTurn(chunks);
    assert.equal(text, "Aiko-origin: hi");
    assert.equal(collected, "Aiko-origin: hi");
    assert.equal(runtime.prefixForcedCount, 0);
  });

  it("flushes buffered head and forces prefix when stream ends shorter than prefix", async () => {
    // 応答全体が prefix 長より短い → 終端処理で flush ＋ 強制補完
    const { text, collected } = await runOneTurn(["hi"]);
    assert.equal(text, "Aiko-origin: hi");
    // collected も補完済 prefix を含む
    assert.match(collected, /^Aiko-origin: hi$/);
  });
});

describe("AikoRuntime.stop", () => {
  it("does not stop an externally provided CodexClient (caller owns lifecycle)", async () => {
    const fixture = await makeAikoFixture();
    try {
      const t = new MockTransport();
      const client = await bootClient(t);
      const runtime = new AikoRuntime({ aikoHome: fixture.aikoHome, codexClient: client });
      const startP = runtime.start();
      await waitFor(() => t.writes.some((w) => JSON.parse(w).method === "thread/start"));
      const ts = t.writes.map((w) => JSON.parse(w)).find((m) => m.method === "thread/start");
      assert.ok(ts);
      t.pushIncoming({ jsonrpc: "2.0", id: ts.id, result: { thread: { id: "th-stop" } } });
      await startP;

      await runtime.stop();
      // 外部提供 client は stop されない（transport がまだ "started" 状態）
      assert.equal(t.isStarted(), true);
      assert.equal(runtime.isReady, false);

      await client.stop();
      assert.equal(t.isStarted(), false);
    } finally {
      await fixture.cleanup();
    }
  });
});
