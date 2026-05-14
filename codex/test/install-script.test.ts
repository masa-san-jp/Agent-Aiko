// install.sh の挙動を node:test で検証する。
// 実機 codex / npm build をスキップ（--skip-build / --skip-auth-check）し、
// サンドボックスの AIKO_HOME / BIN_DIR に対して installer が正しく書き出すかを確認する。

import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, it } from "node:test";

const execFileAsync = promisify(execFile);

// repo root: codex/test/install-script.test.ts → 2 階層上
const REPO_ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..", "..");
const INSTALLER = join(REPO_ROOT, "codex", "scripts", "install.sh");
const PREBUILT_DIST = join(REPO_ROOT, "codex", "dist", "aiko-shell.js");

interface Sandbox {
  root: string;
  aikoHome: string;
  binDir: string;
  /** stub-codex を含む dir。execFile の env.PATH 先頭に置いて実機 codex に依存させない。 */
  stubBin: string;
  cleanup: () => Promise<void>;
}

/** 実機 codex に依存させないためのダミー codex スクリプト。
 *  --version と "login status" を最低限満たす。 */
const STUB_CODEX_SCRIPT = `#!/usr/bin/env bash
case "$1" in
  --version) echo "codex-cli 0.0.0-test"; exit 0 ;;
  login)
    if [ "$2" = "status" ]; then echo "Logged in (stub)"; exit 0; fi
    ;;
esac
echo "stub codex: ignoring args: $*"
exit 0
`;

async function makeSandbox(): Promise<Sandbox> {
  const root = await mkdtemp(join(tmpdir(), "aiko-installer-test-"));
  const stubBin = join(root, "stub-bin");
  await execFileAsync("mkdir", ["-p", stubBin]);
  const stubCodex = join(stubBin, "codex");
  await writeFile(stubCodex, STUB_CODEX_SCRIPT, { mode: 0o755 });
  return {
    root,
    aikoHome: join(root, ".aiko"),
    binDir: join(root, "bin"),
    stubBin,
    cleanup: async () => rm(root, { recursive: true, force: true }),
  };
}

async function runInstaller(
  sb: Sandbox,
  ...extraArgs: string[]
): Promise<{ stdout: string; stderr: string }> {
  const args = [
    INSTALLER,
    "--skip-build",
    "--skip-auth-check",
    "--aiko-home",
    sb.aikoHome,
    "--bin-dir",
    sb.binDir,
    ...extraArgs,
  ];
  // PATH 先頭に stub-bin を置き、実機 codex に依存させない
  const env = { ...process.env, PATH: `${sb.stubBin}:${process.env["PATH"] ?? ""}` };
  return execFileAsync("bash", args, { env });
}

describe("codex/scripts/install.sh", () => {
  let sandbox: Sandbox;

  beforeEach(async () => {
    sandbox = await makeSandbox();
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  it("smoke: dist/ がビルド済みであれば installer から参照できる", () => {
    // 他のテストの前提：dist/aiko-shell.js が存在すること（npm run build 後）
    assert.equal(existsSync(PREBUILT_DIST), true, "run `npm run build` before this test suite");
  });

  it("creates ~/.aiko/ with all required files on first install", async () => {
    await runInstaller(sandbox);
    const expected = [
      "mode",
      "user.md",
      "persona/aiko-origin.md",
      "persona/aiko-override.md",
      "persona/INVARIANTS.md",
      "capability/rules/rules-base.md",
    ];
    for (const rel of expected) {
      const p = join(sandbox.aikoHome, rel);
      assert.equal(existsSync(p), true, `missing: ${rel}`);
    }
    // mode 既定は origin
    const mode = (await readFile(join(sandbox.aikoHome, "mode"), "utf8")).trim();
    assert.equal(mode, "origin");
    // override.md は origin.md と同一内容（初回は origin からコピー）
    const origin = await readFile(join(sandbox.aikoHome, "persona/aiko-origin.md"), "utf8");
    const override = await readFile(join(sandbox.aikoHome, "persona/aiko-override.md"), "utf8");
    assert.equal(override, origin);
  });

  it("creates an executable aiko shim that exec's node with the dist path", async () => {
    await runInstaller(sandbox);
    const shimPath = join(sandbox.binDir, "aiko");
    assert.equal(existsSync(shimPath), true, "shim not created");
    const shim = await readFile(shimPath, "utf8");
    assert.match(shim, /^#!\/usr\/bin\/env bash/);
    assert.match(shim, /exec node /);
    assert.match(shim, /aiko-shell\.js/);
    // 実行ビット判定は ls 出力パースに依存しない fs.stat ベース
    const st = await stat(shimPath);
    assert.equal(
      (st.mode & 0o111) !== 0,
      true,
      `shim is not executable: mode=0o${(st.mode & 0o777).toString(8)}`
    );
  });

  it("preserves user data on second install (mode / user.md / aiko-override.md / rules-base.md)", async () => {
    await runInstaller(sandbox);
    // ユーザーデータをカスタマイズ
    await writeFile(join(sandbox.aikoHome, "mode"), "override\n");
    await writeFile(join(sandbox.aikoHome, "user.md"), "name: （ユーザー名）\n");
    await writeFile(
      join(sandbox.aikoHome, "persona/aiko-override.md"),
      "# Custom\nmy custom body\n"
    );
    await writeFile(
      join(sandbox.aikoHome, "capability/rules/rules-base.md"),
      "- test rule\n"
    );

    await runInstaller(sandbox);

    assert.equal((await readFile(join(sandbox.aikoHome, "mode"), "utf8")).trim(), "override");
    assert.match(await readFile(join(sandbox.aikoHome, "user.md"), "utf8"), /（ユーザー名）/);
    assert.match(
      await readFile(join(sandbox.aikoHome, "persona/aiko-override.md"), "utf8"),
      /my custom body/
    );
    assert.match(
      await readFile(join(sandbox.aikoHome, "capability/rules/rules-base.md"), "utf8"),
      /test rule/
    );
  });

  it("re-applies invariant files on second install (origin/INVARIANTS overwritten)", async () => {
    await runInstaller(sandbox);
    // 一時的に書込権限を上げてから上書き（インストーラは 444 を解除して上書きする想定）
    const originPath = join(sandbox.aikoHome, "persona/aiko-origin.md");
    await chmod(originPath, 0o644);
    await writeFile(originPath, "tampered content");

    await runInstaller(sandbox);

    const restored = await readFile(originPath, "utf8");
    assert.notEqual(restored, "tampered content", "aiko-origin.md should be restored from template");
  });

  it("works with stub codex (PATH override) — no real codex CLI required", async () => {
    // stub-bin にダミー codex を置いた状態で installer が PATH 経由で動くことを確認。
    // skip-auth-check を外して codex login status の grep ロジックも動かす。
    const env = {
      ...process.env,
      PATH: `${sandbox.stubBin}:${process.env["PATH"] ?? ""}`,
    };
    await execFileAsync(
      "bash",
      [
        INSTALLER,
        "--skip-build",
        "--aiko-home",
        sandbox.aikoHome,
        "--bin-dir",
        sandbox.binDir,
      ],
      { env }
    );
    assert.equal(existsSync(join(sandbox.aikoHome, "mode")), true);
    assert.equal(existsSync(join(sandbox.binDir, "aiko")), true);
  });
});
