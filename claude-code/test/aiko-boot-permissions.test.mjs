// Telegram 常駐が、既定では全権限を外さないこと。
// claude 本体は起動しない。PATH の先頭に記録用の偽物を置き、渡した引数だけを見る。

import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it } from "node:test";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BOOT = join(REPO, "claude-code", "template", ".claude", "scripts", "aiko-boot.sh");

async function runBoot(extraEnv) {
  const root = await mkdtemp(join(tmpdir(), "aiko-boot-"));
  const bin = join(root, "bin");
  const argsFile = join(root, "args");
  await mkdir(bin, { recursive: true });
  await writeFile(
    join(bin, "claude"),
    `#!/bin/sh\nprintf '%s\\n' "$@" > "${argsFile}"\n`,
    "utf8",
  );
  await chmod(join(bin, "claude"), 0o755);

  const child = spawn("sh", [BOOT, "--telegram"], {
    env: {
      ...process.env,
      HOME: root,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      AIKO_PID_FILE: join(root, "aiko.pid"),
      AIKO_LOG_FILE: join(root, "aiko.log"),
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const started = Date.now();
  let args = "";
  while (Date.now() - started < 4000) {
    try {
      args = await readFile(argsFile, "utf8");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  child.kill("SIGTERM");
  await new Promise((r) => child.once("exit", r));
  return { args, root };
}

describe("aiko-boot telegram permissions", () => {
  const dirs = [];
  afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
  });

  it("既定では dangerously-skip-permissions を付けない", async () => {
    const result = await runBoot({});
    dirs.push(result.root);
    assert.match(result.args, /--permission-mode\ndontAsk\n/);
    assert.match(result.args, /--allowedTools\nmcp__plugin_telegram_telegram__reply\n/);
    assert.equal(result.args.includes("dangerously-skip-permissions"), false);
  });

  it("AIKO_TELEGRAM_SKIP_PERMISSIONS=1 のときだけ全許可になる", async () => {
    const result = await runBoot({ AIKO_TELEGRAM_SKIP_PERMISSIONS: "1" });
    dirs.push(result.root);
    assert.match(result.args, /--dangerously-skip-permissions\n/);
    assert.equal(result.args.includes("--permission-mode"), false);
  });
});
