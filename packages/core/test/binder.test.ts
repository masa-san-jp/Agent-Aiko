// Phase 2（Binder / User Context Provider / Capability Registry）のテスト。
//
// 通る経路より、止まるべき経路を厚く見る。この層の役割は §6.5 の fail-closed
// 判定なので、止まらないことが最大の欠陥になる。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RuntimeProfileBinder, BindingError } from "../src/binder.js";
import { CapabilityRegistry, CapabilityManifestError } from "../src/capability-registry.js";
import { UserContextProvider, UserProfileError } from "../src/user-context-provider.js";
import { PersonaResolutionError, type PersonaRepository } from "../src/persona-repository.js";

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

// --- User Context Provider ---

test("User Profile: §6.2 の例から最小情報を取り出す", () => {
  const resolved = new UserContextProvider().resolve({
    schema_version: 1,
    user_id: "default",
    identity: { preferred_name: "Masa" },
    communication: { language: "ja", verbosity: "concise", directness: "high" },
    relationship: { familiarity: "established", memory_namespace: "users/default/aiko" },
    privacy: { allow_remote_persona_service: false, allow_usage_telemetry: false },
  });
  assert.deepEqual(resolved.context, {
    id: "default",
    preferredName: "Masa",
    language: "ja",
    verbosity: "concise",
    directness: "high",
  });
  assert.equal(resolved.memoryNamespace, "users/default/aiko");
});

test("User Profile: privacy の項目が無ければ拒否側に倒す", () => {
  const resolved = new UserContextProvider().resolve({ schema_version: 1, user_id: "default" });
  assert.deepEqual(resolved.privacy, {
    allowRemotePersonaService: false,
    allowUsageTelemetry: false,
  });
});

test("User Profile: user_id が無ければ例外（§6.5 解決不能）", () => {
  assert.throws(
    () => new UserContextProvider().resolve({ schema_version: 1 }),
    UserProfileError,
  );
});

test("User Profile: 受理範囲外の版は例外（§10.3.1）", () => {
  assert.throws(
    () => new UserContextProvider({ currentSchemaVersion: 3 }).resolve({
      schema_version: 1,
      user_id: "default",
    }),
    UserProfileError,
  );
});

test("User Profile: 未知の verbosity は黙って捨てる（既定へ落とす）", () => {
  const resolved = new UserContextProvider().resolve({
    schema_version: 1,
    user_id: "default",
    communication: { verbosity: "ものすごく詳しく" },
  });
  assert.equal(resolved.context.verbosity, undefined);
});

test("User Profile: ファイルが無ければ例外", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aiko-user-"));
  try {
    await assert.rejects(
      () => new UserContextProvider().loadFromFile(join(dir, "none.json")),
      UserProfileError,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("User Profile: 壊れた JSON は例外", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aiko-user-"));
  const path = join(dir, "profile.json");
  try {
    await writeFile(path, "{ not json", "utf8");
    await assert.rejects(() => new UserContextProvider().loadFromFile(path), UserProfileError);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- Capability Registry ---

test("Capability: §6.3 の例から使える能力を並べる", () => {
  const resolved = new CapabilityRegistry().resolve({
    schema_version: 1,
    runtime_id: "claude-code",
    built_in_tools: [{ id: "filesystem", operations: ["read", "write"] }],
    mcp_servers: [{ id: "github", availability: "ready" }],
    skills: [{ id: "code-review", version: "2.1.0" }],
    credentials: { handling: "host-managed", values_included: false },
  });
  assert.deepEqual(resolved.available, ["code-review", "filesystem", "github"]);
  assert.deepEqual(resolved.excluded, []);
});

test("Capability: 使えないものは理由つきで除外し、止めない（§6.5 末尾）", () => {
  const resolved = new CapabilityRegistry().resolve({
    schema_version: 1,
    runtime_id: "codex",
    mcp_servers: [
      { id: "github", availability: "ready" },
      { id: "slack", availability: "unavailable" },
      { id: "notion", availability: "unknown" },
    ],
  });
  assert.deepEqual(resolved.available, ["github"]);
  assert.deepEqual(resolved.excluded.map((e) => e.id), ["notion", "slack"]);
  assert.match(resolved.excluded[0]?.reason ?? "", /確認できません/);
  assert.match(resolved.excluded[1]?.reason ?? "", /利用できません/);
});

test("Capability: 認証情報の値を含む宣言は拒否する（§3.3）", () => {
  assert.throws(
    () =>
      new CapabilityRegistry().resolve({
        schema_version: 1,
        runtime_id: "claude-code",
        credentials: { handling: "host-managed", values_included: true },
      }),
    CapabilityManifestError,
  );
});

test("Capability: 受理範囲外の版は拒否する", () => {
  assert.throws(
    () => new CapabilityRegistry({ currentSchemaVersion: 3 }).resolve({
      schema_version: 1,
      runtime_id: "codex",
    }),
    CapabilityManifestError,
  );
});

// --- Binder ---

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
