// Cross-runtime Test / Determinism Test。SDK 設計書 §20.3・§20.5。
//
// 同じ人格・同じユーザーを3経路（Claude Code Adapter / Codex Adapter / MCP Server）へ
// 渡して、出てくる人格が一致することを見る（§16.3 挙動一致）。
//
// この性質は R2・R3・R4/R5 の各段階で手で測っていた。**手で測るということは、
// 次に誰かが変えたときは誰も測らないということ。** ここで自動にする。
//
// 別 package に置いているのは §5.3（循環依存の禁止）のため。runtime-sdk の中に
// 置くと、SDK が Adapter を参照することになる。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { PersonaRepository } from "@agent-aiko/core";
import { prepareLaunch } from "@agent-aiko/adapter-claude-code";
import { prepareThread } from "@agent-aiko/adapter-codex";
import { createAikoServer } from "aiko-mcp";
import { createRuntimeSdk } from "@agent-aiko/runtime-sdk";

/** 3経路へ渡す共通の入力。ここを1つにしないと比較にならない。 */
const persona = {
  id: "aiko",
  version: "0.1.0",
  identityCore: "あたしはアイコ。",
  invariants: "取り繕わない。判断は事情で変えない。",
  behavioralContract: "仕様書がなければ実装しない。",
  sources: [],
};

const repo: PersonaRepository = { load: async () => persona };

const user = {
  context: { id: "masa", preferredName: "マサさん" },
  privacy: { allowRemotePersonaService: false, allowUsageTelemetry: false },
};

async function viaClaudeCode() {
  const dir = await mkdtemp(join(tmpdir(), "xrt-claude-"));
  try {
    return (await prepareLaunch({ personaRepository: repo, user, stateDir: dir })).profile;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function viaCodex() {
  return (await prepareThread({ personaRepository: repo, user })).profile;
}

async function viaMcpServer(): Promise<Record<string, unknown>> {
  const server = createAikoServer({ personaRepository: repo, user });
  const client = new Client({ name: "xrt", version: "0" });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(s), client.connect(c)]);
  try {
    const result = await client.callTool({
      name: "aiko.bind_runtime",
      arguments: { runtime: "claude-code", injectionMethod: "claude-code:system-prompt-file" },
    });
    const content = (result as { content: Array<{ text: string }> }).content;
    return JSON.parse(content[0]?.text ?? "{}") as Record<string, unknown>;
  } finally {
    await client.close();
    await server.close();
  }
}

test("§20.3 3経路で同じ人格・同じ版が使われる", async () => {
  const [claude, codex, mcp] = await Promise.all([viaClaudeCode(), viaCodex(), viaMcpServer()]);
  const mcpPersona = mcp["persona"] as { id: string; version: string };

  assert.equal(claude.persona.id, codex.persona.id);
  assert.equal(claude.persona.id, mcpPersona.id);
  assert.equal(claude.persona.version, codex.persona.version);
  assert.equal(claude.persona.version, mcpPersona.version);
});

test("§20.3 経路が違っても人格の中身は同じ", async () => {
  const [claude, codex] = await Promise.all([viaClaudeCode(), viaCodex()]);

  // 注入手段は経路ごとに違ってよい。中身は違ってはいけない。
  assert.equal(claude.instructions, codex.instructions);
  assert.match(claude.instructions, /あたしはアイコ。/);
  assert.match(claude.instructions, /取り繕わない。/);
  assert.match(claude.instructions, /マサさん/, "呼び名が経路で落ちてはいけない");
});

test("§16.3 同じ経路・同じ入力なら MCP Server と Adapter は完全に一致する", async () => {
  const [claude, mcp] = await Promise.all([viaClaudeCode(), viaMcpServer()]);
  assert.equal(mcp["profile_hash"], claude.profile_hash);
});

test("注入手段が違えば Profile は別物になる", async () => {
  const [claude, codex] = await Promise.all([viaClaudeCode(), viaCodex()]);
  // 中身が同じでも、どう注入したかが違えば別の Profile。ここを同じにすると、
  // hash から「どの経路で作られたか」を追えなくなる（§14）。
  assert.notEqual(claude.profile_hash, codex.profile_hash);
  assert.notEqual(claude.runtime.injection_method, codex.runtime.injection_method);
});

test("§20.5 同一入力を100回処理しても hash が変わらない", async () => {
  const sdk = createRuntimeSdk({ personaRepository: repo, user });
  const request = {
    requestId: "determinism",
    personaRef: { personaId: "aiko" },
    userRef: { userId: "masa" },
    runtime: { id: "claude-code" as const, version: "1" },
    injectionCapability: { systemLevel: ["claude-code:system-prompt-file" as const] },
    requestedConsistencyLevel: 2 as const,
  };

  const profileHashes = new Set<string>();
  const contentHashes = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const bundle = await sdk.prepareLaunch(request);
    profileHashes.add(bundle.profile.profile_hash);
    contentHashes.add(bundle.compiledInstructions.contentHash);
  }
  assert.equal(profileHashes.size, 1, "profile_hash が揺れている");
  assert.equal(contentHashes.size, 1, "contentHash が揺れている");
});
