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
import { PersonaResolutionError, type PersonaRepository } from "@agent-aiko/core";
import { UserContextProvider, UserProfileError } from "@agent-aiko/user-context";
import { CapabilityRegistry, CapabilityManifestError } from "@agent-aiko/capability-registry";

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
