// Codex Adapter のテスト。
//
// Codex 本体とは通信しない。検証するのは「何を渡そうとしたか」——
// baseInstructions の中身と、合成できないときに文字列を作らないこと。

import { test } from "node:test";
import assert from "node:assert/strict";
import { PersonaResolutionError, type PersonaRepository } from "@agent-aiko/core";
import { prepareThread, AdapterError } from "../src/adapter.js";

const persona = {
  id: "aiko",
  version: "0.1.0",
  identityCore: "あたしはアイコ。",
  invariants: "取り繕わない。",
  behavioralContract: "仕様書がなければ実装しない。",
  sources: [],
};

const repo = (override?: Partial<typeof persona>): PersonaRepository => ({
  load: async () => ({ ...persona, ...override }),
});

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

test("baseInstructions に不変条項と人格が入る", async () => {
  const prepared = await prepareThread({ personaRepository: repo(), user });
  assert.ok(prepared.baseInstructions.includes("取り繕わない。"));
  assert.ok(prepared.baseInstructions.includes("あたしはアイコ。"));
  assert.ok(prepared.baseInstructions.includes("- 呼び方: マサ"));
});

test("注入手段は codex のものになる（§8.5）", async () => {
  const prepared = await prepareThread({ personaRepository: repo(), user });
  assert.equal(prepared.profile.runtime.injection_method, "codex:base-instructions");
  assert.equal(prepared.profile.runtime.id, "codex");
  assert.equal(prepared.profile.runtime.consistency_level, 2);
});

test("不変条項は人格より先に置かれる（§6.4）", async () => {
  const { baseInstructions } = await prepareThread({ personaRepository: repo(), user });
  assert.ok(baseInstructions.indexOf("# 不変条項") < baseInstructions.indexOf("# 人格"));
});

test("人格を解決できなければ文字列を作らない（§3.4）", async () => {
  await assert.rejects(
    () => prepareThread({ personaRepository: failingRepo, user }),
    (err: unknown) => {
      assert.ok(err instanceof AdapterError);
      assert.equal(err.detail.stage, "binding");
      assert.match(err.message, /開始しません/);
      return true;
    },
  );
});

test("不変条項が空でも文字列を作らない（§6.5）", async () => {
  await assert.rejects(
    () => prepareThread({ personaRepository: repo({ invariants: "  " }), user }),
    AdapterError,
  );
});

test("同じ入力からは同じ profile_hash になる", async () => {
  const a = await prepareThread({ personaRepository: repo(), user });
  const b = await prepareThread({ personaRepository: repo(), user });
  assert.equal(a.profile.profile_hash, b.profile.profile_hash);
  assert.equal(a.baseInstructions, b.baseInstructions);
});

test("使えない能力は理由つきで載る", async () => {
  const { baseInstructions } = await prepareThread({
    personaRepository: repo(),
    user,
    capabilityManifest: {
      schema_version: 1,
      runtime_id: "codex",
      built_in_tools: [{ id: "filesystem" }],
      mcp_servers: [{ id: "github", availability: "unavailable" }],
    },
  });
  assert.ok(baseInstructions.includes("- filesystem"));
  assert.match(baseInstructions, /github: MCP サーバーが利用できません/);
});

test("Claude Code 側とは違い、ファイルを書かない", async () => {
  // 返り値に path 系の項目が無いこと＝ディスクに落としていないことの表明
  const prepared = await prepareThread({ personaRepository: repo(), user });
  assert.deepEqual(Object.keys(prepared).sort(), ["baseInstructions", "profile"]);
});
