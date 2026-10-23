// peer-inbox の宛先と差出人が、パスや AppleScript にならないこと。

import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "peer-inbox.sh");

function run(root, args, extraEnv = {}) {
  return spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      PEER_INBOX_ROOT: root,
      PEER_NAME: "alice",
      ...extraEnv,
    },
  });
}

describe("peer-inbox names", () => {
  it("普通の宛先には届き、.. や AppleScript は拒否する", async () => {
    const root = await mkdtemp(join(tmpdir(), "peer-inbox-"));
    try {
      const ok = run(root, ["send", "bob", "hello"]);
      assert.equal(ok.status, 0, ok.stderr);
      const inbox = await readFile(join(root, "bob", "inbox.jsonl"), "utf8");
      assert.match(inbox, /hello/);

      const traversal = run(root, ["send", "../bob", "nope"]);
      assert.notEqual(traversal.status, 0);
      assert.equal(existsSync(join(root, "..", "bob", "inbox.jsonl")), false);

      const injected = 'a" & do shell script "touch /tmp/pwned';
      const script = run(root, ["send", "bob", "reply"], { PEER_NAME: injected });
      assert.notEqual(script.status, 0);
      assert.match(script.stderr, /PEER_NAME/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("通知は osascript の文字列へ名前を埋め込まない", async () => {
    const text = await readFile(SCRIPT, "utf8");
    assert.match(text, /on run argv/);
    assert.equal(text.includes('display notification \\"new message from $PEER_NAME\\"'), false);
  });
});
