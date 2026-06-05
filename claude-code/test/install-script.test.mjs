import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, it } from "node:test";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const INSTALLER = join(REPO_ROOT, "claude-code", "scripts", "install.sh");

async function makeSandbox() {
  const root = await mkdtemp(join(tmpdir(), "aiko-claude-installer-test-"));
  return {
    root,
    cleanup: async () => rm(root, { recursive: true, force: true }),
  };
}

function runInstaller({ cwd, home, input = "" }) {
  return execFileSync("bash", [INSTALLER, "--yes"], {
    cwd,
    env: { ...process.env, HOME: home },
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

describe("claude-code/scripts/install.sh", () => {
  let sandbox;

  beforeEach(async () => {
    sandbox = await makeSandbox();
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  it("refuses to install into $HOME/.claude", async () => {
    assert.throws(
      () => runInstaller({ cwd: sandbox.root, home: sandbox.root }),
      (error) => {
        assert.equal(error.status, 1);
        assert.match(error.stdout ?? "", /ホームディレクトリ直下にはインストールできません/);
        assert.equal(existsSync(join(sandbox.root, ".claude")), false);
        return true;
      }
    );
  });

  it("preserves existing settings.json and CLAUDE.md", async () => {
    const projectDir = join(sandbox.root, "project");
    await mkdir(join(projectDir, ".claude"), { recursive: true });

    const customSettings = '{ "hooks": [], "custom": true }\n';
    const customClaude = "# Existing project guidance\n";
    await writeFile(join(projectDir, ".claude", "settings.json"), customSettings);
    await writeFile(join(projectDir, ".claude", "CLAUDE.md"), customClaude);

    runInstaller({ cwd: projectDir, home: sandbox.root });

    assert.equal(
      await readFile(join(projectDir, ".claude", "settings.json"), "utf8"),
      customSettings
    );
    assert.equal(await readFile(join(projectDir, ".claude", "CLAUDE.md"), "utf8"), customClaude);
    assert.equal(existsSync(join(sandbox.root, ".aiko", "mode")), true);
    assert.equal(existsSync(join(projectDir, ".claude", "skills", "aiko", "SKILL.md")), true);
    assert.equal(lstatSync(join(projectDir, ".claude", "aiko", "hooks")).isSymbolicLink(), true);
  });

  it("creates CLAUDE.md and settings.json when they are absent", async () => {
    const projectDir = join(sandbox.root, "project");
    await mkdir(projectDir, { recursive: true });

    runInstaller({ cwd: projectDir, home: sandbox.root });

    assert.equal(existsSync(join(projectDir, ".claude", "CLAUDE.md")), true);
    assert.equal(existsSync(join(projectDir, ".claude", "settings.json")), true);
    assert.equal(lstatSync(join(projectDir, ".claude", "aiko", "hooks")).isSymbolicLink(), true);
  });

  it("backs up project template path type mismatches instead of aborting", async () => {
    const projectDir = join(sandbox.root, "project");
    await mkdir(join(projectDir, ".claude", "skills"), { recursive: true });
    await mkdir(join(projectDir, ".claude", "session-state", "current.md.example"), {
      recursive: true,
    });
    await writeFile(join(projectDir, ".claude", "skills", "aiko"), "old file\n");
    await writeFile(
      join(projectDir, ".claude", "session-state", "current.md.example", "file"),
      "old directory content\n"
    );

    runInstaller({ cwd: projectDir, home: sandbox.root });

    assert.equal(existsSync(join(projectDir, ".claude", "skills", "aiko", "SKILL.md")), true);
    assert.equal(existsSync(join(projectDir, ".claude", "session-state", "current.md.example")), true);

    const skillEntries = await readdir(join(projectDir, ".claude", "skills"));
    assert.equal(skillEntries.some((name) => /^aiko\.bak\./.test(name)), true);

    const sessionEntries = await readdir(join(projectDir, ".claude", "session-state"));
    assert.equal(
      sessionEntries.some((name) => /^current\.md\.example\.bak\./.test(name)),
      true
    );
  });

  it("migrates mutable legacy .claude/aiko data into ~/.aiko", async () => {
    const projectDir = join(sandbox.root, "project");
    await mkdir(join(projectDir, ".claude", "aiko", "persona"), { recursive: true });
    await mkdir(join(projectDir, ".claude", "aiko", "capability", "rules"), { recursive: true });
    await writeFile(join(projectDir, ".claude", "aiko", "mode"), "override\n");
    await writeFile(
      join(projectDir, ".claude", "aiko", "persona", "aiko-override.md"),
      "# Custom\nlegacy override\n"
    );
    await writeFile(
      join(projectDir, ".claude", "aiko", "capability", "rules", "rules-base.md"),
      "- legacy rule\n"
    );

    runInstaller({ cwd: projectDir, home: sandbox.root });

    assert.equal((await readFile(join(sandbox.root, ".aiko", "mode"), "utf8")).trim(), "override");
    assert.match(
      await readFile(join(sandbox.root, ".aiko", "persona", "aiko-override.md"), "utf8"),
      /legacy override/
    );
    assert.match(
      await readFile(join(sandbox.root, ".aiko", "capability", "rules", "rules-base.md"), "utf8"),
      /legacy rule/
    );
  });
});
