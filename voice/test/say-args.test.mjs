// say に渡す本文が、オプションとして解釈されないこと。

import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const VOICE = join(dirname(fileURLToPath(import.meta.url)), "..");
const SAY = join(VOICE, "engines", "say.sh");
const STOP = join(VOICE, "hooks", "stop.sh");

async function withFakeSay(run) {
  const root = await mkdtemp(join(tmpdir(), "aiko-say-"));
  const bin = join(root, "bin");
  const argsFile = join(root, "args");
  await import("node:fs/promises").then((fs) => fs.mkdir(bin));
  await writeFile(join(bin, "say"), `#!/bin/sh\nprintf '%s\\n' "$@" > "${argsFile}"\n`, "utf8");
  await chmod(join(bin, "say"), 0o755);
  try {
    await run({ bin, argsFile, root });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("say engine", () => {
  it("本文の前に -- を置き、先頭のダッシュを落とす", async () => {
    await withFakeSay(async ({ bin, argsFile }) => {
      const result = spawnSync("bash", [SAY], {
        input: "-o /tmp/pwned hello",
        encoding: "utf8",
        env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}`, AIKO_VOICE_NAME: "Kyoko", AIKO_VOICE_RATE: "175" },
      });
      assert.equal(result.status, 0, result.stderr);
      const args = (await readFile(argsFile, "utf8")).split("\n");
      const end = args.indexOf("--");
      assert.equal(end > 0, true);
      assert.equal(args.slice(end + 1).join("\n").startsWith("-"), false);
      assert.equal(args.includes("-o"), false);
    });
  });
});

describe("stop hook", () => {
  it("読み上げ本文が - で始まっても say のオプションにしない", async () => {
    await withFakeSay(async ({ bin, argsFile, root }) => {
      const config = join(root, "voice");
      const transcript = join(root, "transcript.jsonl");
      await import("node:fs/promises").then((fs) => fs.mkdir(config));
      await writeFile(join(config, "state"), "on\n");
      await writeFile(join(config, "engine"), "missing-engine\n");
      await writeFile(
        transcript,
        `${JSON.stringify({ role: "assistant", content: "-o /tmp/pwned こんにちは" })}\n`,
      );
      const result = spawnSync("bash", [STOP], {
        input: JSON.stringify({ transcript_path: transcript }),
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? ""}`,
          HOME: root,
          VOICE_CONFIG_DIR: config,
        },
      });
      assert.equal(result.status, 0, result.stderr);
      let raw = "";
      const started = Date.now();
      while (Date.now() - started < 3000) {
        try {
          raw = await readFile(argsFile, "utf8");
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 50));
        }
      }
      const args = raw.split("\n").filter(Boolean);
      const end = args.indexOf("--");
      assert.equal(end >= 0, true, args.join(" "));
      assert.equal(args.slice(end + 1).some((part) => part.startsWith("-o")), false);
    });
  });
});
