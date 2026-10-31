// Execute the documented PowerShell workflow against the locally built package.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const packageFile = resolve(process.env.RUNNER_TEMP, "aiko-mcp-0.3.6.tgz");
const readme = await readFile("README.md", "utf8");
const block = readme.split("Windows の PowerShell では次を実行します。", 2)[1];
assert.ok(block, "PowerShell instructions missing");
const script = /```powershell\n([\s\S]*?)\n```/.exec(block)?.[1];
assert.ok(script, "PowerShell block missing");
const replacement = `'${packageFile.replaceAll("'", "''")}'`;
assert.ok(script.includes("aiko-mcp@0.3.6"));
const localScript = script.replace("aiko-mcp@0.3.6", replacement);
const root = await mkdtemp(join(tmpdir(), "aiko-windows-doc-"));
const home = join(root, ".aiko");
const backup = join(home, "backups", "old", "persona", "origin");
try {
  await mkdir(join(home, "persona", "origin"), { recursive: true });
  await mkdir(backup, { recursive: true });
  const user = join(home, "persona", "origin", "user.md");
  await writeFile(user, "CURRENT USER\n");
  await writeFile(join(backup, "user.md"), "OLD USER\n");
  await writeFile(join(home, "backups", "old", "backup.json"), JSON.stringify({
    version: "v0.3.2", createdAt: "2026-01-01T00:00:00Z",
  }));
  const result = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-Command", localScript], {
    cwd: root, encoding: "utf8", timeout: 120_000,
    env: { ...process.env, HOME: root, AIKO_HOME: ".aiko", AIKO_USER_PROFILE: "", TEMP: root, TMP: root },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(await readFile(user, "utf8"), "CURRENT USER\n");
  console.log("Documented PowerShell rollback protects a user setting in a legacy backup.");
} finally {
  await rm(root, { recursive: true, force: true });
}
