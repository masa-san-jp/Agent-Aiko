// §7.3 Prompts のテスト。
//
// Prompt には「返さない」という選択肢が無い。人格を合成できないときに空を返すと、
// ホスト側では人格なしの会話が静かに始まる。止まるべき経路をここで確かめる。

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
  sources: [],
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

function firstText(result: { messages: Array<{ content: unknown }> }): string {
  const content = result.messages[0]?.content as { type: string; text: string };
  assert.equal(content.type, "text");
  return content.text;
}

test("設計書 §7.3 の4つが、その名前のまま並ぶ", async () => {
  const { client, close } = await connect();
  try {
    const names = (await client.listPrompts()).prompts.map((p) => p.name).sort();
    assert.deepEqual(names, [
      "aiko.activate",
      "aiko.activate_for_task",
      "aiko.handoff",
      "aiko.review_as_aiko",
    ]);
  } finally {
    await close();
  }
});

test("activate は人格の中身を返す", async () => {
  const { client, close } = await connect();
  try {
    const text = firstText(await client.getPrompt({ name: "aiko.activate" }));
    assert.match(text, /あたしはアイコ。/);
    assert.match(text, /取り繕わない。/);
  } finally {
    await close();
  }
});

test("activate_for_task は作業内容を人格の後ろに足す", async () => {
  const { client, close } = await connect();
  try {
    const text = firstText(
      await client.getPrompt({ name: "aiko.activate_for_task", arguments: { task: "ログを調べる" } }),
    );
    assert.match(text, /あたしはアイコ。/);
    assert.match(text, /ログを調べる/);
    assert.ok(text.indexOf("あたしはアイコ。") < text.indexOf("ログを調べる"), "人格が先に来る");
  } finally {
    await close();
  }
});

test("review_as_aiko は対象を添える", async () => {
  const { client, close } = await connect();
  try {
    const text = firstText(
      await client.getPrompt({ name: "aiko.review_as_aiko", arguments: { subject: "この設計案" } }),
    );
    assert.match(text, /この設計案/);
    assert.match(text, /根拠/);
  } finally {
    await close();
  }
});

test("handoff は引き継ぎ内容を添え、推測で埋めさせない", async () => {
  const { client, close } = await connect();
  try {
    const text = firstText(
      await client.getPrompt({ name: "aiko.handoff", arguments: { context: "ここまでの経緯" } }),
    );
    assert.match(text, /ここまでの経緯/);
    assert.match(text, /推測で埋めずに/);
  } finally {
    await close();
  }
});

test("人格を合成できないとき、空ではなく「適用できていない」と返す", async () => {
  const { client, close } = await connect(failingRepo);
  try {
    const text = firstText(await client.getPrompt({ name: "aiko.activate" }));
    assert.match(text, /適用できませんでした/);
    assert.match(text, /Aiko として応答してはいけません/);
    assert.doesNotMatch(text, /あたしはアイコ。/);
  } finally {
    await close();
  }
});
