// SDK 直呼びと MCP Tool の一致。R7 仕様書 R7-5 / §12.3、受入基準 16。
//
// 「同一入力から SDK 直接呼出しと MCP Tool が同一結果を返す」を、実際に両方
// 呼んで突き合わせる。**MCP 側に判定を書かないこと**が守られているかを見る検査で、
// 片方に1行足せばここが落ちる。
//
// 時刻は両方に同じものを渡す。decidedAt が違えば当然一致しないが、それは
// 判定が割れたこととは別の話なので、比較の対象から外すのではなく固定する。

import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { PersonaRepository } from "@agent-aiko/core";
import { createAikoServer } from "aiko-mcp";
import {
  createRuntimeSdk,
  SemanticBudget,
  type CreateRuntimeSdkOptions,
  type EvaluateActionRequest,
  type PermissionManifest,
  type ValidateResponseRequest,
} from "@agent-aiko/runtime-sdk";

const clock = () => new Date("2026-08-01T00:00:00.000Z");

const persona = {
  id: "aiko",
  version: "0.1.0",
  identityCore: "あたしはアイコ。",
  invariants: "取り繕わない。",
  behavioralContract: "仕様書がなければ実装しない。",
  sources: [],
  responseContract: {
    firstPerson: "あたし",
    prohibitedFirstPersons: [{ text: "私は", replaceWith: "あたしは" }],
  },
};

const repo: PersonaRepository = { load: async () => persona };

const user = {
  context: { id: "masa", preferredName: "マサさん" },
  privacy: { allowRemotePersonaService: false, allowUsageTelemetry: false },
};

const permissionManifest: PermissionManifest = {
  schema_version: 1,
  runtime_id: "claude-code",
  filesystem: { writable_paths: ["/home/masa/dev/project"] },
  network: { outbound: "denied" },
  sandbox: { mode: "workspace-write" },
};

const policy: CreateRuntimeSdkOptions["policy"] = { permissionManifest };

const evaluateRequest: EvaluateActionRequest = {
  requestId: "req-1",
  profileRef: { profileId: "profile-1", contentHash: "hash-1" },
  action: {
    actionId: "a-1",
    type: "file.delete",
    summary: "一時ファイルを消す",
    targets: [{ type: "file", identifier: "/home/masa/dev/project/tmp.txt" }],
    effects: {
      external: false,
      irreversible: true,
      production: false,
      financial: false,
      privacyRelevant: false,
    },
    proposedBy: "model",
  },
};

/** 応答検査は照合元の Profile を実引きする（fail closed）。SDK 側と MCP 側で
 *  それぞれ合成してから使う——同じ入力なら同じ profile_id になるはずで、
 *  そこがずれていれば検査以前の問題なので、まずそれを確かめる。 */
async function boundProfileRef(): Promise<{ profileId: string; contentHash: string }> {
  const bundle = await sdk().prepareLaunch({
    requestId: "bind-1",
    personaRef: { personaId: "aiko" },
    userRef: { userId: "masa" },
    runtime: { id: "claude-code", version: "1.0.0" },
    injectionCapability: { systemLevel: ["claude-code:system-prompt-file"] },
    requestedConsistencyLevel: 2,
  });
  return { profileId: bundle.profile.profile_id, contentHash: bundle.profile.profile_hash };
}

async function callTool(name: string, args: unknown): Promise<unknown> {
  const server = createAikoServer({
    personaRepository: repo,
    user,
    policy,
    responseValidation: {},
    clock,
  });
  const client = new Client({ name: "policy-parity", version: "0" });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(s), client.connect(c)]);
  try {
    // MCP 側の置き場は別なので、Tool を呼ぶ前にこちらでも合成しておく。
    await client.callTool({
      name: "aiko.bind_runtime",
      arguments: { runtime: "claude-code", injectionMethod: "claude-code:system-prompt-file" },
    });
    const result = (await client.callTool({ name, arguments: args as Record<string, unknown> })) as {
      content: Array<{ type: string; text: string }>;
    };
    return JSON.parse(result.content[0]?.text ?? "null");
  } finally {
    await client.close();
  }
}

function sdk() {
  return createRuntimeSdk({
    personaRepository: repo,
    user,
    policy,
    responseValidation: {},
    clock,
  });
}

test("同じ Action に対し SDK 直呼びと MCP Tool が同じ判定を返す", async () => {
  const direct = await sdk().evaluateAction(evaluateRequest, { budget: new SemanticBudget() });
  const viaMcp = await callTool("aiko.evaluate_action", evaluateRequest);
  assert.deepEqual(viaMcp, JSON.parse(JSON.stringify(direct)));
});

test("権限外の操作でも SDK 直呼びと MCP Tool が一致する", async () => {
  const request: EvaluateActionRequest = {
    ...evaluateRequest,
    action: {
      ...evaluateRequest.action,
      type: "file.write",
      summary: "設定を書き換える",
      targets: [{ type: "file", identifier: "/etc/hosts" }],
    },
  };
  const direct = await sdk().evaluateAction(request, { budget: new SemanticBudget() });
  const viaMcp = await callTool("aiko.evaluate_action", request);
  assert.deepEqual(viaMcp, JSON.parse(JSON.stringify(direct)));
});

test("同じ応答に対し SDK 直呼びと MCP Tool が同じ検査結果を返す", async () => {
  const profileRef = await boundProfileRef();
  const request: ValidateResponseRequest = {
    requestId: "req-2",
    profileRef,
    response: { responseId: "res-1", content: "マサさん、私は直しておいたよ" },
  };
  const engine = sdk();
  await engine.prepareLaunch({
    requestId: "bind-2",
    personaRef: { personaId: "aiko" },
    userRef: { userId: "masa" },
    runtime: { id: "claude-code", version: "1.0.0" },
    injectionCapability: { systemLevel: ["claude-code:system-prompt-file"] },
    requestedConsistencyLevel: 2,
  });
  const direct = await engine.validateResponse(request);
  const viaMcp = await callTool("aiko.validate_response", request);
  assert.deepEqual(viaMcp, JSON.parse(JSON.stringify(direct)));
});

test("MCP Tool へ呼び名を渡しても検査結果は変わらない", async () => {
  // §6 / 受入基準 13。MCP は shape から自前で schema を組むので、最上位の未知キーは
  // ハンドラへ届く前に落ちる。**落ちること自体が保証**——呼び名を渡す口が無い。
  const base = {
    requestId: "req-3",
    profileRef: await boundProfileRef(),
    response: { responseId: "res-1", content: "私は直しておいたよ" },
  };
  const without = await callTool("aiko.validate_response", base);
  const withName = await callTool("aiko.validate_response", { ...base, preferredName: "ご主人様" });
  assert.deepEqual(withName, without);
});

test("profileRef に人格情報を紛れ込ませると受け付けない", async () => {
  // 入れ子の schema は strict のまま MCP へ渡るので、こちらは入口で弾かれる。
  const server = createAikoServer({
    personaRepository: repo,
    user,
    policy,
    responseValidation: {},
    clock,
  });
  const client = new Client({ name: "policy-parity", version: "0" });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(s), client.connect(c)]);
  try {
    const result = (await client.callTool({
      name: "aiko.validate_response",
      arguments: {
        requestId: "req-4",
        profileRef: { ...(await boundProfileRef()), preferredName: "ご主人様" },
        response: { responseId: "res-1", content: "こんにちは" },
      },
    })) as { isError?: boolean; content: Array<{ text: string }> };
    assert.equal(result.content[0]?.text.includes('Unrecognized key: "preferredName"'), true);
  } finally {
    await client.close();
  }
});

test("Policy Engine を登録していなければ、その旨を返す", async () => {
  const server = createAikoServer({ personaRepository: repo, user, clock });
  const client = new Client({ name: "policy-parity", version: "0" });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(s), client.connect(c)]);
  try {
    const result = (await client.callTool({
      name: "aiko.evaluate_action",
      arguments: evaluateRequest as unknown as Record<string, unknown>,
    })) as { content: Array<{ text: string }> };
    const payload = JSON.parse(result.content[0]?.text ?? "null") as {
      evaluated?: boolean;
      reason?: string;
    };
    assert.deepEqual(
      [payload.evaluated, payload.reason?.includes("この起動では利用できません")],
      [false, true],
    );
  } finally {
    await client.close();
  }
});
