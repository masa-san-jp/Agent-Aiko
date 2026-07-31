// CLI のテスト。実際に一時ディレクトリへ ~/.aiko 相当を作って回す。
//
// 権限の検査を含むので、モードを本当に設定して本当に読み直す。ここを mock に
// すると「仕様には書いてあるが実際は設定されていない」という、まさに直したい
// 種類のずれを検出できなくなる。

import { test } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/run.js";

const VERSION = "0.1.0";

async function makeHome(
  layout: Record<string, string> = {
    "persona/origin/persona.md": "あたしはアイコ。",
    "INVARIANTS.md": "取り繕わない。",
  },
): Promise<{ home: string; cleanup: () => Promise<void> }> {
  const home = await mkdtemp(join(tmpdir(), "aiko-cli-test-"));
  for (const [rel, content] of Object.entries(layout)) {
    const path = join(home, rel);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, content, "utf8");
  }
  await chmod(home, 0o700);
  return { home, cleanup: () => rm(home, { recursive: true, force: true }) };
}

function capture(env: NodeJS.ProcessEnv = {}) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: { out: (t: string) => out.push(t), err: (t: string) => err.push(t), env },
    out: () => out.join(""),
    err: () => err.join(""),
  };
}

test("status: 人格が読めれば healthy と profile が出る", async () => {
  const { home, cleanup } = await makeHome();
  try {
    const c = capture({ AIKO_HOME: home, PATH: "" });
    const code = await run(["status"], VERSION, c.io);
    assert.equal(code, 0);
    assert.match(c.out(), /Aiko-MCP 0\.1\.0/);
    assert.match(c.out(), /Binding: healthy/);
    assert.match(c.out(), /User: default/);
  } finally {
    await cleanup();
  }
});

test("status: 人格が読めないときは exit 0 で成功に見せない", async () => {
  const { home, cleanup } = await makeHome({ "mode": "origin" });
  try {
    const c = capture({ AIKO_HOME: home, PATH: "" });
    const code = await run(["status"], VERSION, c.io);
    assert.equal(code, 1);
    assert.match(c.out(), /Binding: failed/);
  } finally {
    await cleanup();
  }
});

test("status: PATH に無いランタイムは not installed と出る", async () => {
  const { home, cleanup } = await makeHome();
  try {
    const c = capture({ AIKO_HOME: home, PATH: "" });
    await run(["status"], VERSION, c.io);
    assert.match(c.out(), /Claude Code\s+not installed/);
  } finally {
    await cleanup();
  }
});

test("doctor: 不変条項が空なら fail closed の理由を出す", async () => {
  const { home, cleanup } = await makeHome({
    "persona/origin/persona.md": "あたしはアイコ。",
    "INVARIANTS.md": "   ",
  });
  try {
    const c = capture({ AIKO_HOME: home, PATH: "" });
    const code = await run(["doctor"], VERSION, c.io);
    assert.equal(code, 1);
    assert.match(c.out(), /不変条項が空/);
  } finally {
    await cleanup();
  }
});

test("doctor: 権限が緩いと warn になり、--fix で 0700 に直る", async () => {
  const { home, cleanup } = await makeHome();
  try {
    await chmod(home, 0o755);
    const before = capture({ AIKO_HOME: home, PATH: "" });
    await run(["doctor"], VERSION, before.io);
    assert.match(before.out(), /warn\s+~\/\.aiko の権限が 0700/);
    assert.match(before.out(), /0755/);

    const fixing = capture({ AIKO_HOME: home, PATH: "" });
    const code = await run(["doctor", "--fix"], VERSION, fixing.io);
    assert.equal(code, 0);
    assert.equal((await stat(home)).mode & 0o777, 0o700);
    assert.match(fixing.out(), /直したもの: home-mode/);
  } finally {
    await cleanup();
  }
});

test("doctor: --fix を付けなければ何も直さない", async () => {
  const { home, cleanup } = await makeHome();
  try {
    await chmod(home, 0o755);
    const c = capture({ AIKO_HOME: home, PATH: "" });
    await run(["doctor"], VERSION, c.io);
    assert.equal((await stat(home)).mode & 0o777, 0o755);
  } finally {
    await cleanup();
  }
});

test("doctor: User Profile が未設定なら既定で動いていることを警告として出す", async () => {
  const { home, cleanup } = await makeHome();
  try {
    const c = capture({ AIKO_HOME: home, PATH: "" });
    await run(["doctor"], VERSION, c.io);
    assert.match(c.out(), /AIKO_USER_PROFILE が未設定/);
  } finally {
    await cleanup();
  }
});

test("doctor: User Profile の権限が緩いと --fix で 0600 に直る", async () => {
  const { home, cleanup } = await makeHome();
  try {
    const profile = join(home, "user-profile.json");
    await writeFile(profile, JSON.stringify({ schema_version: 1, user_id: "masa" }), "utf8");
    await chmod(profile, 0o644);

    const c = capture({ AIKO_HOME: home, AIKO_USER_PROFILE: profile, PATH: "" });
    const code = await run(["doctor", "--fix"], VERSION, c.io);
    assert.equal(code, 0);
    assert.equal((await stat(profile)).mode & 0o777, 0o600);
  } finally {
    await cleanup();
  }
});

test("配布に属するコマンドは、黙って何もしないのではなく理由を返す", async () => {
  const c = capture({ PATH: "" });
  const code = await run(["update"], VERSION, c.io);
  assert.equal(code, 2);
  assert.match(c.err(), /Phase 5/);
});

test("知らないコマンドは使い方を出して 2 を返す", async () => {
  const c = capture({ PATH: "" });
  const code = await run(["nope"], VERSION, c.io);
  assert.equal(code, 2);
  assert.match(c.err(), /知らないコマンド/);
});

test("help と --version は常に成功する", async () => {
  const h = capture({ PATH: "" });
  assert.equal(await run(["help"], VERSION, h.io), 0);
  assert.match(h.out(), /使い方: aiko/);

  const v = capture({ PATH: "" });
  assert.equal(await run(["--version"], VERSION, v.io), 0);
  assert.equal(v.out().trim(), VERSION);
});
