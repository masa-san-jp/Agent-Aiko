// update の適用と rollback。MCP 設計書 Phase 5 / §16。
//
// 見るのは1つ——**利用者のものが変わらないこと**。更新も巻き戻しも、
// それを壊した瞬間に「設定をやり直させる道具」になる。

import { test } from "node:test";
import assert from "node:assert/strict";
import { cp as cpDir, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyUpdate,
  expectedDigest,
  isUserOwned,
  listBackups,
  rollback,
  USER_OWNED_PATHS,
} from "../src/apply-update.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

async function write(path: string, text: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

async function sandbox() {
  const root = await mkdtemp(join(tmpdir(), "aiko-update-"));
  const aikoHome = join(root, ".aiko");
  const template = join(root, "template");
  const backups = join(root, "backups");

  // 配布物側（新しい版）
  await write(join(template, "persona", "origin", "persona.md"), "新しい人格\n");
  await write(join(template, "capability", "rules", "model-routing.md"), "新しい規則\n");
  await write(join(template, "mode"), "origin\n");
  await write(join(template, "user.md"), "テンプレの雛形\n");

  // 手元（古い版＋利用者のもの）
  await write(join(aikoHome, "persona", "origin", "persona.md"), "古い人格\n");
  await write(join(aikoHome, "capability", "rules", "model-routing.md"), "古い規則\n");
  await write(join(aikoHome, "user.md"), "呼び名はマサくん\n");
  await write(join(aikoHome, "mode"), "override\n");
  await write(join(aikoHome, "persona", "aiko-override.md"), "自分で書いた人格\n");
  await write(join(aikoHome, "capability", "rules", "rules-base.md"), "自分で書いた規則\n");

  return { root, aikoHome, template, backups, cleanup: () => rm(root, { recursive: true, force: true }) };
}

const now = new Date("2026-08-01T00:00:00.000Z");

test("更新で配布物側のファイルが新しくなる", async () => {
  const s = await sandbox();
  try {
    await applyUpdate({
      aikoHome: s.aikoHome,
      templateAikoDir: s.template,
      version: "v1.0.0",
      backupRoot: s.backups,
      now,
    });
    assert.equal(await readFile(join(s.aikoHome, "persona", "origin", "persona.md"), "utf8"), "新しい人格\n");
  } finally {
    await s.cleanup();
  }
});

test("更新で User Profile は変わらない", async () => {
  const s = await sandbox();
  try {
    await applyUpdate({
      aikoHome: s.aikoHome,
      templateAikoDir: s.template,
      version: "v1.0.0",
      backupRoot: s.backups,
      now,
    });
    assert.equal(await readFile(join(s.aikoHome, "user.md"), "utf8"), "呼び名はマサくん\n");
  } finally {
    await s.cleanup();
  }
});

test("更新で自分で書いた人格と規則は変わらない", async () => {
  const s = await sandbox();
  try {
    await applyUpdate({
      aikoHome: s.aikoHome,
      templateAikoDir: s.template,
      version: "v1.0.0",
      backupRoot: s.backups,
      now,
    });
    assert.deepEqual(
      [
        await readFile(join(s.aikoHome, "persona", "aiko-override.md"), "utf8"),
        await readFile(join(s.aikoHome, "capability", "rules", "rules-base.md"), "utf8"),
        await readFile(join(s.aikoHome, "mode"), "utf8"),
      ],
      ["自分で書いた人格\n", "自分で書いた規則\n", "override\n"],
    );
  } finally {
    await s.cleanup();
  }
});

test("更新した版を記録する", async () => {
  const s = await sandbox();
  try {
    await applyUpdate({
      aikoHome: s.aikoHome,
      templateAikoDir: s.template,
      version: "v1.0.0",
      backupRoot: s.backups,
      now,
    });
    assert.equal((await readFile(join(s.aikoHome, "version"), "utf8")).trim(), "v1.0.0");
  } finally {
    await s.cleanup();
  }
});

test("巻き戻すと配布物側のファイルが元に戻る", async () => {
  const s = await sandbox();
  try {
    await applyUpdate({
      aikoHome: s.aikoHome,
      templateAikoDir: s.template,
      version: "v1.0.0",
      backupRoot: s.backups,
      now,
    });
    await rollback({ aikoHome: s.aikoHome, backupRoot: s.backups });
    assert.equal(await readFile(join(s.aikoHome, "persona", "origin", "persona.md"), "utf8"), "古い人格\n");
  } finally {
    await s.cleanup();
  }
});

test("巻き戻しても User Profile は変わらない", async () => {
  const s = await sandbox();
  try {
    await applyUpdate({
      aikoHome: s.aikoHome,
      templateAikoDir: s.template,
      version: "v1.0.0",
      backupRoot: s.backups,
      now,
    });
    await writeFile(join(s.aikoHome, "user.md"), "更新後に書き換えた\n");
    await rollback({ aikoHome: s.aikoHome, backupRoot: s.backups });
    assert.equal(await readFile(join(s.aikoHome, "user.md"), "utf8"), "更新後に書き換えた\n");
  } finally {
    await s.cleanup();
  }
});

test("退避が無ければ巻き戻さない", async () => {
  const s = await sandbox();
  try {
    assert.equal(await rollback({ aikoHome: s.aikoHome, backupRoot: s.backups }), undefined);
  } finally {
    await s.cleanup();
  }
});

test("退避には利用者のものが入らない", async () => {
  const s = await sandbox();
  try {
    const result = await applyUpdate({
      aikoHome: s.aikoHome,
      templateAikoDir: s.template,
      version: "v1.0.0",
      backupRoot: s.backups,
      now,
    });
    const backups = await listBackups(s.backups);
    const meta = JSON.parse(await readFile(join(result.backupDir, "backup.json"), "utf8")) as {
      files: string[];
    };
    assert.deepEqual(
      [backups.length, meta.files.filter((f) => isUserOwned(f))],
      [1, []],
    );
  } finally {
    await s.cleanup();
  }
});

test("利用者のものの一覧が installer と一致する", async () => {
  // 同じ一覧が bash と TypeScript の両方にある。参照できないので、ずれたら落とす。
  const script = await readFile(join(REPO_ROOT, "claude-code", "scripts", "install.sh"), "utf8");
  const line = script
    .split("\n")
    .find((l) => l.includes("override-history.jsonl") && l.includes("persona/aiko-override.md"));
  assert.notEqual(line, undefined, "installer 側の除外一覧が見つからない");
  const fromScript = (line as string)
    .trim()
    .replace(/\)$/, "")
    .split("|")
    .map((s) => s.trim())
    .filter((s) => !s.endsWith("/*"));
  assert.deepEqual([...fromScript].sort(), [...USER_OWNED_PATHS].sort());
});

test("SHA256SUMS から期待値を取れる", () => {
  const sums = "abc123  agent-aiko-v1.0.0.tar.gz\ndef456  other.tar.gz\n";
  assert.equal(expectedDigest(sums, "agent-aiko-v1.0.0.tar.gz"), "abc123");
});

test("SHA256SUMS に無いファイルは期待値を返さない", () => {
  assert.equal(expectedDigest("abc123  other.tar.gz\n", "agent-aiko-v1.0.0.tar.gz"), undefined);
});

// --- CLI 経由（run） ---

import { execFileSync } from "node:child_process";
import { run } from "../src/run.js";

test("aiko update は照合に失敗したら何も入れない", async () => {
  const s = await sandbox();
  try {
    // 壊れた checksum を返す取得口。
    const out: string[] = [];
    const err: string[] = [];
    const code = await run(["update"], "0.0.1", {
      out: (t) => out.push(t),
      err: (t) => err.push(t),
      env: { AIKO_HOME: s.aikoHome },
      fetchReleases: async () => [{ tag: "v1.0.0", prerelease: false, url: "" }],
      fetchBytes: async (url) =>
        new TextEncoder().encode(url.endsWith("SHA256SUMS") ? "0000  agent-aiko-v1.0.0.tar.gz\n" : "壊れた中身"),
      releaseBaseUrl: "https://example.invalid",
    });
    assert.deepEqual(
      [code, err.join("").includes("checksum が一致しません"), await readFile(join(s.aikoHome, "persona", "origin", "persona.md"), "utf8")],
      [1, true, "古い人格\n"],
    );
  } finally {
    await s.cleanup();
  }
});

test("aiko update は照合が通れば入れて、退避を残す", async () => {
  const s = await sandbox();
  try {
    // 本物と同じ形の配布物を作る。
    const stage = join(s.root, "stage", "agent-aiko-v1.0.0", "claude-code", "template", ".claude");
    await mkdir(stage, { recursive: true });
    await cpDir(s.template, join(stage, "aiko"), { recursive: true });
    const tarPath = join(s.root, "agent-aiko-v1.0.0.tar.gz");
    execFileSync("tar", ["-czf", tarPath, "-C", join(s.root, "stage"), "agent-aiko-v1.0.0"]);
    const bytes = await readFile(tarPath);
    const digest = createHash("sha256").update(bytes).digest("hex");

    const out: string[] = [];
    const code = await run(["update"], "0.0.1", {
      out: (t) => out.push(t),
      err: () => {},
      env: { AIKO_HOME: s.aikoHome },
      fetchReleases: async () => [{ tag: "v1.0.0", prerelease: false, url: "" }],
      fetchBytes: async (url) =>
        url.endsWith("SHA256SUMS")
          ? new TextEncoder().encode(`${digest}  agent-aiko-v1.0.0.tar.gz\n`)
          : new Uint8Array(bytes),
      releaseBaseUrl: "https://example.invalid",
    });

    assert.deepEqual(
      [code, await readFile(join(s.aikoHome, "persona", "origin", "persona.md"), "utf8"), await readFile(join(s.aikoHome, "user.md"), "utf8")],
      [0, "新しい人格\n", "呼び名はマサくん\n"],
    );
  } finally {
    await s.cleanup();
  }
});

test("aiko rollback は退避が無ければ失敗する", async () => {
  const s = await sandbox();
  try {
    const err: string[] = [];
    const code = await run(["rollback"], "0.0.1", {
      out: () => {},
      err: (t) => err.push(t),
      env: { AIKO_HOME: s.aikoHome },
    });
    assert.deepEqual([code, err.join("").includes("戻せる版がありません")], [1, true]);
  } finally {
    await s.cleanup();
  }
});
