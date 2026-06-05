import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, it } from "node:test";

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..", "..");
const INSTALLER = join(REPO_ROOT, "antigravity", "scripts", "install.sh");

describe("antigravity/scripts/install.sh", () => {
  let root;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "aiko-antigravity-installer-test-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("rejects dangerous AIKO_HOME values before touching the filesystem", async () => {
    await assert.rejects(
      execFileAsync("bash", [
        INSTALLER,
        "--skip-gemini-check",
        "--aiko-home",
        root,
        "--bin-dir",
        join(root, "bin"),
      ], {
        env: {
          ...process.env,
          HOME: root,
        },
      }),
      /AIKO_HOME/
    );
  });
});
