// Security Test。SDK 設計書 §20.6 の8項目。
//
// token redaction / path redaction / malformed manifest / oversized input /
// path traversal / prototype pollution / schema bomb / log injection。
//
// 実際に2つ見つかった（path traversal と schema bomb）。見つかったものは直してあり、
// ここは「同じ穴がもう一度開かないこと」を見る。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { FileSystemPersonaRepository, hashObject, HashInputError, isSafePersonaName } from "@agent-aiko/core";
import { CapabilityRegistry } from "@agent-aiko/capability-registry";
import { redact, redactText, REDACTED, RuntimeSdkError } from "../src/index.js";

async function write(path: string, text: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

// --- token redaction（§13.3） ---

test("GitHub token は秘匿される", () => {
  const out = redactText("token は ghp_abcdefghijklmnopqrstuvwxyz012345 です");
  assert.equal(out.includes("ghp_abcdefghijklmnopqrstuvwxyz012345"), false);
});

test("秘密鍵の本文は秘匿される", () => {
  const key = "-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----";
  assert.equal(redactText(`鍵: ${key}`).includes("MIIabc"), false);
});

test("JWT は秘匿される", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
  assert.equal(redactText(`Authorization: ${jwt}`).includes(jwt), false);
});

test("URL の query は秘匿される", () => {
  const out = redactText("https://example.com/api?token=abc123&user=masa");
  assert.equal(out.includes("abc123"), false);
});

// --- path redaction（§13.3） ---

test("ホームディレクトリは ~ に置き換わる", () => {
  const out = redactText("/home/masa/.aiko/user.md を読めません", { home: "/home/masa" });
  assert.equal(out, "~/.aiko/user.md を読めません");
});

test("エラーの toJSON でもホームディレクトリが出ない", () => {
  const err = new RuntimeSdkError({
    code: "AIKO_RUNTIME_PERSONA_NOT_FOUND",
    userMessage: `${process.env["HOME"] ?? "/home/x"}/.aiko/persona を読めません`,
  });
  assert.equal(String(JSON.stringify(err.toJSON())).includes(String(process.env["HOME"])), false);
});

test("エラーの details に混ざった token も秘匿される", () => {
  const err = new RuntimeSdkError({
    code: "AIKO_RUNTIME_BIND_FAILED",
    userMessage: "合成に失敗しました",
    details: { hint: "ghp_abcdefghijklmnopqrstuvwxyz012345 で試した" },
  });
  assert.equal(JSON.stringify(err.toJSON()).includes("ghp_abcdefghijklmnop"), false);
});

// --- log injection（§20.6） ---

test("改行を含む値はログの行を割らない", () => {
  const out = redactText("ok\n2026-08-01 FATAL 偽の行");
  assert.equal(out.includes("\n"), false);
});

test("制御文字は落とされる", () => {
  // ANSI エスケープを流すと、ログを見る端末の表示を書き換えられる。
  assert.equal(redactText("普通[2J消した").includes(""), false);
});

// --- oversized input（§20.6） ---

test("長すぎる文字列は切り詰められる", () => {
  const out = redactText("あ".repeat(5000), { maxLength: 100 });
  assert.equal(out.length < 200, true);
});

test("要素が多すぎる配列は切り詰められる", () => {
  const out = redact(Array.from({ length: 1000 }, (_, i) => `x${i}`)) as unknown[];
  assert.equal(out.length, 100);
});

// --- prototype pollution（§20.6） ---

test("__proto__ は診断出力へ通らない", () => {
  const out = redact(JSON.parse('{"a":1,"__proto__":{"polluted":"yes"}}')) as Record<string, unknown>;
  assert.deepEqual(Object.keys(out), ["a"]);
});

test("診断出力を作っても Object.prototype は汚れない", () => {
  redact(JSON.parse('{"__proto__":{"pollutedByRedact":"yes"}}'));
  assert.equal(({} as Record<string, unknown>)["pollutedByRedact"], undefined);
});

// --- schema bomb（§20.6） ---

test("深すぎる入れ子は制御された拒否になる", () => {
  // 以前は再帰でスタックを使い切って RangeError になっていた。
  let deep: Record<string, unknown> = {};
  const root = deep;
  for (let i = 0; i < 5000; i += 1) {
    const next: Record<string, unknown> = {};
    deep["n"] = next;
    deep = next;
  }
  assert.throws(() => hashObject(root), HashInputError);
});

test("深すぎる入れ子を秘匿しても落ちない", () => {
  let deep: Record<string, unknown> = {};
  const root = deep;
  for (let i = 0; i < 5000; i += 1) {
    const next: Record<string, unknown> = {};
    deep["n"] = next;
    deep = next;
  }
  assert.equal(typeof redact(root), "object");
});

// --- malformed manifest（§20.6） ---

test("オブジェクトでない Capability Manifest は拒否される", () => {
  assert.throws(() => new CapabilityRegistry().resolve("これは目録ではない"));
});

test("schema_version の無い Capability Manifest は拒否される", () => {
  assert.throws(() => new CapabilityRegistry().resolve({ tools: [] }));
});

// --- path traversal（§20.6） ---

test("人格名に区切り文字は使えない", () => {
  assert.deepEqual(
    ["../../secret", "a/b", "..", ".hidden", "aiko-dev"].map(isSafePersonaName),
    [false, false, false, false, true],
  );
});

test("active-persona に ../ を書いても置き場の外を読まない", async () => {
  const home = await mkdtemp(join(tmpdir(), "aiko-sec-"));
  try {
    const aikoHome = join(home, ".aiko");
    await write(join(aikoHome, "persona", "origin", "persona.md"), "正規の人格\n");
    await write(join(aikoHome, "persona", "override", "persona.md"), "既定の override\n");
    await write(join(aikoHome, "INVARIANTS.md"), "不変\n");
    await write(join(aikoHome, "mode"), "override\n");
    await write(join(home, "secret", "persona.md"), "外部の秘密ファイル\n");
    await write(join(aikoHome, "active-persona"), "../../../secret\n");

    const snapshot = await new FileSystemPersonaRepository({ aikoHome }).load({ id: "aiko" });
    assert.equal(snapshot.identityCore.includes("外部の秘密ファイル"), false);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("正しい人格名なら今までどおり読める", async () => {
  const home = await mkdtemp(join(tmpdir(), "aiko-sec-ok-"));
  try {
    const aikoHome = join(home, ".aiko");
    await write(join(aikoHome, "persona", "overrides", "aiko-dev", "persona.md"), "開発の人格\n");
    await write(join(aikoHome, "INVARIANTS.md"), "不変\n");
    await write(join(aikoHome, "mode"), "override\n");
    await write(join(aikoHome, "active-persona"), "aiko-dev\n");

    const snapshot = await new FileSystemPersonaRepository({ aikoHome }).load({ id: "aiko" });
    assert.equal(snapshot.identityCore.trim(), "開発の人格");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("秘匿しても普通の文は読めるまま残る", () => {
  // 秘匿が強すぎて全部消えるなら、診断としては使えない。
  assert.equal(redactText("人格を読み出せませんでした"), "人格を読み出せませんでした");
});
