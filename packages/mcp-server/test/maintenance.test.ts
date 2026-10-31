// 実際に配る保守コマンドが、古い導入記録・バックアップから利用者データを守る。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const entry = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "maintenance.js");

async function write(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

test("配布保守コマンドは古いバックアップと導入記録から利用者データを守る", async () => {
  const root = await mkdtemp(join(tmpdir(), "aiko-maintenance-package-"));
  const home = join(root, ".aiko");
  const backup = join(home, "backups", "old-release");
  const owned = ["persona/origin/user.md", "user-proposal.md", "speech-style", "speech-styles/custom.md", "persona/override/custom.md"];
  const run = (...args: string[]) => spawnSync(process.execPath, [entry, ...args], {
    encoding: "utf8", cwd: root,
    env: { ...process.env, HOME: root, USERPROFILE: root, AIKO_HOME: home, AIKO_USER_PROFILE: "" },
  });
  try {
    for (const name of owned) {
      await write(join(home, name), `CURRENT:${name}\n`);
      await write(join(backup, name), `OLDER:${name}\n`);
    }
    await write(join(home, "persona/origin/persona.md"), "CURRENT DISTRIBUTION\n");
    await write(join(backup, "persona/origin/persona.md"), "OLDER DISTRIBUTION\n");
    await write(join(backup, "backup.json"), JSON.stringify({ version: "v0.3.2", createdAt: "2026-01-01T00:00:00Z" }));
    await write(join(home, ".install-manifest"), [...owned, "persona/origin/persona.md", "backups/old-release/persona/origin/user.md"].join("\n") + "\n");

    const result = run("rollback");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(join(home, "persona/origin/persona.md"), "utf8"), "OLDER DISTRIBUTION\n");
    for (const name of owned) assert.equal(await readFile(join(home, name), "utf8"), `CURRENT:${name}\n`);

    const unconfirmed = run("uninstall");
    assert.equal(unconfirmed.status, 2);
    assert.equal(existsSync(join(home, "persona/origin/persona.md")), true);
    const removed = run("uninstall", "--yes");
    assert.equal(removed.status, 0, removed.stderr);
    assert.equal(existsSync(join(home, "persona/origin/persona.md")), false);
    for (const name of owned) assert.equal(await readFile(join(home, name), "utf8"), `CURRENT:${name}\n`);
    // 古いバックアップも削除せず、ユーザーが後から中身を確認できる。
    assert.equal(await readFile(join(backup, owned[0]!), "utf8"), `OLDER:${owned[0]}\n`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("保守コマンドの案内は MCP や別の aiko コマンドと区別できる", () => {
  const result = spawnSync(process.execPath, [entry, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /使い方: aiko-maintenance <コマンド>/);
  const unrelated = spawnSync(process.execPath, [entry, "configure"], { encoding: "utf8" });
  assert.equal(unrelated.status, 2);
});

test("配布保守コマンドは非対話の大きな版の更新を承認なしで適用しない", async () => {
  const root = await mkdtemp(join(tmpdir(), "aiko-maintenance-update-"));
  const home = join(root, ".aiko");
  const preload = join(root, "mock-fetch.mjs");
  try {
    await write(join(home, "version"), "v0.1.0\n");
    await write(join(home, "user.md"), "CURRENT USER\n");
    await write(preload, `globalThis.fetch = async url => {\n  if (!String(url).includes('/releases?')) throw new Error('unexpected download');\n  return new Response(JSON.stringify([{tag_name: 'v0.2.0', prerelease: false, html_url: ''}]));\n};\n`);
    const result = spawnSync(process.execPath, ["--import", pathToFileURL(preload).href, entry, "update"], {
      encoding: "utf8", cwd: root,
      env: { ...process.env, HOME: root, USERPROFILE: root, AIKO_HOME: home, AIKO_USER_PROFILE: "" },
    });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stdout, /v0\.1\.0.*v0\.2\.0/);
    assert.match(result.stderr, /確認が必要/);
    assert.equal(await readFile(join(home, "version"), "utf8"), "v0.1.0\n");
    assert.equal(await readFile(join(home, "user.md"), "utf8"), "CURRENT USER\n");
  } finally { await rm(root, { recursive: true, force: true }); }
});


test("配布保守コマンドはリンク経由の利用者設定の上書きを防ぐ", { skip: process.platform === "win32" }, async () => {
  const root = await mkdtemp(join(tmpdir(), "aiko-maintenance-link-"));
  const home = join(root, ".aiko");
  const backup = join(home, "backups", "old");
  try {
    await write(join(home, "user.md"), "CURRENT USER\n");
    await write(join(backup, "component", "user.md"), "OLD DISTRIBUTION\n");
    await write(join(backup, "backup.json"), JSON.stringify({ version: "v0.3.2", createdAt: "2026-01-01T00:00:00Z" }));
    await symlink(home, join(home, "component"), "dir");
    const result = spawnSync(process.execPath, [entry, "rollback"], {
      encoding: "utf8", cwd: root, env: { ...process.env, HOME: root, USERPROFILE: root, AIKO_HOME: home, AIKO_USER_PROFILE: "" },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /シンボリックリンク/);
    assert.equal(await readFile(join(home, "user.md"), "utf8"), "CURRENT USER\n");
  } finally { await rm(root, { recursive: true, force: true }); }
});
