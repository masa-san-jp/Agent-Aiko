// 入力上限（§21）と受入（§20.7）。
//
// §21 は「超過時は明示的に拒否する」と定めている。**明示的に**が肝で、
// 大きい入力が通ってどこか奥で落ちるのは拒否ではない。
//
// §20.7 は「Claude Code と Codex で同じ profile hash を表示すること」。
// 実際に一致するのは人格の中身の hash で、起動の hash は注入手段を含むため
// 経路ごとに変わる（§14.1）。両方を出したうえで、どちらがどちらかを固定する。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  FileSystemPersonaRepository,
  INPUT_LIMITS,
  InputTooLargeError,
  type PersonaRepository,
} from "@agent-aiko/core";
import { UserContextProvider, UserProfileError } from "@agent-aiko/user-context";
import { prepareLaunch } from "@agent-aiko/adapter-claude-code";
import { prepareThread } from "@agent-aiko/adapter-codex";
import { collectStatus, renderStatus, resolveEnvironment } from "@agent-aiko/cli";

const persona = {
  id: "aiko",
  version: "0.1.0",
  identityCore: "あたしはアイコ。",
  invariants: "取り繕わない。",
  behavioralContract: "仕様書がなければ実装しない。",
  sources: [],
};

const repo: PersonaRepository = { load: async () => persona };

const user = {
  context: { id: "masa", preferredName: "マサさん" },
  privacy: { allowRemotePersonaService: false, allowUsageTelemetry: false },
};

async function write(path: string, text: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

// --- §21 入力上限 ---

test("上限を超える人格は、読んだ時点で拒否される", async () => {
  const home = await mkdtemp(join(tmpdir(), "aiko-limit-"));
  try {
    const aikoHome = join(home, ".aiko");
    await write(join(aikoHome, "persona", "origin", "persona.md"), "あ".repeat(INPUT_LIMITS.personaPackage));
    await write(join(aikoHome, "INVARIANTS.md"), "不変\n");
    await assert.rejects(
      () => new FileSystemPersonaRepository({ aikoHome }).load({ id: "aiko" }),
      InputTooLargeError,
    );
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("上限ちょうどの人格は読める", async () => {
  // 上限は「これ以下なら通る」でなければ、使える幅が実際には分からない。
  const home = await mkdtemp(join(tmpdir(), "aiko-limit-ok-"));
  try {
    const aikoHome = join(home, ".aiko");
    await write(join(aikoHome, "persona", "origin", "persona.md"), "a".repeat(INPUT_LIMITS.personaPackage));
    await write(join(aikoHome, "INVARIANTS.md"), "不変\n");
    const snapshot = await new FileSystemPersonaRepository({ aikoHome }).load({ id: "aiko" });
    assert.equal(snapshot.identityCore.length, INPUT_LIMITS.personaPackage);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("上限を超える User Profile は拒否される", async () => {
  const home = await mkdtemp(join(tmpdir(), "aiko-limit-user-"));
  try {
    const path = join(home, "user-profile.json");
    await write(
      path,
      JSON.stringify({ schema_version: 1, user_id: "masa", note: "あ".repeat(INPUT_LIMITS.userProfile) }),
    );
    await assert.rejects(() => new UserContextProvider().loadFromFile(path), UserProfileError);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("拒否の理由が「大きすぎる」と分かる", async () => {
  const home = await mkdtemp(join(tmpdir(), "aiko-limit-why-"));
  try {
    const path = join(home, "user-profile.json");
    await write(
      path,
      JSON.stringify({ schema_version: 1, user_id: "masa", note: "あ".repeat(INPUT_LIMITS.userProfile) }),
    );
    await assert.rejects(
      () => new UserContextProvider().loadFromFile(path),
      (err: Error) => err.message.includes("上限を超えています"),
    );
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

// --- §20.7 受入 ---

test("§20.7 Claude Code と Codex は同じ人格の hash を出す", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aiko-accept-"));
  try {
    const claude = (await prepareLaunch({ personaRepository: repo, user, stateDir: dir })).profile;
    const codex = (await prepareThread({ personaRepository: repo, user })).profile;
    assert.equal(claude.configuration_hash, codex.configuration_hash);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("§14.1 起動の hash は経路で変わる", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aiko-accept2-"));
  try {
    const claude = (await prepareLaunch({ personaRepository: repo, user, stateDir: dir })).profile;
    const codex = (await prepareThread({ personaRepository: repo, user })).profile;
    assert.notEqual(claude.profile_hash, codex.profile_hash);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aiko status は両方の hash を表示する", async () => {
  const home = await mkdtemp(join(tmpdir(), "aiko-status-"));
  try {
    const aikoHome = join(home, ".aiko");
    await write(join(aikoHome, "persona", "origin", "persona.md"), "あたしはアイコ。\n");
    await write(join(aikoHome, "INVARIANTS.md"), "取り繕わない。\n");
    const env = resolveEnvironment({ AIKO_HOME: aikoHome, PATH: "" });
    const status = await collectStatus(env, "0.1.0", { PATH: "" });
    const text = renderStatus(status);
    assert.deepEqual(
      [text.includes("人格の中身:"), text.includes("この起動:")],
      [true, true],
    );
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
