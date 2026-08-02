// 人格の一覧・切り替え・保存。
//
// 見るのは2つ——**配布物側を書き換えないこと**と、**人格の無い状態を作らないこと**。
// どちらも壊れると、アイコが自分を失う形の失敗になる。

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  deletePersona,
  listPersonas,
  PersonaStoreError,
  readActivePersona,
  readMode,
  savePersona,
  switchPersona,
} from "../src/persona-store.js";

async function write(path: string, text: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

async function sandbox() {
  const root = await mkdtemp(join(tmpdir(), "aiko-personas-"));
  const aikoHome = join(root, ".aiko");
  await write(join(aikoHome, "persona", "origin", "persona.md"), "オリジナルのアイコ\n");
  await write(join(aikoHome, "INVARIANTS.md"), "不変条項\n");
  await write(join(aikoHome, "persona", "overrides", "aiko-dev", "persona.md"), "開発のアイコ\n");
  await write(join(aikoHome, "mode"), "origin\n");
  return { root, aikoHome, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test("オリジナルと独自人格が一覧に出る", async () => {
  const s = await sandbox();
  try {
    const names = (await listPersonas(s.aikoHome)).map((p) => p.name);
    assert.deepEqual(names, ["origin", "aiko-dev"]);
  } finally {
    await s.cleanup();
  }
});

test("いま使っている人格が分かる", async () => {
  const s = await sandbox();
  try {
    await switchPersona(s.aikoHome, "aiko-dev");
    const active = (await listPersonas(s.aikoHome)).filter((p) => p.active).map((p) => p.name);
    assert.deepEqual(active, ["aiko-dev"]);
  } finally {
    await s.cleanup();
  }
});

test("オリジナルへ戻せる", async () => {
  const s = await sandbox();
  try {
    await switchPersona(s.aikoHome, "aiko-dev");
    await switchPersona(s.aikoHome, "origin");
    assert.equal(await readMode(s.aikoHome), "origin");
  } finally {
    await s.cleanup();
  }
});

test("無い人格へは切り替えない", async () => {
  const s = await sandbox();
  try {
    await assert.rejects(() => switchPersona(s.aikoHome, "nonexistent"), PersonaStoreError);
  } finally {
    await s.cleanup();
  }
});

test("切り替えに失敗しても、それまでの人格のままでいる", async () => {
  const s = await sandbox();
  try {
    await switchPersona(s.aikoHome, "aiko-dev");
    await switchPersona(s.aikoHome, "nonexistent").catch(() => undefined);
    assert.equal(await readActivePersona(s.aikoHome), "aiko-dev");
  } finally {
    await s.cleanup();
  }
});

test("区切り文字を含む名前は受け付けない", async () => {
  const s = await sandbox();
  try {
    await assert.rejects(() => switchPersona(s.aikoHome, "../../etc"), PersonaStoreError);
  } finally {
    await s.cleanup();
  }
});

// --- 保存 ---

test("独自人格を保存できる", async () => {
  const s = await sandbox();
  try {
    const path = await savePersona(s.aikoHome, "myaiko", "わたしのアイコ");
    assert.equal(await readFile(path, "utf8"), "わたしのアイコ\n");
  } finally {
    await s.cleanup();
  }
});

test("オリジナルは書き換えられない", async () => {
  // 不変条項 I-5。文章で禁じるだけでなく、実際に書けないようにする。
  const s = await sandbox();
  try {
    await assert.rejects(() => savePersona(s.aikoHome, "origin", "乗っ取り"), PersonaStoreError);
    assert.equal(
      await readFile(join(s.aikoHome, "persona", "origin", "persona.md"), "utf8"),
      "オリジナルのアイコ\n",
    );
  } finally {
    await s.cleanup();
  }
});

test("置き場の外へは保存できない", async () => {
  const s = await sandbox();
  try {
    await assert.rejects(
      () => savePersona(s.aikoHome, "../../../evil", "外へ書く"),
      PersonaStoreError,
    );
  } finally {
    await s.cleanup();
  }
});

test("中身が空の人格は保存しない", async () => {
  const s = await sandbox();
  try {
    await assert.rejects(() => savePersona(s.aikoHome, "empty", "   \n"), PersonaStoreError);
  } finally {
    await s.cleanup();
  }
});

test("保存した人格へすぐ切り替えられる", async () => {
  const s = await sandbox();
  try {
    await savePersona(s.aikoHome, "myaiko", "わたしのアイコ");
    await switchPersona(s.aikoHome, "myaiko");
    assert.equal(await readActivePersona(s.aikoHome), "myaiko");
  } finally {
    await s.cleanup();
  }
});

// --- 削除 ---

test("使用中の人格を消すと、オリジナルへ戻る", async () => {
  // 人格の無い状態を作らない。消したまま宙に浮くと、次の起動で誰でもなくなる。
  const s = await sandbox();
  try {
    await switchPersona(s.aikoHome, "aiko-dev");
    await deletePersona(s.aikoHome, "aiko-dev");
    assert.deepEqual(
      [await readMode(s.aikoHome), existsSync(join(s.aikoHome, "persona", "overrides", "aiko-dev"))],
      ["origin", false],
    );
  } finally {
    await s.cleanup();
  }
});

test("オリジナルは消せない", async () => {
  const s = await sandbox();
  try {
    await assert.rejects(() => deletePersona(s.aikoHome, "origin"), PersonaStoreError);
  } finally {
    await s.cleanup();
  }
});

test("不変条項は人格の操作で消えない", async () => {
  const s = await sandbox();
  try {
    await savePersona(s.aikoHome, "myaiko", "わたしのアイコ");
    await deletePersona(s.aikoHome, "myaiko");
    assert.equal(existsSync(join(s.aikoHome, "INVARIANTS.md")), true);
  } finally {
    await s.cleanup();
  }
});

// --- 配る物なので、自分の環境で通ることは根拠にならない ---

test("Windows が特別扱いする名前は使えない", async () => {
  // CON / NUL などはディレクトリとして作れない。通してしまうと、Windows の人には
  // 「その名前は使えません」ではなく分かりにくいエラーが出る。
  const s = await sandbox();
  try {
    for (const name of ["CON", "con", "NUL", "COM1", "LPT9"]) {
      await assert.rejects(() => savePersona(s.aikoHome, name, "中身"), PersonaStoreError);
    }
  } finally {
    await s.cleanup();
  }
});

test("末尾がドットの名前は使えない", async () => {
  // Windows は末尾のドットを落とすので、`aiko.` と `aiko` が同じ場所を指す。
  const s = await sandbox();
  try {
    await assert.rejects(() => savePersona(s.aikoHome, "aiko.", "中身"), PersonaStoreError);
  } finally {
    await s.cleanup();
  }
});

test("人格ディレクトリが symlink でも、リンク先は消えない", async () => {
  // 二重に守る。①persona.md が無いディレクトリは消さない ②仮に消しても
  // fs.rm(recursive) は symlink 自体を外すだけでリンク先は辿らない（2026-08-02 実測）。
  // ②は「辿らないはず」ではなく実測した事実なので、ここで固定しておく。
  const s = await sandbox();
  try {
    const outside = join(s.root, "outside");
    await write(join(outside, "important.txt"), "消えては困るもの\n");
    const { symlink, rm: rmFs } = await import("node:fs/promises");
    const linked = join(s.aikoHome, "persona", "overrides", "linked");
    await symlink(outside, linked);

    // ①人格ではないので断られる
    await assert.rejects(() => deletePersona(s.aikoHome, "linked"), PersonaStoreError);

    // ②直接消しても、リンク先は残る
    await rmFs(linked, { recursive: true, force: true });
    assert.deepEqual(
      [existsSync(linked), existsSync(join(outside, "important.txt"))],
      [false, true],
    );
  } finally {
    await s.cleanup();
  }
});

// --- 公開前レビューで見つかった経路 ---

test("同時に人格を保存しても壊れない", async () => {
  const s = await sandbox();
  try {
    await Promise.all([
      savePersona(s.aikoHome, "p1", "ひとつめ"),
      savePersona(s.aikoHome, "p2", "ふたつめ"),
      savePersona(s.aikoHome, "p3", "みっつめ"),
    ]);
    const names = (await listPersonas(s.aikoHome)).map((p) => p.name);
    assert.deepEqual(names, ["origin", "aiko-dev", "p1", "p2", "p3"]);
  } finally {
    await s.cleanup();
  }
});

test("同時に切り替えても、一時ファイルが残らない", async () => {
  const s = await sandbox();
  try {
    await savePersona(s.aikoHome, "other", "べつのアイコ");
    await Promise.all([
      switchPersona(s.aikoHome, "aiko-dev"),
      switchPersona(s.aikoHome, "other"),
      switchPersona(s.aikoHome, "origin"),
    ]);
    const { readdir } = await import("node:fs/promises");
    const leftovers = (await readdir(s.aikoHome)).filter((f) => f.startsWith(".tmp-"));
    assert.deepEqual(leftovers, []);
  } finally {
    await s.cleanup();
  }
});

test("人格でないディレクトリは消せない", async () => {
  // 名前が通るだけで中身を見ないと、overrides の下に置かれた別物を丸ごと消せる。
  const s = await sandbox();
  try {
    await write(join(s.aikoHome, "persona", "overrides", "notapersona", "important.txt"), "大事\n");
    await assert.rejects(() => deletePersona(s.aikoHome, "notapersona"), PersonaStoreError);
    assert.equal(
      existsSync(join(s.aikoHome, "persona", "overrides", "notapersona", "important.txt")),
      true,
    );
  } finally {
    await s.cleanup();
  }
});

test("リンクの上には保存しない（外へ書き抜けない）", async () => {
  const s = await sandbox();
  try {
    const outside = join(s.root, "outside");
    await write(join(outside, "keep.txt"), "残るべきもの\n");
    const { symlink } = await import("node:fs/promises");
    await symlink(outside, join(s.aikoHome, "persona", "overrides", "linked"));

    await assert.rejects(() => savePersona(s.aikoHome, "linked", "外へ書く"), PersonaStoreError);
    assert.equal(existsSync(join(outside, "persona.md")), false);
  } finally {
    await s.cleanup();
  }
});

test("使用中の人格を消したら、指定も残らない", async () => {
  // mode だけ戻して active-persona を残すと、次に override へ切り替えたとき
  // 無い人格を指す。
  const s = await sandbox();
  try {
    await switchPersona(s.aikoHome, "aiko-dev");
    await deletePersona(s.aikoHome, "aiko-dev");
    assert.equal(await readActivePersona(s.aikoHome), "");
  } finally {
    await s.cleanup();
  }
});
