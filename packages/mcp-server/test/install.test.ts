// `aiko-mcp install` の振る舞い。
//
// ここは**利用者がすでに持っている設定ファイルを書き換える**唯一の場所なので、
// 「入っていないものには触らない」「壊れていたら触らない」「触る前に控えを取る」
// を検査で押さえる。実行系（claude / codex / code）は差し替えて、呼んだ引数だけを見る。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInstall, type InstallDeps } from "../src/install.js";

interface Harness {
  deps: InstallDeps;
  out: () => string;
  err: () => string;
  calls: Array<{ command: string; args: readonly string[] }>;
}

function harness(
  home: string,
  options: { onPath?: readonly string[]; exitCode?: number; stderr?: string } = {},
): Harness {
  const onPath = new Set(options.onPath ?? []);
  const calls: Array<{ command: string; args: readonly string[] }> = [];
  let out = "";
  let err = "";
  return {
    calls,
    out: () => out,
    err: () => err,
    deps: {
      home,
      platform: "linux",
      env: {},
      lookPath: (command) => Promise.resolve(onPath.has(command)),
      run: (command, args) => {
        calls.push({ command, args });
        return Promise.resolve({ code: options.exitCode ?? 0, stderr: options.stderr ?? "" });
      },
      now: () => new Date("2026-08-03T00:00:00Z"),
      io: {
        out: (text) => {
          out += text;
        },
        err: (text) => {
          err += text;
        },
      },
    },
  };
}

async function fakeHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), "aiko-install-"));
}

/** Cursor が入っている状態を作る（設定の置き場があること＝入っている、と見なす）。 */
async function withCursor(home: string, config?: unknown): Promise<string> {
  await mkdir(join(home, ".cursor"), { recursive: true });
  const path = join(home, ".cursor", "mcp.json");
  if (config !== undefined) {
    await writeFile(path, typeof config === "string" ? config : JSON.stringify(config, null, 2));
  }
  return path;
}

test("PATH にあるクライアントにだけ設定を書く", async () => {
  const home = await fakeHome();
  const h = harness(home, { onPath: ["claude"] });

  const code = await runInstall([], h.deps);

  assert.equal(code, 0);
  assert.deepEqual(h.calls, [
    { command: "claude", args: ["mcp", "add", "aiko", "-s", "user", "--", "npx", "-y", "aiko-mcp"] },
  ]);
  // 入っていない codex / VS Code には触らない。
  assert.equal(h.out().includes("Codex"), false);
});

test("入っていないクライアントの設定ファイルは作らない", async () => {
  const home = await fakeHome();
  const h = harness(home, { onPath: ["claude"] });

  await runInstall([], h.deps);

  assert.deepEqual(await readdir(home), []);
});

test("Cursor の設定に、既にあるサーバーを残したまま足す", async () => {
  const home = await fakeHome();
  const path = await withCursor(home, { mcpServers: { other: { command: "other-server" } } });
  const h = harness(home);

  const code = await runInstall([], h.deps);

  assert.equal(code, 0);
  const written = JSON.parse(await readFile(path, "utf8")) as {
    mcpServers: Record<string, unknown>;
  };
  assert.deepEqual(Object.keys(written.mcpServers).sort(), ["aiko", "other"]);
  assert.deepEqual(written.mcpServers["aiko"], { command: "npx", args: ["-y", "aiko-mcp"] });
  assert.deepEqual(written.mcpServers["other"], { command: "other-server" });
});

test("設定ファイルがまだ無いクライアントにも、置き場があれば書く", async () => {
  const home = await fakeHome();
  const path = await withCursor(home);
  const h = harness(home);

  await runInstall([], h.deps);

  const written = JSON.parse(await readFile(path, "utf8")) as { mcpServers: Record<string, unknown> };
  assert.deepEqual(written.mcpServers["aiko"], { command: "npx", args: ["-y", "aiko-mcp"] });
});

test("書き換える前に控えを取る", async () => {
  const home = await fakeHome();
  await withCursor(home, { mcpServers: { other: { command: "other-server" } } });
  const h = harness(home);

  await runInstall([], h.deps);

  const backups = (await readdir(join(home, ".cursor"))).filter((f) => f.includes("bak"));
  assert.equal(backups.length, 1);
  const saved = JSON.parse(await readFile(join(home, ".cursor", String(backups[0])), "utf8")) as {
    mcpServers: Record<string, unknown>;
  };
  assert.deepEqual(Object.keys(saved.mcpServers), ["other"]);
});

test("すでに同じ内容が入っていれば書き換えない", async () => {
  const home = await fakeHome();
  const path = await withCursor(home, {
    mcpServers: { aiko: { command: "npx", args: ["-y", "aiko-mcp"] } },
  });
  const before = await readFile(path, "utf8");
  const h = harness(home);

  const code = await runInstall([], h.deps);

  assert.equal(code, 0);
  assert.equal(await readFile(path, "utf8"), before);
  assert.equal((await readdir(join(home, ".cursor"))).length, 1); // 控えも作らない
  assert.match(h.out(), /すでに/);
});

test("同じ名前で違う設定が入っていたら、勝手に上書きしない", async () => {
  const home = await fakeHome();
  const path = await withCursor(home, {
    mcpServers: { aiko: { command: "node", args: ["/自分で建てたやつ.js"] } },
  });
  const before = await readFile(path, "utf8");
  const h = harness(home);

  const code = await runInstall([], h.deps);

  assert.equal(await readFile(path, "utf8"), before);
  assert.equal(code, 1);
  assert.match(h.err(), /--force/);
});

test("--force なら違う設定でも置き換える", async () => {
  const home = await fakeHome();
  const path = await withCursor(home, {
    mcpServers: { aiko: { command: "node", args: ["/自分で建てたやつ.js"] } },
  });
  const h = harness(home);

  const code = await runInstall(["--force"], h.deps);

  assert.equal(code, 0);
  const written = JSON.parse(await readFile(path, "utf8")) as { mcpServers: Record<string, unknown> };
  assert.deepEqual(written.mcpServers["aiko"], { command: "npx", args: ["-y", "aiko-mcp"] });
});

test("読めない設定ファイルには触らない", async () => {
  const home = await fakeHome();
  const path = await withCursor(home, "{ これは JSON ではない");
  const h = harness(home);

  const code = await runInstall([], h.deps);

  assert.equal(code, 1);
  assert.equal(await readFile(path, "utf8"), "{ これは JSON ではない");
  assert.equal((await readdir(join(home, ".cursor"))).length, 1); // 控えも作らない
});

test("--dry-run は何も実行せず、何も書かない", async () => {
  const home = await fakeHome();
  const path = await withCursor(home, { mcpServers: {} });
  const before = await readFile(path, "utf8");
  const h = harness(home, { onPath: ["claude", "codex"] });

  const code = await runInstall(["--dry-run"], h.deps);

  assert.equal(code, 0);
  assert.deepEqual(h.calls, []);
  assert.equal(await readFile(path, "utf8"), before);
  assert.match(h.out(), /claude/);
});

test("--client で対象を絞れる", async () => {
  const home = await fakeHome();
  await withCursor(home, { mcpServers: {} });
  const h = harness(home, { onPath: ["claude", "codex"] });

  const code = await runInstall(["--client", "codex"], h.deps);

  assert.equal(code, 0);
  assert.deepEqual(
    h.calls.map((c) => c.command),
    ["codex"],
  );
});

test("知らない --client は使い方の間違いとして返す", async () => {
  const home = await fakeHome();
  const h = harness(home, { onPath: ["claude"] });

  const code = await runInstall(["--client", "emacs"], h.deps);

  assert.equal(code, 2);
  assert.deepEqual(h.calls, []);
  assert.match(h.err(), /emacs/);
});

test("入っているクライアントが1つも無ければ、手で入れる方法を出す", async () => {
  const home = await fakeHome();
  const h = harness(home);

  const code = await runInstall([], h.deps);

  assert.equal(code, 1);
  assert.match(h.err(), /npx -y aiko-mcp/);
});

test("クライアントのコマンドが失敗したら、その言い分をそのまま出す", async () => {
  const home = await fakeHome();
  const h = harness(home, {
    onPath: ["claude"],
    exitCode: 1,
    stderr: "MCP server aiko already exists",
  });

  const code = await runInstall([], h.deps);

  assert.equal(code, 1);
  assert.match(h.err(), /already exists/);
});

test("--help は使い方を出して終わる", async () => {
  const home = await fakeHome();
  const h = harness(home, { onPath: ["claude"] });

  const code = await runInstall(["--help"], h.deps);

  assert.equal(code, 0);
  assert.deepEqual(h.calls, []);
  assert.match(h.out(), /--dry-run/);
});
