import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, statSync, symlinkSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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

function runInstaller({ cwd, home, input = "", installer = INSTALLER }) {
  return execFileSync("bash", [installer, "--yes"], {
    cwd,
    env: { ...process.env, HOME: home, AIKO_HOME: join(home, ".aiko") },
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

  it("applies the file modes §11.3 specifies", async () => {
    // 仕様に書いてあっても設定していなければ意味が無い。実測で 0775 だった
    // （2026-07-31）。ここは実際のモードを見る。
    const project = join(sandbox.root, "project");
    await mkdir(project, { recursive: true });
    runInstaller({ cwd: project, home: sandbox.root });

    const aikoHome = join(sandbox.root, ".aiko");
    assert.equal(statSync(aikoHome).mode & 0o777, 0o700, "~/.aiko must not be readable by others");

    const userMd = join(aikoHome, "user.md");
    if (existsSync(userMd)) {
      assert.equal(statSync(userMd).mode & 0o777, 0o600, "user.md must not be readable by others");
    }
  });

  it("preserves the origin user settings across reinstall", async () => {
    const project = join(sandbox.root, "project");
    await mkdir(project, { recursive: true });
    runInstaller({ cwd: project, home: sandbox.root });
    const path = join(sandbox.root, ".aiko", "persona", "origin", "user.md");
    await writeFile(path, "address: FIXTURE_LOCAL_NAME\n");
    const manifest = join(sandbox.root, ".aiko", ".install-manifest");
    await writeFile(manifest, `${await readFile(manifest, "utf8")}persona/origin/user.md\n`);
    runInstaller({ cwd: project, home: sandbox.root });
    assert.equal(await readFile(path, "utf8"), "address: FIXTURE_LOCAL_NAME\n");
    assert.equal((await readFile(manifest, "utf8")).split("\n").includes("persona/origin/user.md"), false);
  });

  it("initializes and preserves origin settings when a release omits the seed", async () => {
    const release = join(sandbox.root, "release", "claude-code");
    const scripts = join(release, "scripts");
    const template = join(release, "template");
    await mkdir(scripts, { recursive: true });
    await cp(INSTALLER, join(scripts, "install.sh"));
    await cp(join(REPO_ROOT, "claude-code", "template"), template, { recursive: true });
    await rm(join(template, ".claude", "aiko", "persona", "origin", "user.md"), { force: true });

    const project = join(sandbox.root, "project");
    await mkdir(project, { recursive: true });
    const installer = join(scripts, "install.sh");
    const path = join(sandbox.root, ".aiko", "persona", "origin", "user.md");
    runInstaller({ cwd: project, home: sandbox.root, installer });
    assert.equal(await readFile(path, "utf8"), "name:\naddress:\n");
    assert.equal(statSync(path).mode & 0o777, 0o600);

    await writeFile(path, "address: FIXTURE_LOCAL_NAME\n");
    runInstaller({ cwd: project, home: sandbox.root, installer });
    assert.equal(await readFile(path, "utf8"), "address: FIXTURE_LOCAL_NAME\n");
  });

  it("does not create origin user settings through a dangling symlink", async () => {
    const project = join(sandbox.root, "project");
    await mkdir(project, { recursive: true });
    runInstaller({ cwd: project, home: sandbox.root });
    const path = join(sandbox.root, ".aiko", "persona", "origin", "user.md");
    const outside = join(sandbox.root, "outside-user.md");
    await rm(path);
    symlinkSync(outside, path);
    runInstaller({ cwd: project, home: sandbox.root });
    assert.equal(lstatSync(path).isSymbolicLink(), true);
    assert.equal(existsSync(outside), false);
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
    assert.equal(lstatSync(join(projectDir, ".claude", "aiko")).isSymbolicLink(), true);
  });

  it("creates CLAUDE.md and settings.json when they are absent", async () => {
    const projectDir = join(sandbox.root, "project");
    await mkdir(projectDir, { recursive: true });

    runInstaller({ cwd: projectDir, home: sandbox.root });

    assert.equal(existsSync(join(projectDir, ".claude", "CLAUDE.md")), true);
    assert.equal(existsSync(join(projectDir, ".claude", "settings.json")), true);
    assert.equal(lstatSync(join(projectDir, ".claude", "aiko")).isSymbolicLink(), true);
  });

  it("leaves CLAUDE.md able to read the persona it names", async () => {
    // CLAUDE.md は起動手順として `.claude/aiko/...` を読めと書いている。人格の実体は
    // `~/.aiko` にあるので、リンクが無いと**人格を1つも読めないまま起動する**。
    // 入れた直後にそうなっていた（2026-08-02 実測）。読める側から確かめる。
    const projectDir = join(sandbox.root, "project");
    await mkdir(projectDir, { recursive: true });

    runInstaller({ cwd: projectDir, home: sandbox.root });

    const named = [
      "mode",
      "persona/origin/persona.md",
      "persona/INVARIANTS.md",
      "capability/rules",
    ];
    const missing = named.filter(
      (rel) => !existsSync(join(projectDir, ".claude", "aiko", ...rel.split("/")))
    );
    assert.deepEqual(missing, []);
  });

  it("refuses to install into $HOME even when $HOME is reached through a symlink", async () => {
    // macOS の $TMPDIR がまさにこの形（/var/folders → /private/var/folders）。
    // 文字列のまま比べていたので素通りしていた。CI に macOS を足して判明。
    const real = join(sandbox.root, "real-home");
    const link = join(sandbox.root, "linked-home");
    await mkdir(real, { recursive: true });
    symlinkSync(real, link);

    assert.throws(
      () => runInstaller({ cwd: link, home: link }),
      (error) => {
        assert.match(error.stdout ?? "", /ホームディレクトリ直下にはインストールできません/);
        return true;
      }
    );
    assert.equal(existsSync(join(real, ".claude")), false);
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

  it("does not import project .claude/aiko into the shared store", async () => {
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

    const out = runInstaller({ cwd: projectDir, home: sandbox.root });

    assert.match(out, /取り込みません/);
    assert.equal((await readFile(join(sandbox.root, ".aiko", "mode"), "utf8")).trim(), "origin");
    assert.equal(
      (await readFile(join(sandbox.root, ".aiko", "persona", "aiko-override.md"), "utf8")).includes(
        "legacy override",
      ),
      false,
    );
    const rules = await readFile(
      join(sandbox.root, ".aiko", "capability", "rules", "rules-base.md"),
      "utf8",
    );
    assert.equal(rules.includes("legacy rule"), false);

    const entries = await readdir(join(projectDir, ".claude"));
    const backup = entries.find((name) => /^aiko\.bak\./.test(name));
    assert.equal(typeof backup, "string");
    assert.match(
      await readFile(join(projectDir, ".claude", String(backup), "persona", "aiko-override.md"), "utf8"),
      /legacy override/,
    );
  });

  it("moves a destination symlink aside instead of overwriting its target", async () => {
    const projectDir = join(sandbox.root, "project");
    const outside = join(sandbox.root, "outside.txt");
    await mkdir(join(projectDir, ".claude", "scripts"), { recursive: true });
    await writeFile(outside, "keep-me\n");
    symlinkSync(outside, join(projectDir, ".claude", "scripts", "aiko-boot.sh"));

    runInstaller({ cwd: projectDir, home: sandbox.root });

    assert.equal(await readFile(outside, "utf8"), "keep-me\n");
    const installed = lstatSync(join(projectDir, ".claude", "scripts", "aiko-boot.sh"));
    assert.equal(installed.isSymbolicLink(), false);
    assert.match(
      await readFile(join(projectDir, ".claude", "scripts", "aiko-boot.sh"), "utf8"),
      /aiko-boot/,
    );
  });

  it("aborts when a parent of a destination is a symlink", async () => {
    const projectDir = join(sandbox.root, "project");
    const outside = join(sandbox.root, "outside-scripts");
    await mkdir(join(projectDir, ".claude"), { recursive: true });
    await mkdir(outside, { recursive: true });
    symlinkSync(outside, join(projectDir, ".claude", "scripts"));

    assert.throws(() => runInstaller({ cwd: projectDir, home: sandbox.root }), /シンボリックリンク/);
    assert.equal(existsSync(join(outside, "aiko-boot.sh")), false);
  });
});
