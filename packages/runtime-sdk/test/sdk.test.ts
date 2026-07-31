// Runtime SDK（Phase R1）のテスト。SDK 設計書 §20。
//
// R1 の約束は「挙動を変えない」こと。したがってここで一番大事なのは、
// **SDK を通しても Binder を直接呼んだときと同じ Profile と同じ hash が出る**
// ことの確認（§20.5 Determinism / §23 R2 の完了基準）。
//
// 次に §20.4 Fail Closed。欠落を1つずつ作って、起動を拒否することを見る。

import { test } from "node:test";
import assert from "node:assert/strict";
import { PersonaResolutionError, type PersonaRepository } from "@agent-aiko/core";
import { RuntimeProfileBinder } from "@agent-aiko/binder";
import { createRuntimeSdk, RuntimeSdkError, type PrepareLaunchRequest } from "../src/index.js";

const persona = {
  id: "aiko",
  version: "0.1.0",
  identityCore: "あたしはアイコ。",
  invariants: "取り繕わない。",
  behavioralContract: "仕様書がなければ実装しない。",
  sources: [],
};

const repo: PersonaRepository = { load: async () => persona };
const noInvariants: PersonaRepository = { load: async () => ({ ...persona, invariants: "  " }) };
const missing: PersonaRepository = {
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

function makeSdk(personaRepository: PersonaRepository = repo) {
  return createRuntimeSdk({
    binder: new RuntimeProfileBinder({ personaRepository }),
    personaRepository,
    user,
    clock: () => new Date("2026-08-01T00:00:00.000Z"),
  });
}

const request = (over: Partial<PrepareLaunchRequest> = {}): PrepareLaunchRequest => ({
  requestId: "req-1",
  personaRef: { personaId: "aiko" },
  userRef: { userId: "default" },
  runtime: { id: "claude-code", version: "1.0.0" },
  injectionCapability: { systemLevel: ["claude-code:system-prompt-file"] },
  requestedConsistencyLevel: 2,
  ...over,
});

// --- R1 の約束：挙動を変えない ---

test("SDK 経由と Binder 直呼びで profile_hash が一致する", async () => {
  const direct = await new RuntimeProfileBinder({ personaRepository: repo }).bind(
    {
      persona: { id: "aiko" },
      runtime: { id: "claude-code", injectionMethod: "claude-code:system-prompt-file" },
    },
    user,
  );
  const bundle = await makeSdk().prepareLaunch(request());
  assert.equal(bundle.profile.profile_hash, direct.profile_hash);
  assert.equal(bundle.compiledInstructions.content, direct.instructions);
});

test("同じ入力からは同じ bundle が出る（§20.5）", async () => {
  const a = await makeSdk().prepareLaunch(request());
  const b = await makeSdk().prepareLaunch(request());
  assert.equal(a.profile.profile_hash, b.profile.profile_hash);
  assert.equal(a.compiledInstructions.contentHash, b.compiledInstructions.contentHash);
  assert.equal(a.bundleId, b.bundleId);
  assert.equal(a.createdAt, b.createdAt);
});

// --- §20.4 Fail Closed ---

test("人格が無ければ起動を拒否する", async () => {
  await assert.rejects(
    () => makeSdk(missing).prepareLaunch(request()),
    (err: RuntimeSdkError) => {
      assert.equal(err.code, "AIKO_RUNTIME_PERSONA_NOT_FOUND");
      assert.ok(err.remediation, "直し方を返していない");
      return true;
    },
  );
});

test("不変条項が空なら起動を拒否する", async () => {
  await assert.rejects(
    () => makeSdk(noInvariants).prepareLaunch(request()),
    (err: RuntimeSdkError) => {
      assert.equal(err.code, "AIKO_RUNTIME_INVARIANTS_MISSING");
      assert.equal(err.severity, "fatal");
      return true;
    },
  );
});

test("Level 2 を要求されて system 級の手段が無ければ拒否する（格下げしない）", async () => {
  await assert.rejects(
    () =>
      makeSdk().prepareLaunch(
        request({
          injectionCapability: { systemLevel: [], conversationLevel: ["none"] },
          requestedConsistencyLevel: 2,
        }),
      ),
    (err: RuntimeSdkError) => {
      assert.equal(err.code, "AIKO_RUNTIME_INJECTION_UNSUPPORTED");
      return true;
    },
  );
});

test("Level 1 の要求で system 級が無いのは拒否しない", async () => {
  const bundle = await makeSdk().prepareLaunch(
    request({
      runtime: { id: "generic-mcp", version: "1.0.0" },
      injectionCapability: { systemLevel: [] },
      requestedConsistencyLevel: 1,
    }),
  );
  assert.equal(bundle.consistencyLevel, 1);
  assert.equal(bundle.injectionPlan.level, "conversation");
});

// --- エラーモデル（§10） ---

test("エラーは機械可読な code と直し方を持つ", async () => {
  const err = await makeSdk(missing)
    .prepareLaunch(request())
    .then(() => undefined)
    .catch((e: unknown) => e as RuntimeSdkError);
  assert.ok(err instanceof RuntimeSdkError);
  const json = err.toJSON();
  assert.equal(json["code"], "AIKO_RUNTIME_PERSONA_NOT_FOUND");
  assert.equal(json["requestId"], "req-1");
  assert.ok(typeof json["remediation"] === "string");
});

test("エラーに人格本文や指示文を載せない（§10.2）", async () => {
  const err = await makeSdk(noInvariants)
    .prepareLaunch(request())
    .then(() => undefined)
    .catch((e: unknown) => e as RuntimeSdkError);
  assert.ok(err instanceof RuntimeSdkError);
  const dumped = JSON.stringify(err.toJSON());
  assert.doesNotMatch(dumped, /あたしはアイコ。/);
  assert.doesNotMatch(dumped, /仕様書がなければ/);
});

// --- getProfile / compileInstructions / health ---

test("prepareLaunch で作った Profile を profile_id で取り出せる", async () => {
  const sdk = makeSdk();
  const bundle = await sdk.prepareLaunch(request());
  const got = await sdk.getProfile({ requestId: "req-2", profileId: bundle.profile.profile_id });
  assert.equal(got.profile_hash, bundle.profile.profile_hash);
});

test("知らない profile_id は理由つきで拒否する", async () => {
  await assert.rejects(
    () => makeSdk().getProfile({ requestId: "req-3", profileId: "nope" }),
    (err: RuntimeSdkError) => {
      assert.ok(err.remediation);
      return true;
    },
  );
});

test("compileInstructions は人格本文を返す", async () => {
  const compiled = await makeSdk().compileInstructions({
    requestId: "req-4",
    personaRef: { personaId: "aiko" },
    userRef: { userId: "default" },
    runtime: { id: "generic-mcp", version: "1.0.0" },
  });
  assert.match(compiled.content, /あたしはアイコ。/);
  assert.equal(compiled.personaVersion, "0.1.0");
});

test("health は読めれば ok、読めなければ unavailable を返す（投げない）", async () => {
  assert.equal((await makeSdk().health()).status, "ok");
  assert.equal((await makeSdk(noInvariants).health()).status, "degraded");
  const bad = await makeSdk(missing).health();
  assert.equal(bad.status, "unavailable");
  assert.ok(bad.reason);
});

// --- R1 の範囲外 ---

test("仕様にあって R1 に無いものは、黙らずに理由を返す", async () => {
  const { notImplementedInR1 } = await import("../src/index.js");
  await assert.rejects(
    () => notImplementedInR1.rebind(),
    (err: RuntimeSdkError) => {
      assert.equal(err.code, "AIKO_RUNTIME_NOT_IMPLEMENTED");
      return true;
    },
  );
});
