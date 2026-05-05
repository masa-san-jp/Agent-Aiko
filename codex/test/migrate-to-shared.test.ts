// claude-code/scripts/migrate-to-shared.sh の挙動を検証する integration test。
// codex パッケージ配下で動かすが、対象は claude-code 版の bash script。
// node:test runner から execFile で sandbox 環境を作って呼び出す。

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readlink,
  lstat,
  rm,
  access,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPT_PATH = resolve(
  __dirname,
  "..",
  "..",
  "claude-code",
  "template",
  ".claude",
  "scripts",
  "migrate-to-shared.sh",
);

interface Sandbox {
  root: string;
  source: string; // ${PROJECT}/.claude/aiko
  target: string; // ${HOME_DIR}/.aiko
}

async function createSandbox(): Promise<Sandbox> {
  const root = await mkdtemp(join(tmpdir(), "aiko-mig-"));
  const project = join(root, "project");
  const home = join(root, "home");
  await mkdir(project, { recursive: true });
  await mkdir(home, { recursive: true });
  return {
    root,
    source: join(project, ".claude", "aiko"),
    target: join(home, ".aiko"),
  };
}

async function populateSource(source: string): Promise<void> {
  await mkdir(join(source, "persona"), { recursive: true });
  await mkdir(join(source, "capability", "rules"), { recursive: true });
  await mkdir(join(source, "capability", "skills"), { recursive: true });
  await writeFile(join(source, "mode"), "override\n");
  await writeFile(join(source, "user.md"), "# user\n\nname: tester\n");
  await writeFile(join(source, "persona", "aiko-origin.md"), "# origin\n");
  await writeFile(join(source, "persona", "aiko-override.md"), "# override\n");
  await writeFile(join(source, "persona", "INVARIANTS.md"), "# invariants\n");
  await writeFile(join(source, "capability", "rules", "rules-base.md"), "# rules\n");
}

async function populateTarget(target: string, mark: string): Promise<void> {
  await mkdir(join(target, "persona"), { recursive: true });
  await writeFile(join(target, "mode"), `origin\n# ${mark}\n`);
  await writeFile(join(target, "persona", "aiko-origin.md"), `# origin (${mark})\n`);
  await writeFile(join(target, "persona", "INVARIANTS.md"), `# invariants (${mark})\n`);
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function isSymlink(p: string): Promise<boolean> {
  const st = await lstat(p);
  return st.isSymbolicLink();
}

async function runScript(
  args: readonly string[],
  opts: { source: string; target: string },
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileP("bash", [
      SCRIPT_PATH,
      "--source",
      opts.source,
      "--target",
      opts.target,
      ...args,
    ]);
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      code: typeof e.code === "number" ? e.code : 1,
    };
  }
}

describe("migrate-to-shared.sh — usage", () => {
  test("--help shows usage and exits 0", async () => {
    const { stdout } = await execFileP("bash", [SCRIPT_PATH, "--help"]);
    assert.match(stdout, /Usage:/);
    assert.match(stdout, /--dry-run/);
    assert.match(stdout, /--overwrite/);
  });

  test("unknown option exits 2", async () => {
    const sb = await createSandbox();
    try {
      const r = await runScript(["--bogus"], sb);
      assert.equal(r.code, 2);
      assert.match(r.stderr, /unknown option/);
    } finally {
      await rm(sb.root, { recursive: true, force: true });
    }
  });
});

describe("migrate-to-shared.sh — preconditions", () => {
  test("errors when source does not exist", async () => {
    const sb = await createSandbox();
    try {
      const r = await runScript([], sb);
      assert.equal(r.code, 1);
      assert.match(r.stderr, /source not found/);
    } finally {
      await rm(sb.root, { recursive: true, force: true });
    }
  });

  test("errors when source is missing required files", async () => {
    const sb = await createSandbox();
    try {
      await mkdir(sb.source, { recursive: true });
      // mode / persona/* を置かないので不完全
      const r = await runScript([], sb);
      assert.equal(r.code, 1);
      assert.match(r.stderr, /source is incomplete/);
    } finally {
      await rm(sb.root, { recursive: true, force: true });
    }
  });

  test("errors when source is already a symlink (idempotency guard)", async () => {
    const sb = await createSandbox();
    try {
      const realDir = join(sb.root, "real-aiko");
      await mkdir(realDir, { recursive: true });
      await mkdir(dirname(sb.source), { recursive: true });
      const { symlink } = await import("node:fs/promises");
      await symlink(realDir, sb.source);
      const r = await runScript([], sb);
      assert.equal(r.code, 1);
      assert.match(r.stderr, /already a symlink/);
    } finally {
      await rm(sb.root, { recursive: true, force: true });
    }
  });
});

describe("migrate-to-shared.sh — happy path (no existing target)", () => {
  test("moves source to target, replaces source with symlink, keeps backup", async () => {
    const sb = await createSandbox();
    try {
      await populateSource(sb.source);

      const r = await runScript([], sb);
      assert.equal(r.code, 0, `script failed: ${r.stderr}`);

      // target に内容がコピーされている
      const mode = await readFile(join(sb.target, "mode"), "utf8");
      assert.equal(mode, "override\n");
      const origin = await readFile(join(sb.target, "persona", "aiko-origin.md"), "utf8");
      assert.equal(origin, "# origin\n");

      // source が target への symlink になっている
      assert.equal(await isSymlink(sb.source), true);
      const linkTarget = await readlink(sb.source);
      assert.equal(linkTarget, sb.target);

      // symlink 経由で読める
      const modeViaLink = await readFile(join(sb.source, "mode"), "utf8");
      assert.equal(modeViaLink, "override\n");

      // backup ディレクトリが残っている
      const projectDir = dirname(sb.source);
      const entries = await readdir(projectDir);
      const backups = entries.filter((e) => e.startsWith("aiko.backup-"));
      assert.equal(backups.length, 1, `expected 1 source backup, got ${backups.join(",")}`);
    } finally {
      await rm(sb.root, { recursive: true, force: true });
    }
  });
});

describe("migrate-to-shared.sh — dry-run", () => {
  test("does not modify the filesystem", async () => {
    const sb = await createSandbox();
    try {
      await populateSource(sb.source);

      const r = await runScript(["--dry-run"], sb);
      assert.equal(r.code, 0, `script failed: ${r.stderr}`);
      assert.match(r.stdout, /\[dry-run\]/);

      // source は元のまま、symlink になっていない
      assert.equal(await isSymlink(sb.source), false);
      const mode = await readFile(join(sb.source, "mode"), "utf8");
      assert.equal(mode, "override\n");

      // target は作られない
      assert.equal(await exists(sb.target), false);
    } finally {
      await rm(sb.root, { recursive: true, force: true });
    }
  });
});

describe("migrate-to-shared.sh — conflict handling", () => {
  test("default policy aborts when target exists", async () => {
    const sb = await createSandbox();
    try {
      await populateSource(sb.source);
      await populateTarget(sb.target, "existing");

      const r = await runScript([], sb);
      assert.equal(r.code, 1);
      assert.match(r.stderr, /target already exists/);

      // 既存 target は無傷
      const existingMode = await readFile(join(sb.target, "mode"), "utf8");
      assert.match(existingMode, /existing/);

      // source も無傷
      assert.equal(await isSymlink(sb.source), false);
    } finally {
      await rm(sb.root, { recursive: true, force: true });
    }
  });

  test("--overwrite backs up existing target then migrates", async () => {
    const sb = await createSandbox();
    try {
      await populateSource(sb.source);
      await populateTarget(sb.target, "existing");

      const r = await runScript(["--overwrite"], sb);
      assert.equal(r.code, 0, `script failed: ${r.stderr}`);

      // target が source の内容で置き換わっている
      const mode = await readFile(join(sb.target, "mode"), "utf8");
      assert.equal(mode, "override\n");

      // 旧 target が backup として残っている
      const homeDir = dirname(sb.target);
      const entries = await readdir(homeDir);
      const targetBackups = entries.filter((e) => e.startsWith(".aiko.backup-"));
      assert.equal(targetBackups.length, 1, `expected 1 target backup, got ${targetBackups.join(",")}`);

      // source は symlink
      assert.equal(await isSymlink(sb.source), true);
    } finally {
      await rm(sb.root, { recursive: true, force: true });
    }
  });
});
