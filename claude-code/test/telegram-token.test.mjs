import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const BOOT = fileURLToPath(new URL("../template/.claude/scripts/aiko-boot.sh", import.meta.url));
const ENFORCE = fileURLToPath(
  new URL("../template/.claude/aiko/hooks/enforce-telegram-reply.sh", import.meta.url),
);

test("起動通知はトークンを curl の引数に載せない", () => {
  const root = mkdtempSync(join(tmpdir(), "aiko-tg-token-"));
  const bin = join(root, "bin");
  const argsFile = join(root, "args");
  const stdinFile = join(root, "stdin");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "curl"),
    `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(argsFile)}\ncat > ${JSON.stringify(stdinFile)}\n`,
  );
  spawnSync("chmod", ["+x", join(bin, "curl")]);
  const token = "123456:secret-token";
  const boot = readFileSync(BOOT, "utf8");
  const fn = boot.match(/_telegram_notify\(\) \{[\s\S]*?\n\}/);
  assert.ok(fn, "notify function missing");
  const result = spawnSync(
    "bash",
    ["-c", `${fn[0]}\n_telegram_notify "hello"`],
    {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        AIKO_TELEGRAM_BOT_TOKEN: token,
        AIKO_TELEGRAM_CHAT_ID: "99",
      },
      encoding: "utf8",
    },
  );
  try {
    assert.equal(result.status, 0, result.stderr);
    const args = readFileSync(argsFile, "utf8");
    const stdin = readFileSync(stdinFile, "utf8");
    assert.equal(args.includes(token), false);
    assert.match(stdin, new RegExp(`bot${token}/sendMessage`));
    assert.match(args, /-K/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("返信ガードのスロットルはリンクを辿って書かない", () => {
  const source = readFileSync(ENFORCE, "utf8");
  assert.match(source, /O_NOFOLLOW/);
  assert.match(source, /-K -/);
  assert.equal(source.includes("bot${tok}"), false);
  assert.match(source, /\.aiko\}\/tg-reply-guard\.alert-throttle/);

  const root = mkdtempSync(join(tmpdir(), "aiko-tg-throttle-"));
  const outside = join(root, "outside");
  const link = join(root, "throttle");
  writeFileSync(outside, "keep\n");
  symlinkSync(outside, link);
  const result = spawnSync(
    "python3",
    [
      "-",
      link,
      "1",
    ],
    {
      input: `import errno, os, sys
path, now = sys.argv[1], sys.argv[2]
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
os.write(fd, (now + "\\n").encode())
os.close(fd)
`,
      encoding: "utf8",
    },
  );
  try {
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(outside, "utf8"), "keep\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
