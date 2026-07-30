// Aiko-MCP スキーマの検証テスト。
//
// 一番大事な性質は「設計書に載っている例がそのまま通ること」。スキーマが設計書から
// 離れていないことを、書き写した文章ではなく実行で確かめる。
// 併せて、通ってはいけないものが弾かれることも確かめる（通るだけのテストは、
// 制約を全部外しても通ってしまうため意味がない）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
// スキーマは draft 2020-12。ajv の既定エントリは draft-07 なので 2020 用を読む。
import Ajv from "ajv/dist/2020.js";

const schemaDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const ajv = new Ajv({ allErrors: true, strict: true });
const schemaFiles = readdirSync(schemaDir).filter((f) => f.endsWith(".schema.json"));
for (const file of schemaFiles) {
  ajv.addSchema(JSON.parse(readFileSync(join(schemaDir, file), "utf8")));
}

const validator = (name) => {
  const v = ajv.getSchema(
    `https://github.com/masa-san-jp/Agent-Aiko/schemas/${name}.schema.json`,
  );
  assert.ok(v, `schema not found: ${name}`);
  return v;
};

const SHA = "a".repeat(64);

test("設計書の6本すべてがスキーマとして構文的に妥当", () => {
  assert.equal(schemaFiles.length, 6, `expected 6 schemas, found: ${schemaFiles.join(", ")}`);
  for (const name of [
    "binding-request",
    "user-profile",
    "capability-manifest",
    "permission-manifest",
    "persona-package",
    "runtime-profile",
  ]) {
    validator(name);
  }
});

// --- 設計書 §6.1 の例 ---
test("Binding Request: 設計書 §6.1 の例が通る", () => {
  const validate = validator("binding-request");
  const ok = validate({
    persona_ref: { id: "aiko", version: "3.2.0" },
    user_ref: { id: "default" },
    runtime: { id: "claude-code", model_family: "claude" },
    capabilities_ref: { source: "runtime-discovery" },
    task_context: { project_root: "/home/user/project", task_type: "software-development" },
  });
  assert.ok(ok, ajv.errorsText(validate.errors));
});

test("Binding Request: 未知の runtime は弾く", () => {
  const validate = validator("binding-request");
  assert.equal(
    validate({
      persona_ref: { id: "aiko" },
      user_ref: { id: "default" },
      runtime: { id: "some-other-client" },
    }),
    false,
  );
});

test("Binding Request: project_root は絶対パスのみ", () => {
  const validate = validator("binding-request");
  assert.equal(
    validate({
      persona_ref: { id: "aiko" },
      user_ref: { id: "default" },
      runtime: { id: "codex" },
      task_context: { project_root: "relative/path" },
    }),
    false,
  );
});

// --- 設計書 §6.2 の例 ---
test("User Profile: 設計書 §6.2 の例が通る", () => {
  const validate = validator("user-profile");
  const ok = validate({
    schema_version: 1,
    user_id: "default",
    identity: { preferred_name: "Masa" },
    communication: { language: "ja", verbosity: "concise", directness: "high" },
    relationship: { familiarity: "established", memory_namespace: "users/default/aiko" },
    privacy: { allow_remote_persona_service: false, allow_usage_telemetry: false },
  });
  assert.ok(ok, ajv.errorsText(validate.errors));
});

test("User Profile: 綴り違いの項目は黙って無視せず弾く", () => {
  const validate = validator("user-profile");
  assert.equal(
    validate({ schema_version: 1, user_id: "default", privacyy: { allow_usage_telemetry: true } }),
    false,
  );
});

// --- 設計書 §6.3 / §3.3 の例 ---
test("Capability Manifest: 設計書 §6.3 の例が通る", () => {
  const validate = validator("capability-manifest");
  const ok = validate({
    schema_version: 1,
    runtime_id: "claude-code",
    built_in_tools: [{ id: "filesystem", operations: ["read", "write"] }],
    mcp_servers: [{ id: "github", availability: "ready" }],
    skills: [{ id: "code-review", version: "2.1.0" }],
    credentials: { handling: "host-managed", values_included: false },
  });
  assert.ok(ok, ajv.errorsText(validate.errors));
});

test("Capability Manifest: 設計書 §3.3 の tool 例（credential_provider: host）が通る", () => {
  const validate = validator("capability-manifest");
  const ok = validate({
    schema_version: 1,
    runtime_id: "codex",
    mcp_servers: [
      {
        id: "github",
        availability: "ready",
        operations: ["repository.read", "issue.write"],
        credential_provider: "host",
      },
    ],
  });
  assert.ok(ok, ajv.errorsText(validate.errors));
});

test("Capability Manifest: 認証情報の値を含む宣言は弾く（§3.3）", () => {
  const validate = validator("capability-manifest");
  assert.equal(
    validate({
      schema_version: 1,
      runtime_id: "claude-code",
      credentials: { handling: "host-managed", values_included: true },
    }),
    false,
  );
});

// --- Persona Package（§5.1 / §6.5） ---
test("Persona Package: 最小構成が通る", () => {
  const validate = validator("persona-package");
  const ok = validate({
    schema_version: 1,
    id: "aiko",
    version: "3.2.0",
    identity_core: { path: "identity-core.md", sha256: SHA },
    invariants: { path: "INVARIANTS.md", sha256: SHA },
  });
  assert.ok(ok, ajv.errorsText(validate.errors));
});

test("Persona Package: invariants の欠落は弾く（§6.5 の fail-closed 条件）", () => {
  const validate = validator("persona-package");
  assert.equal(
    validate({
      schema_version: 1,
      id: "aiko",
      version: "3.2.0",
      identity_core: { path: "identity-core.md", sha256: SHA },
    }),
    false,
  );
});

test("Persona Package: hash の形が不正なら弾く（§6.5）", () => {
  const validate = validator("persona-package");
  assert.equal(
    validate({
      schema_version: 1,
      id: "aiko",
      version: "3.2.0",
      identity_core: { path: "identity-core.md", sha256: "not-a-hash" },
      invariants: { path: "INVARIANTS.md", sha256: SHA },
    }),
    false,
  );
});

test("Persona Package: version は SemVer のみ", () => {
  const validate = validator("persona-package");
  assert.equal(
    validate({
      schema_version: 1,
      id: "aiko",
      version: "3.2",
      identity_core: { path: "identity-core.md", sha256: SHA },
      invariants: { path: "INVARIANTS.md", sha256: SHA },
    }),
    false,
  );
});

// --- Permission Manifest（§8.2） ---
test("Permission Manifest: sandbox と approval を持つ宣言が通る", () => {
  const validate = validator("permission-manifest");
  const ok = validate({
    schema_version: 1,
    runtime_id: "codex",
    filesystem: { readable_paths: ["/home/user/project"], writable_paths: ["/home/user/project"] },
    network: { outbound: "denied" },
    approval: { policy: "untrusted", require_for: ["shell", "git-push"] },
    sandbox: { mode: "workspace-write" },
  });
  assert.ok(ok, ajv.errorsText(validate.errors));
});

test("Permission Manifest: 相対パスは弾く", () => {
  const validate = validator("permission-manifest");
  assert.equal(
    validate({ schema_version: 1, runtime_id: "codex", filesystem: { writable_paths: ["./src"] } }),
    false,
  );
});

// --- Runtime Profile（§5.3 / §2.1 / §8.5） ---
test("Runtime Profile: 合成結果が通る", () => {
  const validate = validator("runtime-profile");
  const ok = validate({
    schema_version: 1,
    profile_id: "01JBX7",
    profile_hash: SHA,
    persona: { id: "aiko", version: "3.2.0" },
    user_id: "default",
    runtime: {
      id: "claude-code",
      consistency_level: 2,
      injection_method: "claude-code:system-prompt-file",
    },
    instructions: "あなたは AI エージェント「アイコ」です。",
    excluded_capabilities: [{ id: "github", reason: "MCP サーバーが起動していない" }],
    provenance: {
      created_at: "2026-07-30T21:00:00+09:00",
      binder_version: "0.1.0",
      capability_manifest_hash: SHA,
    },
  });
  assert.ok(ok, ajv.errorsText(validate.errors));
});

test("Runtime Profile: 適合レベルは 0..2（§2.1）", () => {
  const validate = validator("runtime-profile");
  assert.equal(
    validate({
      schema_version: 1,
      profile_id: "p1",
      profile_hash: SHA,
      persona: { id: "aiko", version: "3.2.0" },
      runtime: { id: "claude-code", consistency_level: 3 },
      instructions: "x",
    }),
    false,
  );
});

test("Runtime Profile: 実測していない注入手段は値に持てない（§8.5）", () => {
  const validate = validator("runtime-profile");
  assert.equal(
    validate({
      schema_version: 1,
      profile_id: "p1",
      profile_hash: SHA,
      persona: { id: "aiko", version: "3.2.0" },
      runtime: {
        id: "antigravity-cli",
        consistency_level: 1,
        injection_method: "antigravity-cli:context-file",
      },
      instructions: "x",
    }),
    false,
  );
});

test("Runtime Profile: instructions が空なら弾く", () => {
  const validate = validator("runtime-profile");
  assert.equal(
    validate({
      schema_version: 1,
      profile_id: "p1",
      profile_hash: SHA,
      persona: { id: "aiko", version: "3.2.0" },
      runtime: { id: "codex", consistency_level: 2 },
      instructions: "",
    }),
    false,
  );
});
