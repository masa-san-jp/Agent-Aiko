// aiko-persona-loader の単体テスト。
//
// テストごとに一時的な ~/.aiko/ 相当のフィクスチャを作って loadPersona が
// 期待通りの AikoPersonaSnapshot を返すかを検証する。

import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { loadPersona } from "../src/aiko-persona-loader.js";

interface Fixture {
  root: string;
  cleanup: () => Promise<void>;
}

async function makeFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "aiko-loader-test-"));
  await mkdir(join(root, "persona"), { recursive: true });
  await mkdir(join(root, "capability", "rules"), { recursive: true });
  await mkdir(join(root, "capability", "skills"), { recursive: true });
  return {
    root,
    cleanup: async () => rm(root, { recursive: true, force: true }),
  };
}

async function writeMinimalPersona(root: string): Promise<void> {
  await writeFile(join(root, "persona", "aiko-origin.md"), "# Origin\nOrigin body.\n");
  await writeFile(join(root, "persona", "aiko-override.md"), "# Override\nOverride body.\n");
  await writeFile(join(root, "persona", "INVARIANTS.md"), "# INVARIANTS\nNever lie.\n");
}

describe("loadPersona", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await makeFixture();
    await writeMinimalPersona(fixture.root);
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("defaults mode to origin when mode file is absent", async () => {
    const snap = await loadPersona({ aikoHome: fixture.root });
    assert.equal(snap.mode, "origin");
    assert.match(snap.persona, /Origin body/);
  });

  it("uses override mode when mode file says override", async () => {
    await writeFile(join(fixture.root, "mode"), "override\n");
    const snap = await loadPersona({ aikoHome: fixture.root });
    assert.equal(snap.mode, "override");
    assert.match(snap.persona, /Override body/);
  });

  it("falls back to origin when mode file is empty or invalid", async () => {
    await writeFile(join(fixture.root, "mode"), "");
    const snapEmpty = await loadPersona({ aikoHome: fixture.root });
    assert.equal(snapEmpty.mode, "origin");
    await writeFile(join(fixture.root, "mode"), "garbage\n");
    const snapBad = await loadPersona({ aikoHome: fixture.root });
    assert.equal(snapBad.mode, "origin");
  });

  it("parses user.md name and address fields", async () => {
    await writeFile(
      join(fixture.root, "user.md"),
      "# User\nname: Alice\naddress: アリスさん\n"
    );
    const snap = await loadPersona({ aikoHome: fixture.root });
    assert.equal(snap.user.name, "Alice");
    assert.equal(snap.user.address, "アリスさん");
  });

  it("treats empty address as not set (caller will fall back to name)", async () => {
    await writeFile(join(fixture.root, "user.md"), "name: Bob\naddress:\n");
    const snap = await loadPersona({ aikoHome: fixture.root });
    assert.equal(snap.user.name, "Bob");
    assert.equal(snap.user.address, undefined);
  });

  it("returns empty user when user.md is absent", async () => {
    const snap = await loadPersona({ aikoHome: fixture.root });
    assert.deepEqual(snap.user, {});
  });

  it("loads INVARIANTS into invariants field", async () => {
    const snap = await loadPersona({ aikoHome: fixture.root });
    assert.match(snap.invariants, /Never lie/);
  });

  it("returns empty rulesBase when rules-base.md is absent", async () => {
    const snap = await loadPersona({ aikoHome: fixture.root });
    assert.equal(snap.rulesBase, "");
  });

  it("loads rules-base.md content when present", async () => {
    await writeFile(
      join(fixture.root, "capability", "rules", "rules-base.md"),
      "- always greet\n- be concise\n"
    );
    const snap = await loadPersona({ aikoHome: fixture.root });
    assert.match(snap.rulesBase, /always greet/);
  });

  it("lists capability/skills/ directory names sorted", async () => {
    await mkdir(join(fixture.root, "capability", "skills", "zeta"));
    await mkdir(join(fixture.root, "capability", "skills", "alpha"));
    await mkdir(join(fixture.root, "capability", "skills", "beta"));
    const snap = await loadPersona({ aikoHome: fixture.root });
    assert.deepEqual(snap.capabilitySkills, ["alpha", "beta", "zeta"]);
  });

  it("returns empty capabilitySkills when directory is absent", async () => {
    await rm(join(fixture.root, "capability", "skills"), { recursive: true });
    const snap = await loadPersona({ aikoHome: fixture.root });
    assert.deepEqual(snap.capabilitySkills, []);
  });

  it("throws when persona file for the active mode is missing", async () => {
    await rm(join(fixture.root, "persona", "aiko-origin.md"));
    await assert.rejects(loadPersona({ aikoHome: fixture.root }), /ENOENT/);
  });

  it("throws when INVARIANTS.md is missing", async () => {
    await rm(join(fixture.root, "persona", "INVARIANTS.md"));
    await assert.rejects(loadPersona({ aikoHome: fixture.root }), /ENOENT/);
  });

  it("propagates non-ENOENT errors from optional reads (e.g. EACCES)", async () => {
    // Make user.md unreadable (chmod 000) so readFile returns EACCES.
    // root user は permission を bypass してしまうので、その場合は test を skip。
    const userPath = join(fixture.root, "user.md");
    await writeFile(userPath, "name: x\n");
    const { chmod } = await import("node:fs/promises");
    await chmod(userPath, 0o000);
    try {
      // root では read 可能なため EACCES が出ない。process.getuid===0 ならスキップ。
      const uid = typeof process.getuid === "function" ? process.getuid() : 1000;
      if (uid === 0) {
        return; // root はチェック対象外
      }
      await assert.rejects(loadPersona({ aikoHome: fixture.root }), /EACCES|EPERM/);
    } finally {
      // 後始末で元の mode に戻さないと afterEach の rm が失敗する OS がある
      await chmod(userPath, 0o644);
    }
  });
});
