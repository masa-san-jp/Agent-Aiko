// 判定を効かせる層。R7 仕様書 R7-6 / §3.2 / §3.3 / §8。
//
// 見るのは1つ——**止めるべきときに execute が呼ばれていないこと**。
// 判定が正しくても実行されてしまえば、判定した意味がない。

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  actionHash,
  createRuntimeSdk,
  PolicyGate,
  type ApprovalGrant,
  type CandidateAction,
  type EvaluateActionRequest,
  type PermissionManifest,
  type PersonaRepository,
} from "../src/index.js";

const clock = () => new Date("2026-08-01T00:00:00.000Z");

const personaRepository: PersonaRepository = {
  load: async () => ({
    id: "aiko",
    version: "0.1.0",
    identityCore: "あたしはアイコ。",
    invariants: "取り繕わない。",
    behavioralContract: "",
    sources: [],
    responseContract: { prohibitedExpressions: ["絶対に安全です"] },
  }),
};

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

const noEffects = {
  external: false,
  irreversible: false,
  production: false,
  financial: false,
  privacyRelevant: false,
};

function sdk() {
  return createRuntimeSdk({
    personaRepository,
    user,
    clock,
    policy: { permissionManifest },
    responseValidation: {},
  });
}

function action(overrides: Partial<CandidateAction> = {}): CandidateAction {
  return {
    actionId: "a-1",
    type: "file.read",
    summary: "設定を読む",
    effects: { ...noEffects },
    proposedBy: "model",
    ...overrides,
  };
}

function request(a: CandidateAction): EvaluateActionRequest {
  return {
    requestId: "req-1",
    profileRef: { profileId: "profile-1", contentHash: "hash-1" },
    action: a,
  };
}

/** 応答検査は照合元の Profile を実際に引く。先に合成して、その profile_id を使う。 */
async function boundSdk() {
  const engine = sdk();
  const bundle = await engine.prepareLaunch({
    requestId: "req-0",
    personaRef: { personaId: "aiko" },
    userRef: { userId: "masa" },
    runtime: { id: "claude-code", version: "1.0.0" },
    injectionCapability: { systemLevel: ["claude-code:system-prompt-file"] },
    requestedConsistencyLevel: 2,
  });
  return {
    engine,
    profileRef: {
      profileId: bundle.profile.profile_id,
      contentHash: bundle.profile.profile_hash,
    },
  };
}

const deleteAction = action({
  type: "file.delete",
  summary: "一時ファイルを消す",
  targets: [{ type: "file", identifier: "/home/masa/dev/project/tmp.txt" }],
  effects: { ...noEffects, irreversible: true },
});

const outsideWorkspace = action({
  type: "file.write",
  summary: "システム設定を書き換える",
  targets: [{ type: "file", identifier: "/etc/hosts" }],
});

function grantFor(a: CandidateAction, policyBundleHash: string): ApprovalGrant {
  return {
    approvalId: "ap-1",
    actionHash: actionHash(a),
    policyBundleHash,
    profileId: "profile-1",
    scope: "once",
    grantedBy: "user",
    grantedAt: "2026-08-01T00:00:00.000Z",
  };
}

// --- deny（§3.2） ---

test("deny された操作は実行されない", async () => {
  let ran = false;
  const gate = new PolicyGate({ sdk: sdk() });
  await gate.run(request(outsideWorkspace), async () => {
    ran = true;
  });
  assert.equal(ran, false);
});

test("deny のとき止めた理由を返す", async () => {
  const gate = new PolicyGate({ sdk: sdk() });
  const outcome = await gate.run(request(outsideWorkspace), async () => undefined);
  assert.deepEqual(
    [outcome.status, outcome.status === "stopped" ? outcome.reason : undefined],
    ["stopped", "denied"],
  );
});

// --- require_approval（§3.3） ---

test("承認を取る手段が無ければ実行されない", async () => {
  let ran = false;
  const gate = new PolicyGate({ sdk: sdk() });
  await gate.run(request(deleteAction), async () => {
    ran = true;
  });
  assert.equal(ran, false);
});

test("承認が得られなければ実行されない", async () => {
  let ran = false;
  const gate = new PolicyGate({ sdk: sdk(), requestApproval: async () => undefined });
  await gate.run(request(deleteAction), async () => {
    ran = true;
  });
  assert.equal(ran, false);
});

test("承認が得られたら実行される", async () => {
  const engine = sdk();
  const decision = await engine.evaluateAction(request(deleteAction));
  const gate = new PolicyGate({
    sdk: engine,
    requestApproval: async () => grantFor(deleteAction, decision.policyBundleHash),
  });
  const outcome = await gate.run(request(deleteAction), async () => "done");
  assert.deepEqual(
    [outcome.status, outcome.status === "executed" ? outcome.value : undefined],
    ["executed", "done"],
  );
});

test("承認を取っている間に操作が変わったら実行されない", async () => {
  // §3.3「操作内容が変わった場合、承認は無効」。承認したのは別の操作。
  const engine = sdk();
  const decision = await engine.evaluateAction(request(deleteAction));
  const other = { ...deleteAction, summary: "全部消す" };
  let ran = false;
  const gate = new PolicyGate({
    sdk: engine,
    requestApproval: async () => grantFor(other, decision.policyBundleHash),
  });
  const outcome = await gate.run(request(deleteAction), async () => {
    ran = true;
  });
  assert.deepEqual(
    [ran, outcome.status === "stopped" ? outcome.reason : undefined],
    [false, "approval-stale"],
  );
});

test("規則集合が変わった後の承認では実行されない", async () => {
  const gate = new PolicyGate({
    sdk: sdk(),
    requestApproval: async () => grantFor(deleteAction, "別の規則集合"),
  });
  const outcome = await gate.run(request(deleteAction), async () => undefined);
  assert.equal(outcome.status === "stopped" ? outcome.reason : undefined, "approval-stale");
});

// --- allow ---

test("許可された操作はそのまま実行される", async () => {
  const gate = new PolicyGate({ sdk: sdk() });
  const outcome = await gate.run(request(action()), async () => "read");
  assert.equal(outcome.status === "executed" ? outcome.value : undefined, "read");
});

// --- 応答（§8） ---

test("送信禁止の応答は送られない", async () => {
  let sent = false;
  const { engine, profileRef } = await boundSdk();
  const gate = new PolicyGate({ sdk: engine });
  await gate.send(
    {
      requestId: "req-2",
      profileRef,
      response: { responseId: "res-1", content: "これは絶対に安全ですよ" },
    },
    async () => {
      sent = true;
    },
  );
  assert.equal(sent, false);
});

test("問題の無い応答は送られる", async () => {
  let sent = "";
  const { engine, profileRef } = await boundSdk();
  const gate = new PolicyGate({ sdk: engine });
  await gate.send(
    {
      requestId: "req-3",
      profileRef,
      response: { responseId: "res-1", content: "直しておいたよ" },
    },
    async (content) => {
      sent = content;
    },
  );
  assert.equal(sent, "直しておいたよ");
});

test("照合元の Profile を引けない応答は検査を通らない", async () => {
  // fail closed。引けないまま valid を返すと、検査したことにされる。
  let sent = false;
  const gate = new PolicyGate({ sdk: sdk() });
  await assert.rejects(
    gate.send(
      {
        requestId: "req-4",
        profileRef: { profileId: "unknown", contentHash: "hash-x" },
        response: { responseId: "res-1", content: "こんにちは" },
      },
      async () => {
        sent = true;
      },
    ),
  );
  assert.equal(sent, false);
});
