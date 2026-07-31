// configure のテスト。対話の答えを配列で渡して実際にファイルを書かせる。
//
// 書き込み権限まで実測する。設計書 §11.3 が 0600 を指定していても、
// 実際に設定していなければ意味が無いことは今日ここで見た。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/run.js";
import { resolveEnvironment } from "../src/environment.js";

const VERSION = "0.1.0";

async function home(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "aiko-configure-"));
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

/** 用意した答えを順に返す。足りなくなったら空（＝既定を採る）。 */
function scripted(answers: string[]) {
  let i = 0;
  const asked: string[] = [];
  const ask = async (question: string) => {
    asked.push(question);
    return answers[i++] ?? "";
  };
  return { ask, asked: () => asked };
}

function capture(env: NodeJS.ProcessEnv, ask?: (q: string) => Promise<string>) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: { out: (t: string) => out.push(t), err: (t: string) => err.push(t), env, ...(ask ? { ask } : {}) },
    out: () => out.join(""),
    err: () => err.join(""),
  };
}

test("答えた内容が User Profile として書き出される", async () => {
  const { dir, cleanup } = await home();
  try {
    const s = scripted(["masa", "マサくん", "ja", "concise", "high", "established"]);
    const c = capture({ AIKO_HOME: dir, PATH: "" }, s.ask);
    const code = await run(["configure"], VERSION, c.io);
    assert.equal(code, 0);

    const path = join(dir, "user-profile.json");
    const profile = JSON.parse(await readFile(path, "utf8"));
    assert.equal(profile.user_id, "masa");
    assert.equal(profile.identity.preferred_name, "マサくん");
    assert.equal(profile.communication.language, "ja");
    assert.equal(profile.communication.verbosity, "concise");
    assert.equal(profile.communication.directness, "high");
    assert.equal(profile.relationship.familiarity, "established");
  } finally {
    await cleanup();
  }
});

test("外部送信は聞かずに全て無効で書く", async () => {
  const { dir, cleanup } = await home();
  try {
    const s = scripted(["masa", "マサくん"]);
    const c = capture({ AIKO_HOME: dir, PATH: "" }, s.ask);
    await run(["configure"], VERSION, c.io);
    const profile = JSON.parse(await readFile(join(dir, "user-profile.json"), "utf8"));
    assert.equal(profile.privacy.allow_remote_persona_service, false);
    assert.equal(profile.privacy.allow_usage_telemetry, false);
    assert.equal(
      s.asked().some((q) => q.includes("送信")),
      false,
      "外部送信の可否を対話で聞いてはいけない",
    );
  } finally {
    await cleanup();
  }
});

test("書き出したファイルは 0600", async () => {
  const { dir, cleanup } = await home();
  try {
    const s = scripted(["masa"]);
    const c = capture({ AIKO_HOME: dir, PATH: "" }, s.ask);
    await run(["configure"], VERSION, c.io);
    const mode = (await stat(join(dir, "user-profile.json"))).mode & 0o777;
    assert.equal(mode, 0o600);
  } finally {
    await cleanup();
  }
});

test("識別名が形式に合わないうちは聞き直す", async () => {
  const { dir, cleanup } = await home();
  try {
    // 大文字・記号は不可。3回目でようやく通る。
    const s = scripted(["Masa!", "マサ", "masa"]);
    const c = capture({ AIKO_HOME: dir, PATH: "" }, s.ask);
    await run(["configure"], VERSION, c.io);
    const profile = JSON.parse(await readFile(join(dir, "user-profile.json"), "utf8"));
    assert.equal(profile.user_id, "masa");
  } finally {
    await cleanup();
  }
});

test("選択肢にない答えは採らずに聞き直す", async () => {
  const { dir, cleanup } = await home();
  try {
    const s = scripted(["masa", "", "", "とても短く", "concise"]);
    const c = capture({ AIKO_HOME: dir, PATH: "" }, s.ask);
    await run(["configure"], VERSION, c.io);
    const profile = JSON.parse(await readFile(join(dir, "user-profile.json"), "utf8"));
    assert.equal(profile.communication.verbosity, "concise");
  } finally {
    await cleanup();
  }
});

test("既にあるものを読み、空欄なら今の値を残す", async () => {
  const { dir, cleanup } = await home();
  try {
    const path = join(dir, "user-profile.json");
    await writeFile(
      path,
      JSON.stringify({ schema_version: 1, user_id: "masa", identity: { preferred_name: "マサくん" } }),
      "utf8",
    );
    const s = scripted(["", ""]);
    const c = capture({ AIKO_HOME: dir, PATH: "" }, s.ask);
    await run(["configure"], VERSION, c.io);
    const profile = JSON.parse(await readFile(path, "utf8"));
    assert.equal(profile.user_id, "masa");
    assert.equal(profile.identity.preferred_name, "マサくん");
  } finally {
    await cleanup();
  }
});

test("対話できない環境では作らずに理由を返す", async () => {
  const { dir, cleanup } = await home();
  try {
    const c = capture({ AIKO_HOME: dir, PATH: "" });
    const code = await run(["configure"], VERSION, c.io);
    assert.equal(code, 2);
    assert.match(c.err(), /対話できる環境/);
  } finally {
    await cleanup();
  }
});

test("configure が置いたファイルを、指定なしでも拾う", async () => {
  const { dir, cleanup } = await home();
  try {
    const before = resolveEnvironment({ AIKO_HOME: dir });
    assert.equal(before.userProfilePath, undefined, "無いうちは拾わない");

    const s = scripted(["masa", "マサくん"]);
    const c = capture({ AIKO_HOME: dir, PATH: "" }, s.ask);
    await run(["configure"], VERSION, c.io);

    const after = resolveEnvironment({ AIKO_HOME: dir });
    assert.equal(after.userProfilePath, join(dir, "user-profile.json"));
  } finally {
    await cleanup();
  }
});
