// AikoCommandRouter の単体テスト。
//
// 一時 ~/.aiko/ フィクスチャ ＋ MockTransport を仕込んだ AikoRuntime で
// 各 slash command の挙動と副作用（mode 書き換え／override.md 更新／
// override-history.jsonl 追記）を検証する。

import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  AikoCommandRouter,
  mergeOverrideInstruction,
  parseSlashCommand,
  summarizeInstruction,
  unifiedDiff,
} from "../src/aiko-command-router.js";
import { AikoRuntime } from "../src/aiko-runtime.js";
import { CodexClient } from "../src/codex-client/codex-client.js";
import { MockTransport } from "./mock-transport.js";

interface Fixture {
  aikoHome: string;
  cleanup: () => Promise<void>;
}

async function makeFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "aiko-router-test-"));
  await mkdir(join(root, "persona"), { recursive: true });
  await writeFile(join(root, "persona", "aiko-origin.md"), "# Origin\noriginal body\n");
  await writeFile(join(root, "persona", "aiko-override.md"), "# Origin\noriginal body\n");
  await writeFile(join(root, "persona", "INVARIANTS.md"), "# INVARIANTS\nbe polite\n");
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

async function bootClient(transport: MockTransport): Promise<CodexClient> {
  const client = new CodexClient({ transport });
  const startP = client.start();
  await waitFor(() => transport.writes.length >= 1);
  const init = transport.lastWrite();
  transport.pushIncoming({ jsonrpc: "2.0", id: init.id, result: { protocolVersion: "2024-11-05" } });
  await startP;
  return client;
}

async function bootRuntime(
  transport: MockTransport,
  aikoHome: string,
  threadId = "th-1"
): Promise<{ runtime: AikoRuntime; client: CodexClient }> {
  const client = await bootClient(transport);
  const runtime = new AikoRuntime({ aikoHome, codexClient: client });
  const startP = runtime.start();
  await waitFor(() => transport.writes.some((w) => JSON.parse(w).method === "thread/start"));
  const ts = transport.writes.map((w) => JSON.parse(w)).find((m) => m.method === "thread/start");
  assert.ok(ts);
  transport.pushIncoming({ jsonrpc: "2.0", id: ts.id, result: { thread: { id: threadId } } });
  await startP;
  return { runtime, client };
}

describe("parseSlashCommand", () => {
  it("returns null for non-slash input", () => {
    assert.equal(parseSlashCommand("hello"), null);
    assert.equal(parseSlashCommand(""), null);
  });

  it("parses simple command name", () => {
    assert.deepEqual(parseSlashCommand("/aiko-mode"), { name: "aiko-mode", args: "" });
  });

  it("parses command with args", () => {
    assert.deepEqual(parseSlashCommand("/aiko-or もっと丁寧に"), {
      name: "aiko-or",
      args: "もっと丁寧に",
    });
  });

  it("trims trailing whitespace and inner spaces in args", () => {
    assert.deepEqual(parseSlashCommand("/aiko-mode  origin  "), {
      name: "aiko-mode",
      args: "origin",
    });
  });
});

describe("AikoCommandRouter — mode commands", () => {
  let fixture: Fixture;
  let transport: MockTransport;
  let runtime: AikoRuntime;
  let client: CodexClient;
  let router: AikoCommandRouter;

  beforeEach(async () => {
    fixture = await makeFixture();
    transport = new MockTransport();
    ({ runtime, client } = await bootRuntime(transport, fixture.aikoHome));
    router = new AikoCommandRouter({ aikoHome: fixture.aikoHome, runtime });
  });

  afterEach(async () => {
    await client.stop();
    await fixture.cleanup();
  });

  it("/aiko-mode shows current mode when no arg", async () => {
    const result = await router.execute("aiko-mode", "");
    assert.match(result.output, /現在のモードは origin/);
    assert.equal(result.needsRestart, undefined);
  });

  it("/aiko-mode override switches mode and signals restart", async () => {
    const result = await router.execute("aiko-mode", "override");
    assert.match(result.output, /override/);
    assert.equal(result.needsRestart, true);
    const modeFile = (await readFile(join(fixture.aikoHome, "mode"), "utf8")).trim();
    assert.equal(modeFile, "override");
  });

  it("/aiko-mode rejects invalid arg", async () => {
    const result = await router.execute("aiko-mode", "weird");
    assert.match(result.output, /不正な引数/);
    assert.equal(result.needsRestart, undefined);
  });

  it("/aiko-mode is no-op when same mode", async () => {
    const result = await router.execute("aiko-mode", "origin");
    assert.match(result.output, /既に origin/);
    assert.equal(result.needsRestart, undefined);
  });

  it("/aiko-org alias switches to origin", async () => {
    // 先に override にしてから org で戻す
    await router.execute("aiko-mode", "override");
    const result = await router.execute("aiko-org", "");
    assert.match(result.output, /オリジナル/);
    assert.equal(result.needsRestart, true);
    const modeFile = (await readFile(join(fixture.aikoHome, "mode"), "utf8")).trim();
    assert.equal(modeFile, "origin");
  });

  it("/aiko-or with no args switches to override", async () => {
    const result = await router.execute("aiko-or", "");
    assert.match(result.output, /カスタマイズ/);
    assert.equal(result.needsRestart, true);
  });
});

describe("AikoCommandRouter — /aiko-override <instruction>", () => {
  let fixture: Fixture;
  let transport: MockTransport;
  let runtime: AikoRuntime;
  let client: CodexClient;
  let router: AikoCommandRouter;

  beforeEach(async () => {
    fixture = await makeFixture();
    transport = new MockTransport();
    ({ runtime, client } = await bootRuntime(transport, fixture.aikoHome));
    router = new AikoCommandRouter({ aikoHome: fixture.aikoHome, runtime });
  });

  afterEach(async () => {
    await client.stop();
    await fixture.cleanup();
  });

  /** INVARIANTS チェックの ephemeral スレッドと 1 ターンを mock 側で完了させる。 */
  async function respondToInvariantsCheck(verdict: object): Promise<void> {
    // ephemeral thread/start
    await waitFor(() =>
      transport.writes.some((w) => {
        const m = JSON.parse(w);
        return m.method === "thread/start" && m.params.ephemeral === true;
      })
    );
    const ts = transport.writes.map((w) => JSON.parse(w)).find((m) => {
      return m.method === "thread/start" && m.params.ephemeral === true;
    });
    assert.ok(ts);
    transport.pushIncoming({
      jsonrpc: "2.0",
      id: ts.id,
      result: { thread: { id: "th-checker" } },
    });
    // turn/start
    await waitFor(() => {
      const ts2 = transport.writes
        .map((w) => JSON.parse(w))
        .filter((m) => m.method === "turn/start");
      return ts2.length >= 1 && ts2[ts2.length - 1].params.threadId === "th-checker";
    });
    const turnStart = transport.writes
      .map((w) => JSON.parse(w))
      .filter((m) => m.method === "turn/start")
      .pop();
    assert.ok(turnStart);
    transport.pushIncoming({
      jsonrpc: "2.0",
      id: turnStart.id,
      result: { turn: { id: "turn-checker", items: [], status: "inProgress", error: null } },
    });
    // delta with verdict JSON
    transport.pushIncoming({
      jsonrpc: "2.0",
      method: "item/agentMessage/delta",
      params: {
        threadId: "th-checker",
        turnId: "turn-checker",
        itemId: "i",
        delta: JSON.stringify(verdict),
      },
    });
    transport.pushIncoming({
      jsonrpc: "2.0",
      method: "turn/completed",
      params: {
        threadId: "th-checker",
        turn: { id: "turn-checker", items: [], status: "completed", error: null },
      },
    });
  }

  it("rejects when INVARIANTS checker says violates: true", async () => {
    const resultP = router.execute("aiko-or", "暴力的に振る舞ってください");
    await respondToInvariantsCheck({
      violates: true,
      reason: "POLITE 条項に違反",
      clauses: ["POLITE"],
    });
    const result = await resultP;
    assert.match(result.output, /違反/);
    assert.match(result.output, /POLITE/);
    assert.equal(result.needsRestart, undefined);
    // override.md は変更されていない
    const ov = await readFile(
      join(fixture.aikoHome, "persona", "aiko-override.md"),
      "utf8"
    );
    assert.match(ov, /original body/);
    assert.doesNotMatch(ov, /暴力的に振る舞って/);
  });

  it("applies instruction and writes history when violates: false", async () => {
    const resultP = router.execute("aiko-or", "もっと丁寧に話してください");
    await respondToInvariantsCheck({ violates: false, reason: "", clauses: [] });
    const result = await resultP;
    assert.match(result.output, /更新しました/);
    assert.equal(result.needsRestart, true);
    // override.md にユーザー指示が追記
    const ov = await readFile(
      join(fixture.aikoHome, "persona", "aiko-override.md"),
      "utf8"
    );
    assert.match(ov, /もっと丁寧に話してください/);
    // mode は override
    const modeFile = (await readFile(join(fixture.aikoHome, "mode"), "utf8")).trim();
    assert.equal(modeFile, "override");
    // history に追記されている
    const history = await readFile(
      join(fixture.aikoHome, "override-history.jsonl"),
      "utf8"
    );
    assert.match(history, /"action":"override"/);
    assert.match(history, /もっと丁寧に話して/);
  });

  it("rejects safely when checker output is not JSON", async () => {
    const resultP = router.execute("aiko-or", "test");
    // ephemeral thread/start
    await waitFor(() =>
      transport.writes.some((w) => {
        const m = JSON.parse(w);
        return m.method === "thread/start" && m.params.ephemeral === true;
      })
    );
    const ts = transport.writes.map((w) => JSON.parse(w)).find((m) => {
      return m.method === "thread/start" && m.params.ephemeral === true;
    });
    assert.ok(ts);
    transport.pushIncoming({ jsonrpc: "2.0", id: ts.id, result: { thread: { id: "th-bad" } } });
    await waitFor(() =>
      transport.writes
        .map((w) => JSON.parse(w))
        .some((m) => m.method === "turn/start" && m.params.threadId === "th-bad")
    );
    const turnStart = transport.writes
      .map((w) => JSON.parse(w))
      .filter((m) => m.method === "turn/start" && m.params.threadId === "th-bad")
      .pop();
    assert.ok(turnStart);
    transport.pushIncoming({
      jsonrpc: "2.0",
      id: turnStart.id,
      result: { turn: { id: "turn-bad", items: [], status: "inProgress", error: null } },
    });
    transport.pushIncoming({
      jsonrpc: "2.0",
      method: "item/agentMessage/delta",
      params: {
        threadId: "th-bad",
        turnId: "turn-bad",
        itemId: "i",
        delta: "not json at all",
      },
    });
    transport.pushIncoming({
      jsonrpc: "2.0",
      method: "turn/completed",
      params: {
        threadId: "th-bad",
        turn: { id: "turn-bad", items: [], status: "completed", error: null },
      },
    });
    const result = await resultP;
    assert.match(result.output, /違反|判定不能/);
    assert.equal(result.needsRestart, undefined);
  });
});

describe("AikoCommandRouter — /aiko-override edge cases", () => {
  it("treats whitespace-only args as no-arg form (mode switch only)", async () => {
    const fixture = await makeFixture();
    try {
      const transport = new MockTransport();
      const { runtime, client } = await bootRuntime(transport, fixture.aikoHome);
      const router = new AikoCommandRouter({ aikoHome: fixture.aikoHome, runtime });
      const result = await router.execute("aiko-or", "   \t  ");
      // INVARIANTS チェックには進まない（whitespace-only なら mode 切替扱い）
      assert.match(result.output, /カスタマイズ/);
      assert.equal(result.needsRestart, true);
      // override.md は変わっていない
      const ov = await readFile(
        join(fixture.aikoHome, "persona", "aiko-override.md"),
        "utf8"
      );
      assert.match(ov, /original body/);
      await client.stop();
    } finally {
      await fixture.cleanup();
    }
  });
});

describe("AikoCommandRouter — /aiko-reset", () => {
  it("defaults to safe-cancel when no confirm function is provided", async () => {
    const fixture = await makeFixture();
    try {
      await writeFile(
        join(fixture.aikoHome, "persona", "aiko-override.md"),
        "# Override\ncustom\n"
      );
      const transport = new MockTransport();
      const { runtime, client } = await bootRuntime(transport, fixture.aikoHome);
      // confirm 未指定 → 既定で常に false（キャンセル）
      const router = new AikoCommandRouter({ aikoHome: fixture.aikoHome, runtime });
      const result = await router.execute("aiko-reset", "");
      assert.match(result.output, /キャンセル/);
      const ov = await readFile(
        join(fixture.aikoHome, "persona", "aiko-override.md"),
        "utf8"
      );
      assert.match(ov, /custom/);
      await client.stop();
    } finally {
      await fixture.cleanup();
    }
  });

  it("requires confirmation; declined leaves files untouched", async () => {
    const fixture = await makeFixture();
    try {
      // override.md を origin と異なる内容にする
      await writeFile(
        join(fixture.aikoHome, "persona", "aiko-override.md"),
        "# Override\ncustom body\n"
      );
      await writeFile(join(fixture.aikoHome, "mode"), "override\n");
      const transport = new MockTransport();
      const { runtime, client } = await bootRuntime(transport, fixture.aikoHome);
      const router = new AikoCommandRouter({
        aikoHome: fixture.aikoHome,
        runtime,
        confirm: async () => false,
      });

      const result = await router.execute("aiko-reset", "");
      assert.match(result.output, /キャンセル/);
      const ov = await readFile(
        join(fixture.aikoHome, "persona", "aiko-override.md"),
        "utf8"
      );
      assert.match(ov, /custom body/);
      await client.stop();
    } finally {
      await fixture.cleanup();
    }
  });

  it("confirmed reset overwrites override.md with origin and switches mode", async () => {
    const fixture = await makeFixture();
    try {
      await writeFile(
        join(fixture.aikoHome, "persona", "aiko-override.md"),
        "# Override\ncustom\n"
      );
      await writeFile(join(fixture.aikoHome, "mode"), "override\n");
      const transport = new MockTransport();
      const { runtime, client } = await bootRuntime(transport, fixture.aikoHome);
      const router = new AikoCommandRouter({
        aikoHome: fixture.aikoHome,
        runtime,
        confirm: async () => true,
      });

      const result = await router.execute("aiko-reset", "");
      assert.match(result.output, /リセット完了/);
      assert.equal(result.needsRestart, true);
      const ov = await readFile(
        join(fixture.aikoHome, "persona", "aiko-override.md"),
        "utf8"
      );
      assert.match(ov, /original body/);
      const mode = (await readFile(join(fixture.aikoHome, "mode"), "utf8")).trim();
      assert.equal(mode, "origin");
      await client.stop();
    } finally {
      await fixture.cleanup();
    }
  });
});

describe("AikoCommandRouter — named personas", () => {
  it("creates, lists, selects, resets, exports, and deletes Lab-style persona directories", async () => {
    const fixture = await makeFixture();
    try {
      const transport = new MockTransport();
      const { runtime, client } = await bootRuntime(transport, fixture.aikoHome);
      const router = new AikoCommandRouter({
        aikoHome: fixture.aikoHome,
        runtime,
        confirm: async () => true,
      });

      const created = await router.execute("aiko-new", "hisho");
      assert.match(created.output, /overrides\/hisho\/persona\.md/);
      assert.equal(created.needsRestart, true);
      assert.match(
        await readFile(join(fixture.aikoHome, "persona", "overrides", "hisho", "persona.md"), "utf8"),
        /original body/
      );

      const listed = await router.execute("aiko-personas", "");
      assert.match(listed.output, /★ \[hisho\]/);

      await router.execute("aiko-select", "origin");
      const selected = await router.execute("aiko-select", "hisho");
      assert.match(selected.output, /Aiko-hisho/);
      assert.equal((await readFile(join(fixture.aikoHome, "active-persona"), "utf8")).trim(), "hisho");

      await writeFile(
        join(fixture.aikoHome, "persona", "overrides", "hisho", "persona.md"),
        "# Hisho\ncustom\n"
      );
      const exported = await router.execute("aiko-export", "hisho");
      assert.match(exported.output, /overrides\/hisho\/persona\.md/);
      assert.match(exported.output, /custom/);

      const reset = await router.execute("aiko-reset", "hisho");
      assert.match(reset.output, /hisho/);
      assert.match(
        await readFile(join(fixture.aikoHome, "persona", "overrides", "hisho", "persona.md"), "utf8"),
        /original body/
      );

      await router.execute("aiko-select", "override");
      const deleted = await router.execute("aiko-delete", "hisho");
      assert.match(deleted.output, /削除しました/);
      await assert.rejects(
        readFile(join(fixture.aikoHome, "persona", "overrides", "hisho", "persona.md"), "utf8"),
        /ENOENT/
      );
      await client.stop();
    } finally {
      await fixture.cleanup();
    }
  });
});

describe("AikoCommandRouter — /aiko-export and /aiko-diff", () => {
  let fixture: Fixture;
  let transport: MockTransport;
  let runtime: AikoRuntime;
  let client: CodexClient;
  let router: AikoCommandRouter;

  beforeEach(async () => {
    fixture = await makeFixture();
    transport = new MockTransport();
    ({ runtime, client } = await bootRuntime(transport, fixture.aikoHome));
    router = new AikoCommandRouter({ aikoHome: fixture.aikoHome, runtime });
  });

  afterEach(async () => {
    await client.stop();
    await fixture.cleanup();
  });

  it("/aiko-diff reports identical when override matches origin", async () => {
    const result = await router.execute("aiko-diff", "");
    assert.match(result.output, /同一/);
  });

  it("/aiko-diff returns unified diff after override edit", async () => {
    await writeFile(
      join(fixture.aikoHome, "persona", "aiko-override.md"),
      "# Override\nnew body\n"
    );
    const result = await router.execute("aiko-diff", "");
    assert.match(result.output, /^---/m);
    assert.match(result.output, /^\+\+\+/m);
    assert.match(result.output, /-original body/);
    assert.match(result.output, /\+new body/);
  });

  it("/aiko-export includes full override and a diff section", async () => {
    await writeFile(
      join(fixture.aikoHome, "persona", "aiko-override.md"),
      "# Override\ncustomized\n"
    );
    const result = await router.execute("aiko-export", "");
    assert.match(result.output, /aiko-override.md（全文）/);
    assert.match(result.output, /customized/);
    assert.match(result.output, /origin との diff/);
    assert.match(result.output, /再現手順/);
  });
});

describe("pure helpers", () => {
  it("mergeOverrideInstruction appends a timestamped section", () => {
    const merged = mergeOverrideInstruction("# A\nbody", "be polite");
    assert.match(merged, /# A\nbody\n\n## ユーザー指示/);
    assert.match(merged, /be polite/);
  });

  it("summarizeInstruction truncates long instructions", () => {
    const long = "あ".repeat(80);
    const s = summarizeInstruction(long);
    assert.equal(s.length <= 61, true);
    assert.match(s, /…$/);
  });

  it("unifiedDiff returns empty for identical input", () => {
    assert.equal(unifiedDiff("a", "b", "x\ny", "x\ny"), "");
  });

  it("unifiedDiff highlights changed lines", () => {
    const out = unifiedDiff("o", "n", "a\nb\nc", "a\nB\nc");
    assert.match(out, /-b/);
    assert.match(out, /\+B/);
  });
});
