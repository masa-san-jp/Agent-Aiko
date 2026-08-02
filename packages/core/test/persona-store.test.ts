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
