// MCP サーバーのテスト。
//
// InMemoryTransport でクライアントと繋いで、実際に MCP の往復をさせる。
// registerTool を呼んだかどうかを見るだけでは、スキーマ不整合や結果の形の誤りが
// 素通りする。プロトコル越しに呼んで返ってきたものを見る。

import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { PersonaResolutionError, type PersonaRepository } from "@agent-aiko/core";
import { createAikoServer } from "../src/aiko-server.js";
import { ProfileStore } from "../src/profile-store.js";

const persona = {
  id: "aiko",
  version: "0.1.0",
  identityCore: "あたしはアイコ。",
  invariants: "取り繕わない。",
  behavioralContract: "仕様書がなければ実装しない。",
  sources: [{ part: "identity-core", location: "/tmp/persona.md" }],
};

const repo: PersonaRepository = { load: async () => persona };
const failingRepo: PersonaRepository = {
  load: async () => {
    throw new PersonaResolutionError("人格の identity-core を解決できませんでした", {
      ref: { id: "aiko" },
    });
  },
};

const user = {
  context: { id: "default", preferredName: "マサ" },
  privacy: { allowRemotePersonaService: false, allowUsageTelemetry: false },
};

async function connect(personaRepository: PersonaRepository = repo) {
  const server = createAikoServer({ personaRepository, user, profileStore: new ProfileStore() });
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, close: async () => { await client.close(); await server.close(); } };
}

/** resource の contents は text か blob のどちらか。テストで見たいのは text 側なので、
 *  text を持っていることを主張してから取り出す。 */
function resourceText(contents: ReadonlyArray<unknown>): string {
  const first = contents[0] as { text?: unknown } | undefined;
  const text = first?.text;
  assert.ok(typeof text === "string", "text 内容が無い（blob だった可能性）");
  return text;
}

function parse(result: unknown): Record<string, unknown> {
  const content = (result as { content: Array<{ type: string; text: string }> }).content;
  assert.ok(content?.[0]?.text, "テキスト内容が無い");
  return JSON.parse(content[0].text) as Record<string, unknown>;
}

test("Resource: 人格の各部を読める（§7.2）", async () => {
  const { client, close } = await connect();
  try {
    const listed = await client.listResources();
    const uris = listed.resources.map((r) => r.uri).sort();
    assert.ok(uris.includes("persona://aiko/core"));
    assert.ok(uris.includes("persona://aiko/invariants"));
    assert.ok(uris.includes("persona://aiko/behavior-contract"));
    assert.ok(uris.includes("persona://aiko/version/current"));
    assert.ok(uris.includes("persona://aiko/manifest"));

    const core = await client.readResource({ uri: "persona://aiko/core" });
    assert.equal(resourceText(core.contents), "あたしはアイコ。");
    const invariants = await client.readResource({ uri: "persona://aiko/invariants" });
    assert.equal(resourceText(invariants.contents), "取り繕わない。");
    const version = await client.readResource({ uri: "persona://aiko/version/current" });
    assert.equal(resourceText(version.contents), "0.1.0");
  } finally {
    await close();
  }
});

test("Tool: bind_runtime が Profile を作り、version と hash を返す（§7.4）", async () => {
  const { client, close } = await connect();
  try {
    const result = await client.callTool({
      name: "aiko.bind_runtime",
      arguments: { runtime: "claude-code", injectionMethod: "claude-code:system-prompt-file" },
    });
    const body = parse(result);
    assert.equal(body["bound"], true);
    assert.match(String(body["profile_hash"]), /^[0-9a-f]{64}$/);
    assert.deepEqual(body["persona"], { id: "aiko", version: "0.1.0" });
    assert.equal((body["runtime"] as Record<string, unknown>)["consistency_level"], 2);
  } finally {
    await close();
  }
});

test("Tool: bind_runtime は instructions 本文を既定で返さない", async () => {
  const { client, close } = await connect();
  try {
    const body = parse(
      await client.callTool({
        name: "aiko.bind_runtime",
        arguments: { runtime: "codex", injectionMethod: "codex:base-instructions" },
      }),
    );
    assert.equal(body["instructions"], undefined);
  } finally {
    await close();
  }
});

test("Tool: 合成できないときは Profile を返さず理由を返す（fail closed）", async () => {
  const { client, close } = await connect();
  try {
    // Level 2 のランタイムで注入手段を指定しない＝合成してはいけない組み合わせ
    const result = await client.callTool({
      name: "aiko.bind_runtime",
      arguments: { runtime: "claude-code" },
    });
    const body = parse(result);
    assert.equal(body["bound"], false);
    assert.match(String(body["reason"]), /注入手段/);
    assert.equal((result as { isError?: boolean }).isError, true);
  } finally {
    await close();
  }
});

test("Tool: get_runtime_profile は bind 前なら見つからないと返す", async () => {
  const { client, close } = await connect();
  try {
    const body = parse(await client.callTool({ name: "aiko.get_runtime_profile", arguments: {} }));
    assert.equal(body["found"], false);
  } finally {
    await close();
  }
});

test("Tool: get_runtime_profile は要求されたときだけ instructions を返す", async () => {
  const { client, close } = await connect();
  try {
    await client.callTool({
      name: "aiko.bind_runtime",
      arguments: { runtime: "codex", injectionMethod: "codex:base-instructions" },
    });
    const withoutBody = parse(
      await client.callTool({ name: "aiko.get_runtime_profile", arguments: {} }),
    );
    assert.equal(withoutBody["instructions"], undefined);

    const withBody = parse(
      await client.callTool({
        name: "aiko.get_runtime_profile",
        arguments: { includeInstructions: true },
      }),
    );
    assert.match(String(withBody["instructions"]), /取り繕わない。/);
  } finally {
    await close();
  }
});

test("Tool: report_capabilities は使えない能力を理由つきで返す", async () => {
  const { client, close } = await connect();
  try {
    const body = parse(
      await client.callTool({
        name: "aiko.report_capabilities",
        arguments: {
          capabilityManifest: {
            schema_version: 1,
            runtime_id: "codex",
            mcp_servers: [
              { id: "github", availability: "ready" },
              { id: "slack", availability: "unavailable" },
            ],
          },
        },
      }),
    );
    assert.deepEqual(body["available"], ["github"]);
    assert.equal((body["excluded"] as Array<{ id: string }>)[0]?.id, "slack");
  } finally {
    await close();
  }
});

test("Tool: 認証情報を含む Manifest は拒否する（§3.3）", async () => {
  const { client, close } = await connect();
  try {
    const result = await client.callTool({
      name: "aiko.report_capabilities",
      arguments: {
        capabilityManifest: {
          schema_version: 1,
          runtime_id: "codex",
          credentials: { handling: "host-managed", values_included: true },
        },
      },
    });
    assert.equal((result as { isError?: boolean }).isError, true);
    assert.match(String(parse(result)["reason"]), /認証情報/);
  } finally {
    await close();
  }
});

test("Tool: health は人格を読めているかを返す", async () => {
  const { client, close } = await connect();
  try {
    const body = parse(await client.callTool({ name: "aiko.health", arguments: {} }));
    assert.equal(body["status"], "ok");
    assert.equal(
      (body["persona"] as Record<string, unknown>)["invariantsPresent"],
      true,
    );
  } finally {
    await close();
  }
});

test("Tool: 人格を読めないとき health は ok を返さない", async () => {
  const { client, close } = await connect(failingRepo);
  try {
    const result = await client.callTool({ name: "aiko.health", arguments: {} });
    const body = parse(result);
    assert.equal(body["status"], "persona-unavailable");
    assert.equal((result as { isError?: boolean }).isError, true);
  } finally {
    await close();
  }
});

test("Resource: bind 前の runtime-profile summary は空を明示する", async () => {
  const { client, close } = await connect();
  try {
    const res = await client.readResource({ uri: "runtime-profile://latest/summary" });
    const body = JSON.parse(resourceText(res.contents)) as Record<string, unknown>;
    assert.match(String(body["error"]), /bind/);
  } finally {
    await close();
  }
});

test("Resource: bind が返した profile_id でそのまま参照できる（§7.2）", async () => {
  const { client, close } = await connect();
  try {
    const bound = parse(
      await client.callTool({
        name: "aiko.bind_runtime",
        arguments: { runtime: "codex", injectionMethod: "codex:base-instructions" },
      }),
    );
    const profileId = String(bound["profile_id"]);
    const res = await client.readResource({
      uri: `runtime-profile://${profileId}/summary`,
    });
    const body = JSON.parse(resourceText(res.contents)) as Record<string, unknown>;
    assert.equal(body["profile_id"], profileId);
    assert.equal(body["profile_hash"], bound["profile_hash"]);
    // 要約に本文は含めない
    assert.equal(body["instructions"], undefined);
  } finally {
    await close();
  }
});

test("Resource: 知らない profile_id は存在しないと明示する", async () => {
  const { client, close } = await connect();
  try {
    const res = await client.readResource({ uri: "runtime-profile://deadbeef/summary" });
    const body = JSON.parse(resourceText(res.contents)) as Record<string, unknown>;
    assert.match(String(body["error"]), /deadbeef/);
  } finally {
    await close();
  }
});

// --- ProfileStore ---

test("ProfileStore: 上限を超えたら古いものから捨てる", () => {
  const store = new ProfileStore(2);
  const make = (id: string) => ({ profile_id: id }) as never;
  store.put(make("a"));
  store.put(make("b"));
  store.put(make("c"));
  assert.equal(store.size, 2);
  assert.equal(store.get("a"), undefined);
  assert.ok(store.get("c"));
});

test("ProfileStore: 同じ id を入れ直しても増えない", () => {
  const store = new ProfileStore(2);
  const make = (id: string) => ({ profile_id: id }) as never;
  store.put(make("a"));
  store.put(make("a"));
  assert.equal(store.size, 1);
});

test("ProfileStore: 上限が不正なら作らせない", () => {
  assert.throws(() => new ProfileStore(0), RangeError);
});
