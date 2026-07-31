// Capability Registry のテスト。設計書 §5.5 / §6.3。
//
// 通る経路より、止まるべき経路を厚く見る。使えないものを黙って使える扱いに
// しないことが、この層で最も壊れてはいけない性質。

import { test } from "node:test";
import assert from "node:assert/strict";
import { CapabilityRegistry, CapabilityManifestError } from "../src/capability-registry.js";

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

test("Capability: availability が不正な値なら ready に丸めず除外する", () => {
  // 宣言が壊れているものを一番許す側へ倒すと、使えないものを使えることにしてしまう
  const resolved = new CapabilityRegistry().resolve({
    schema_version: 1,
    runtime_id: "codex",
    mcp_servers: [{ id: "github", availability: "ready-ish" }],
  });
  assert.deepEqual(resolved.available, []);
  assert.deepEqual(resolved.excluded.map((e) => e.id), ["github"]);
  assert.match(resolved.excluded[0]?.reason ?? "", /宣言が不正/);
});

test("Capability: availability が無い項目は ready 扱い（§6.3 の例）", () => {
  const resolved = new CapabilityRegistry().resolve({
    schema_version: 1,
    runtime_id: "claude-code",
    built_in_tools: [{ id: "filesystem", operations: ["read"] }],
  });
  assert.deepEqual(resolved.available, ["filesystem"]);
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

