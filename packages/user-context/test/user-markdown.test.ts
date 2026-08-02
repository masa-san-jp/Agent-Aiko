// user.md の読み書き。
//
// 利用者に手で作らせないファイルなので、**アイコが書いたものをアイコが読み直せる**
// ことが最低条件。書式を片方だけ変えると静かに読めなくなるので、往復で確かめる。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  parseUserMarkdown,
  readUserMarkdown,
  renderUserMarkdown,
  userMarkdownCandidates,
  writeUserMarkdown,
} from "../src/user-markdown.js";
import { UserContextProvider } from "../src/user-context-provider.js";

test("インストーラーが置く形の user.md を読める", () => {
  const text = [
    "# ユーザー設定",
    "",
    "## 名前",
    "",
    "<!-- Aiko が初回起動時に記録します。 -->",
    "",
    "name: マサ",
    "",
    "## 呼び方",
    "",
    "address: マサくん",
  ].join("\n");
  assert.deepEqual(parseUserMarkdown(text), { name: "マサ", address: "マサくん" });
});

test("空の項目は無いものとして扱う", () => {
  // テンプレートは値が空の状態で置かれる。空を「設定済み」にすると、
  // 名前を教えていないのに呼ぼうとする。
  assert.deepEqual(parseUserMarkdown("name:\naddress:\n"), {});
});

test("見出しやコメントを値と間違えない", () => {
  assert.deepEqual(parseUserMarkdown("# 見出し: これは値ではない\nname: マサ\n"), {
    name: "マサ",
  });
});

test("記憶の場所を読める", () => {
  assert.deepEqual(parseUserMarkdown("memory: ~/notes\n"), { memory: "~/notes" });
});

test("書いたものを読み直せる", () => {
  const user = { name: "マサ", address: "マサくん", memory: "~/notes" };
  assert.deepEqual(parseUserMarkdown(renderUserMarkdown(user)), user);
});

test("記憶を設定していなければ、その行を書かない", () => {
  // 空行があると「設定できるが未設定」に見える。記憶は無いのが普通。
  assert.equal(renderUserMarkdown({ name: "マサ" }).includes("memory:"), false);
});

test("書き込みは途中の状態を残さない", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aiko-usermd-"));
  try {
    const path = join(dir, "user.md");
    await writeUserMarkdown(path, { name: "マサ", address: "マサくん" });
    const found = await readUserMarkdown([path]);
    assert.deepEqual(found?.user, { name: "マサ", address: "マサくん" });
    // 一時ファイルが残っていない（残ると次の読み手が拾う）
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(dir);
    assert.deepEqual(entries, ["user.md"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("置き場が無くても書ける", async () => {
  // 入れた直後に呼び名を教える、が実際の初手。~/.aiko はまだ無い。
  const dir = await mkdtemp(join(tmpdir(), "aiko-usermd-mk-"));
  try {
    const path = join(dir, ".aiko", "user.md");
    await writeUserMarkdown(path, { address: "マサくん" });
    assert.deepEqual((await readUserMarkdown([path]))?.user, { address: "マサくん" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("候補は人格ごとの user.md を先に見る", () => {
  assert.deepEqual(userMarkdownCandidates("/home/x/.aiko", "aiko-dev"), [
    "/home/x/.aiko/persona/overrides/aiko-dev/user.md",
    "/home/x/.aiko/user.md",
  ]);
});

test("見つからなければ undefined を返す", async () => {
  assert.equal(await readUserMarkdown(["/nonexistent/user.md"]), undefined);
});

// --- UserContext への反映 ---

const provider = new UserContextProvider();
const base = provider.resolve({ schema_version: 1, user_id: "default" });

test("user.md の呼び方が呼び名になる", () => {
  const merged = provider.withMarkdown(base, { name: "マサ", address: "マサくん" });
  assert.equal(merged.context.preferredName, "マサくん");
});

test("呼び方が無ければ名前を使う", () => {
  assert.equal(provider.withMarkdown(base, { name: "マサ" }).context.preferredName, "マサ");
});

test("user.md が無ければ呼び名を持たない", () => {
  // 既定では名前を呼ばない、が仕様（記憶を同期しないので）。
  assert.equal(base.context.preferredName, undefined);
});

test("記憶は場所の参照として持つ", () => {
  assert.equal(provider.withMarkdown(base, { memory: "~/notes" }).memoryNamespace, "~/notes");
});

test("user.md が書いていない項目は JSON 側を残す", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aiko-usermd-merge-"));
  try {
    const path = join(dir, "user-profile.json");
    await writeFile(
      path,
      JSON.stringify({
        schema_version: 1,
        user_id: "masa",
        identity: { preferred_name: "マサさん" },
        communication: { language: "ja" },
      }),
    );
    const loaded = await provider.loadFromFile(path);
    const merged = provider.withMarkdown(loaded, { address: "マサくん" });
    assert.deepEqual(
      [merged.context.preferredName, merged.context.language],
      ["マサくん", "ja"],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});


// --- 並行して呼ばれたとき（公開前レビューで壊れた経路） ---

test("同時に3つ書いても、ファイルが壊れない", async () => {
  // 一時ファイル名をプロセス番号だけで決めていたため、並行呼び出しが同じ
  // 一時ファイルを取り合い、5回中5回データが消え、1回は途中で千切れた。
  // MCP のクライアントはツールを並行で呼ぶので、これは日常の使い方。
  const dir = await mkdtemp(join(tmpdir(), "aiko-usermd-race-"));
  try {
    const path = join(dir, "user.md");
    for (let round = 0; round < 5; round += 1) {
      await Promise.all([
        writeUserMarkdown(path, { name: "AAAA" }),
        writeUserMarkdown(path, { address: "BBBB" }),
        writeUserMarkdown(path, { memory: "CCCC" }),
      ]);
      // どれか1つが勝つのは構わない。**読める形で残っている**ことが条件。
      const found = await readUserMarkdown([path]);
      assert.notEqual(found, undefined, `${round} 回目でファイルを読めなくなった`);
      const values = Object.values(found?.user ?? {});
      assert.equal(
        values.every((v) => ["AAAA", "BBBB", "CCCC"].includes(v)),
        true,
        `${round} 回目で値が壊れた: ${JSON.stringify(found?.user)}`,
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("並行して書いても、一時ファイルが残らない", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aiko-usermd-tmp-"));
  try {
    const path = join(dir, "user.md");
    await Promise.all(
      Array.from({ length: 8 }, (_, i) => writeUserMarkdown(path, { name: `N${i}` })),
    );
    const { readdir } = await import("node:fs/promises");
    assert.deepEqual(await readdir(dir), ["user.md"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- 値の検査（改行注入と長さ） ---

test("値に改行が入っていたら書かずに断る", async () => {
  // 潰すのではなく断る。潰すと、入れたつもりの内容と保存された内容が静かに食い違う。
  assert.throws(() => renderUserMarkdown({ name: "たろう\nmemory: /etc/passwd" }));
});

test("改行を含む値を書こうとしても、ファイルは作られない", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aiko-usermd-reject-"));
  try {
    const path = join(dir, "user.md");
    await assert.rejects(() => writeUserMarkdown(path, { name: "たろう\nmemory: /etc/passwd" }));
    const { readdir } = await import("node:fs/promises");
    assert.deepEqual(await readdir(dir), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("長すぎる値は断る", () => {
  // 上限が無いと、5MB の呼び名で 5MB の user.md ができた。
  assert.throws(() => renderUserMarkdown({ name: "あ".repeat(5000) }));
});
