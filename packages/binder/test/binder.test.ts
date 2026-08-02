// Binder のテスト。設計書 §5.3 / §6。
//
// 通る経路より、止まるべき経路を厚く見る。この層の役割は §6.5 の fail-closed
// 判定なので、止まらないことが最大の欠陥になる。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RuntimeProfileBinder, BindingError } from "../src/binder.js";
import {
  hashObject,
  PersonaResolutionError,
  type PersonaRepository,
  type PersonaSnapshot,
} from "@agent-aiko/core";
import { UserContextProvider, UserProfileError } from "@agent-aiko/user-context";
import { CapabilityRegistry, CapabilityManifestError } from "@agent-aiko/capability-registry";

const persona: PersonaSnapshot = {
  id: "aiko",
  version: "0.1.0",
  identityCore: "あたしはアイコ。",
  invariants: "取り繕わない。",
  behavioralContract: "仕様書がなければ実装しない。",
  sources: [],
};

const repo = (override?: Partial<PersonaSnapshot>): PersonaRepository => ({
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

// --- User Context Provider ---

test("Binder: Claude Code の Profile を合成する", async () => {
  const binder = new RuntimeProfileBinder({ personaRepository: repo() });
  const profile = await binder.bind(
    {
      persona: { id: "aiko" },
      runtime: { id: "claude-code", injectionMethod: "claude-code:system-prompt-file" },
      capabilityManifest: {
        schema_version: 1,
        runtime_id: "claude-code",
        built_in_tools: [{ id: "filesystem" }],
        mcp_servers: [{ id: "slack", availability: "unavailable" }],
      },
    },
    user,
  );
  assert.equal(profile.runtime.consistency_level, 2);
  assert.equal(profile.user_id, "default");
  assert.match(profile.profile_hash, /^[0-9a-f]{64}$/);
  assert.equal(profile.profile_id, profile.profile_hash.slice(0, 16));
  assert.ok(profile.instructions.includes("取り繕わない。"));
  assert.deepEqual(profile.excluded_capabilities.map((e) => e.id), ["slack"]);
});

test("Binder: Antigravity CLI は Level 1 のまま（§8.5）", async () => {
  const binder = new RuntimeProfileBinder({ personaRepository: repo() });
  const profile = await binder.bind(
    { persona: { id: "aiko" }, runtime: { id: "antigravity-cli" } },
    user,
  );
  assert.equal(profile.runtime.consistency_level, 1);
  assert.equal(profile.runtime.injection_method, "none");
});

test("Binder: Generic MCP Host は Level 0（§8.4）", async () => {
  const binder = new RuntimeProfileBinder({ personaRepository: repo() });
  const profile = await binder.bind(
    { persona: { id: "aiko" }, runtime: { id: "generic-mcp-host" } },
    user,
  );
  assert.equal(profile.runtime.consistency_level, 0);
});

test("Binder: Level 2 なのに注入手段が無ければ起動させない（§3.4）", async () => {
  const binder = new RuntimeProfileBinder({ personaRepository: repo() });
  await assert.rejects(
    () => binder.bind({ persona: { id: "aiko" }, runtime: { id: "claude-code" } }, user),
    (err: unknown) => {
      assert.ok(err instanceof BindingError);
      assert.equal(err.detail.stage, "injection-method");
      return true;
    },
  );
});

test("Binder: 別ランタイムの注入手段は受け付けない", async () => {
  const binder = new RuntimeProfileBinder({ personaRepository: repo() });
  await assert.rejects(
    () =>
      binder.bind(
        {
          persona: { id: "aiko" },
          runtime: { id: "codex", injectionMethod: "claude-code:system-prompt-file" },
        },
        user,
      ),
    BindingError,
  );
});

test("Binder: 人格を解決できなければ Profile を返さない（§6.5）", async () => {
  const binder = new RuntimeProfileBinder({ personaRepository: failingRepo });
  await assert.rejects(
    () =>
      binder.bind(
        {
          persona: { id: "aiko" },
          runtime: { id: "codex", injectionMethod: "codex:base-instructions" },
        },
        user,
      ),
    (err: unknown) => {
      assert.ok(err instanceof BindingError);
      assert.equal(err.detail.stage, "persona-resolution");
      return true;
    },
  );
});

test("Binder: 不変条項が空なら起動させない（§6.5）", async () => {
  const binder = new RuntimeProfileBinder({ personaRepository: repo({ invariants: "   " }) });
  await assert.rejects(
    () =>
      binder.bind(
        {
          persona: { id: "aiko" },
          runtime: { id: "codex", injectionMethod: "codex:base-instructions" },
        },
        user,
      ),
    (err: unknown) => {
      assert.ok(err instanceof BindingError);
      assert.equal(err.detail.stage, "persona-validation");
      return true;
    },
  );
});

test("Binder: 同じ入力からは同じ profile_hash が出る", async () => {
  const binder = new RuntimeProfileBinder({ personaRepository: repo() });
  const request = {
    persona: { id: "aiko" },
    runtime: { id: "codex" as const, injectionMethod: "codex:base-instructions" as const },
  };
  const a = await binder.bind(request, user);
  const b = await binder.bind(request, user);
  assert.equal(a.profile_hash, b.profile_hash);
  assert.equal(a.profile_id, b.profile_id);
});

// --- 応答契約（R7 仕様書 §6） ---

test("Binder: 人格が宣言した応答契約を Profile に載せる", async () => {
  const binder = new RuntimeProfileBinder({
    personaRepository: repo({ responseContract: { firstPerson: "あたし" } }),
  });
  const profile = await binder.bind(
    { persona: { id: "aiko" }, runtime: { id: "codex", injectionMethod: "codex:base-instructions" } },
    user,
  );
  assert.equal(profile.response_contract?.["firstPerson"], "あたし");
});

test("Binder: 呼び名は利用者側から入る", async () => {
  // 呼び名は人格ではなく利用者に属する。人格が何も宣言していなくても入る。
  const binder = new RuntimeProfileBinder({ personaRepository: repo() });
  const profile = await binder.bind(
    { persona: { id: "aiko" }, runtime: { id: "codex", injectionMethod: "codex:base-instructions" } },
    user,
  );
  assert.equal(profile.response_contract?.["preferredName"], "マサ");
});

test("Binder: 利用者が人格の禁止表現を上書きできない", async () => {
  const binder = new RuntimeProfileBinder({
    personaRepository: repo({ responseContract: { prohibitedExpressions: ["絶対に安全"] } }),
  });
  const profile = await binder.bind(
    { persona: { id: "aiko" }, runtime: { id: "codex", injectionMethod: "codex:base-instructions" } },
    { ...user, context: { ...user.context, prohibitedExpressions: [] } as never },
  );
  assert.deepEqual(profile.response_contract?.["prohibitedExpressions"], ["絶対に安全"]);
});

test("Binder: 契約が何も無ければ Profile は契約を持たない", async () => {
  const binder = new RuntimeProfileBinder({ personaRepository: repo() });
  const profile = await binder.bind(
    { persona: { id: "aiko" }, runtime: { id: "codex", injectionMethod: "codex:base-instructions" } },
    { ...user, context: { id: "default" } },
  );
  assert.equal(profile.response_contract, undefined);
});

test("Binder: 契約が無い Profile の hash は契約導入前と変わらない", async () => {
  // 応答契約を hash の入力に足したが、undefined は hashObject が落とす。
  // 既存の利用者の profile_id が変わらないことを、値そのもので確かめる。
  const binder = new RuntimeProfileBinder({ personaRepository: repo() });
  const profile = await binder.bind(
    { persona: { id: "aiko" }, runtime: { id: "codex", injectionMethod: "codex:base-instructions" } },
    { ...user, context: { id: "default" } },
  );
  assert.equal(
    profile.profile_hash,
    hashObject({
      instructions: profile.instructions,
      runtime: profile.runtime,
      schema_version: profile.schema_version,
    }),
  );
});

// --- provenance（Threat Model §5-7） ---

test("Binder: 適用した人格の checksum を provenance に残す", async () => {
  // 合成後の hash だけでは、材料がすり替わったことを検知できない（T2）。
  // 材料そのものの checksum を別に残す。
  const binder = new RuntimeProfileBinder({ personaRepository: repo() });
  const profile = await binder.bind(
    { persona: { id: "aiko" }, runtime: { id: "codex", injectionMethod: "codex:base-instructions" } },
    user,
  );
  assert.match(profile.provenance.persona_package_hash, /^[0-9a-f]{64}$/);
});

test("Binder: 人格が変われば provenance の checksum も変わる", async () => {
  const binder = new RuntimeProfileBinder({ personaRepository: repo() });
  const swapped = new RuntimeProfileBinder({
    personaRepository: repo({ identityCore: "すり替えられた人格" }),
  });
  const request = {
    persona: { id: "aiko" },
    runtime: { id: "codex" as const, injectionMethod: "codex:base-instructions" as const },
  };
  const [a, b] = await Promise.all([binder.bind(request, user), swapped.bind(request, user)]);
  assert.notEqual(a.provenance.persona_package_hash, b.provenance.persona_package_hash);
});

test("Binder: 人格をどこから読んだかを残す", async () => {
  // すり替えの調査は「どこから読んだか」が分からないと始まらない。
  const binder = new RuntimeProfileBinder({
    personaRepository: repo({
      sources: [{ part: "identity-core", location: "/home/x/.aiko/persona/origin/persona.md" }],
    }),
  });
  const profile = await binder.bind(
    { persona: { id: "aiko" }, runtime: { id: "codex", injectionMethod: "codex:base-instructions" } },
    user,
  );
  assert.deepEqual(profile.provenance.persona_sources, [
    { part: "identity-core", location: "/home/x/.aiko/persona/origin/persona.md" },
  ]);
});

test("Binder: provenance の時刻は固定できる", async () => {
  // 決定性の検証で時刻が揺れると、hash 以外の差分で落ちる。
  const binder = new RuntimeProfileBinder({
    personaRepository: repo(),
    clock: () => new Date("2026-08-02T00:00:00.000Z"),
  });
  const profile = await binder.bind(
    { persona: { id: "aiko" }, runtime: { id: "codex", injectionMethod: "codex:base-instructions" } },
    user,
  );
  assert.equal(profile.provenance.created_at, "2026-08-02T00:00:00.000Z");
});
