// User Context Provider のテスト。設計書 §5.4 / §6.2。
//
// 通る経路より、止まるべき経路を厚く見る。この層の役割は §6.5 の fail-closed
// 判定なので、止まらないことが最大の欠陥になる。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UserContextProvider, UserProfileError } from "../src/user-context-provider.js";

const user = {
  context: { id: "default", preferredName: "マサ" },
  privacy: { allowRemotePersonaService: false, allowUsageTelemetry: false },
};

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

test("User Profile: 未知の verbosity は黙って捨てず拒否する", () => {
  // 捨てると、設定したつもりで効いていない状態に置かれ、しかも気付けない。
  // スキーマ側も enum で弾く（§6.2）ので、ここで通すと二重基準になる。
  assert.throws(
    () =>
      new UserContextProvider().resolve({
        schema_version: 1,
        user_id: "default",
        communication: { verbosity: "ものすごく詳しく" },
      }),
    (err: unknown) => {
      assert.ok(err instanceof UserProfileError);
      assert.match(err.message, /concise \/ normal \/ detailed/);
      return true;
    },
  );
});

test("User Profile: 未知の directness も拒否する", () => {
  assert.throws(
    () =>
      new UserContextProvider().resolve({
        schema_version: 1,
        user_id: "default",
        communication: { directness: "とても高い" },
      }),
    UserProfileError,
  );
});

test("User Profile: communication が無い場合は何も設定しない（拒否しない）", () => {
  const resolved = new UserContextProvider().resolve({ schema_version: 1, user_id: "default" });
  assert.equal(resolved.context.verbosity, undefined);
  assert.equal(resolved.context.directness, undefined);
  assert.equal(resolved.context.language, undefined);
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

