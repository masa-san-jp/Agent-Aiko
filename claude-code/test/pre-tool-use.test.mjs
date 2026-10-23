import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = fileURLToPath(
  new URL("../template/.claude/aiko/hooks/pre-tool-use.sh", import.meta.url),
);

function run(cwd, aikoHome, filePath) {
  return spawnSync("bash", [HOOK], {
    cwd,
    env: { ...process.env, AIKO_HOME: aikoHome, HOME: aikoHome },
    input: JSON.stringify({
      tool_name: "Write",
      tool_input: { file_path: filePath },
    }),
    encoding: "utf8",
  });
}

test("共有ストアへのリンクと .. は origin と不変条項を拒否し、overrides は通す", () => {
  const root = mkdtempSync(join(tmpdir(), "aiko-pre-tool-"));
  const home = join(root, "home");
  const aiko = join(home, ".aiko");
  const project = join(root, "project");
  mkdirSync(join(aiko, "persona", "origin"), { recursive: true });
  mkdirSync(join(aiko, "persona", "overrides", "trial"), { recursive: true });
  writeFileSync(join(aiko, "INVARIANTS.md"), "守る\n");
  writeFileSync(join(aiko, "persona", "origin", "persona.md"), "origin\n");
  writeFileSync(join(aiko, "persona", "aiko-origin.md"), "origin\n");
  writeFileSync(join(aiko, "persona", "overrides", "trial", "persona.md"), "trial\n");
  mkdirSync(join(project, ".claude", "aiko"), { recursive: true });
  symlinkSync(aiko, join(project, ".claude", "aiko", "persona"));

  try {
    const linked = run(project, aiko, "./.claude/aiko/persona/INVARIANTS.md");
    assert.equal(linked.status, 2, linked.stderr);

    const dotted = run(project, aiko, `${aiko}/persona/origin/../origin/persona.md`);
    assert.equal(dotted.status, 2, dotted.stderr);

    const override = run(project, aiko, join(aiko, "persona", "overrides", "trial", "persona.md"));
    assert.equal(override.status, 0, override.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
