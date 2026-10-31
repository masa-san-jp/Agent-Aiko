// `aiko uninstall`。MCP 設計書 §4.4。
//
// 見るのは1つ——**利用者のものを消さないこと**。
// 消す道具の失敗は元に戻せないので、迷ったら消さない側に倒れているかを見る。

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { MANIFEST_NAME, planUninstall, uninstall } from "../src/uninstall.js";
import { run } from "../src/run.js";

async function write(path: string, text: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

/** installer が置いた状態を再現する。manifest には配布物のものだけが載る。 */
async function installed() {
  const root = await mkdtemp(join(tmpdir(), "aiko-uninstall-"));
  const aikoHome = join(root, ".aiko");

  await write(join(aikoHome, "persona", "origin", "persona.md"), "配布の人格\n");
  await write(join(aikoHome, "capability", "rules", "model-routing.md"), "配布の規則\n");
  await write(join(aikoHome, "hooks", "stop.sh"), "#!/bin/sh\n");

  // 利用者のもの
  await write(join(aikoHome, "user.md"), "呼び名は利用者さん\n");
  await write(join(aikoHome, "persona", "aiko-override.md"), "自分で書いた人格\n");
  await write(join(aikoHome, "capability", "rules", "rules-base.md"), "自分で書いた規則\n");
  // manifest に無い、後から置いたもの
  await write(join(aikoHome, "notes", "memo.md"), "あとで置いたメモ\n");

  await write(
    join(aikoHome, MANIFEST_NAME),
    ["persona/origin/persona.md", "capability/rules/model-routing.md", "hooks/stop.sh"].join("\n"),
  );

  return { root, aikoHome, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test("導入時に置いたものは消える", async () => {
  const s = await installed();
  try {
    await uninstall(s.aikoHome);
    assert.equal(existsSync(join(s.aikoHome, "persona", "origin", "persona.md")), false);
  } finally {
    await s.cleanup();
  }
});

test("呼び名は消えない", async () => {
  const s = await installed();
  try {
    await uninstall(s.aikoHome);
    assert.equal(await readFile(join(s.aikoHome, "user.md"), "utf8"), "呼び名は利用者さん\n");
  } finally {
    await s.cleanup();
  }
});

test("自分で書いた人格と規則は消えない", async () => {
  const s = await installed();
  try {
    await uninstall(s.aikoHome);
    assert.deepEqual(
      [
        await readFile(join(s.aikoHome, "persona", "aiko-override.md"), "utf8"),
        await readFile(join(s.aikoHome, "capability", "rules", "rules-base.md"), "utf8"),
      ],
      ["自分で書いた人格\n", "自分で書いた規則\n"],
    );
  } finally {
    await s.cleanup();
  }
});

test("あとから置いたファイルは消えない", async () => {
  // manifest に無いものは、配布物のものではない。
  const s = await installed();
  try {
    await uninstall(s.aikoHome);
    assert.equal(await readFile(join(s.aikoHome, "notes", "memo.md"), "utf8"), "あとで置いたメモ\n");
  } finally {
    await s.cleanup();
  }
});

test("導入時の記録が無ければ何も消さない", async () => {
  const s = await installed();
  try {
    await rm(join(s.aikoHome, MANIFEST_NAME));
    const result = await uninstall(s.aikoHome);
    assert.deepEqual(
      [result.removed.length, existsSync(join(s.aikoHome, "persona", "origin", "persona.md"))],
      [0, true],
    );
  } finally {
    await s.cleanup();
  }
});

test("残したものを一覧で返す", async () => {
  const s = await installed();
  try {
    const result = await uninstall(s.aikoHome);
    assert.equal(result.kept.includes("user.md"), true);
  } finally {
    await s.cleanup();
  }
});

test("空になったディレクトリだけ畳む", async () => {
  const s = await installed();
  try {
    await uninstall(s.aikoHome);
    assert.deepEqual(
      [
        existsSync(join(s.aikoHome, "hooks")),
        existsSync(join(s.aikoHome, "capability", "rules")),
      ],
      // hooks は空になったので消える。rules は rules-base.md が残るので残る。
      [false, true],
    );
  } finally {
    await s.cleanup();
  }
});

// --- CLI 経由 ---

test("確認できない環境で --yes 無しなら消さない", async () => {
  const s = await installed();
  try {
    const err: string[] = [];
    const code = await run(["uninstall"], "0.1.0", {
      out: () => {},
      err: (t) => err.push(t),
      env: { AIKO_HOME: s.aikoHome },
    });
    assert.deepEqual(
      [code, existsSync(join(s.aikoHome, "persona", "origin", "persona.md"))],
      [2, true],
    );
  } finally {
    await s.cleanup();
  }
});

test("確認で「いいえ」と答えたら消さない", async () => {
  const s = await installed();
  try {
    const code = await run(["uninstall"], "0.1.0", {
      out: () => {},
      err: () => {},
      env: { AIKO_HOME: s.aikoHome },
      ask: async () => "n",
    });
    assert.deepEqual(
      [code, existsSync(join(s.aikoHome, "persona", "origin", "persona.md"))],
      [0, true],
    );
  } finally {
    await s.cleanup();
  }
});

test("--yes なら確認せずに消す", async () => {
  const s = await installed();
  try {
    const code = await run(["uninstall", "--yes"], "0.1.0", {
      out: () => {},
      err: () => {},
      env: { AIKO_HOME: s.aikoHome },
    });
    assert.deepEqual(
      [code, existsSync(join(s.aikoHome, "persona", "origin", "persona.md"))],
      [0, false],
    );
  } finally {
    await s.cleanup();
  }
});

test("記録が無いときは理由を返して 1 で終わる", async () => {
  const s = await installed();
  try {
    await rm(join(s.aikoHome, MANIFEST_NAME));
    const err: string[] = [];
    const code = await run(["uninstall", "--yes"], "0.1.0", {
      out: () => {},
      err: (t) => err.push(t),
      env: { AIKO_HOME: s.aikoHome },
    });
    assert.deepEqual([code, err.join("").includes("区別できない")], [1, true]);
  } finally {
    await s.cleanup();
  }
});

test("計画の時点で利用者のものを対象に入れない", async () => {
  const s = await installed();
  try {
    // manifest が誤って利用者のファイルを含んでいても消さない（二重の守り）。
    await writeFile(
      join(s.aikoHome, MANIFEST_NAME),
      ["persona/origin/persona.md", "user.md", "persona/aiko-override.md"].join("\n"),
    );
    const plan = await planUninstall(s.aikoHome);
    assert.deepEqual(plan.removable, ["persona/origin/persona.md"]);
  } finally {
    await s.cleanup();
  }
});

test("manifest に載っていても人格別ユーザー設定とプロフィールを消さない", async () => {
  const s = await installed();
  try {
    const paths = ["persona/origin/user.md", "persona/override/user.md", "persona/override/persona.md", "user-profile.json", "user-proposal.md", "speech-style", "speech-style-proposal", "speech-styles/friend.md"];
    for (const path of paths) await write(join(s.aikoHome, path), "FIXTURE_USER_DATA\n");
    await writeFile(join(s.aikoHome, MANIFEST_NAME), paths.join("\n"));
    await uninstall(s.aikoHome);
    for (const path of paths) assert.equal(await readFile(join(s.aikoHome, path), "utf8"), "FIXTURE_USER_DATA\n", path);
  } finally { await s.cleanup(); }
});


test("アンインストールはディレクトリやファイルのリンクをたどらない", async () => {
  const s = await installed();
  try {
    const outside = join(s.root, "outside");
    await write(join(outside, "private.md"), "USER DATA\n");
    await symlink(outside, join(s.aikoHome, "linked"), "dir");
    await symlink(join(outside, "private.md"), join(s.aikoHome, "linked-file.md"));
    await write(join(s.aikoHome, MANIFEST_NAME), "linked/private.md\nlinked-file.md\n");
    await uninstall(s.aikoHome);
    assert.equal(await readFile(join(outside, "private.md"), "utf8"), "USER DATA\n");
    assert.equal(existsSync(join(s.aikoHome, "linked-file.md")), true);
  } finally { await s.cleanup(); }
});


test("導入記録がユーザーデータのリンクなら削除しない", async () => {
  for (const kind of ["symbolic", "hard"]) {
    const s = await installed();
    try {
      const manifest = join(s.aikoHome, MANIFEST_NAME);
      await rm(manifest);
      const user = join(s.aikoHome, "user.md");
      if (kind === "symbolic") await symlink(user, manifest);
      else await link(user, manifest);
      await assert.rejects(uninstall(s.aikoHome), /導入記録/);
      assert.equal(await readFile(user, "utf8"), "呼び名は利用者さん\n");
      assert.equal(existsSync(join(s.aikoHome, "persona", "origin", "persona.md")), true);
    } finally { await s.cleanup(); }
  }
});

test("導入記録に載っていても利用者データへのハードリンクは残す", async () => {
  const s = await installed();
  try {
    const target = join(s.aikoHome, "linked.md");
    await link(join(s.aikoHome, "user.md"), target);
    await write(join(s.aikoHome, MANIFEST_NAME), "linked.md\n");
    await uninstall(s.aikoHome);
    assert.equal(await readFile(target, "utf8"), "呼び名は利用者さん\n");
  } finally { await s.cleanup(); }
});
