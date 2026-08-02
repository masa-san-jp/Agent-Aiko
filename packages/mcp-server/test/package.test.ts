// 公開する配布物の形。
//
// npm へ出したものは取り消せない（72時間を過ぎると消せず、名前も再利用できない）。
// だから「出す前に必ず見る」項目を、目で見るのではなく検査にしておく。
//
// 見るのは3つ——**1つで完結しているか**（社内 package を要求しないか）、
// **人格とライセンスが入っているか**、**版と名前が意図どおりか**。

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8")) as {
  name: string;
  version: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  files?: string[];
  bin?: Record<string, string>;
};

test("公開する名前と版が意図どおり", () => {
  assert.deepEqual([manifest.name, manifest.version], ["aiko-mcp", "0.1.0"]);
});

test("公開できる状態になっている（private が外れている）", () => {
  assert.equal(manifest.private, undefined);
});

test("社内 package を依存として要求しない", () => {
  // 要求すると、それらも npm に出さないと動かない＝公開する名前が6つになる。
  const internal = Object.keys(manifest.dependencies ?? {}).filter((n) =>
    n.startsWith("@agent-aiko/"),
  );
  assert.deepEqual(internal, []);
});

test("配布物の中身に社内 package の名前が残っていない", () => {
  // 依存の宣言を消しても、bundle し損ねていれば実行時に落ちる。
  // 落ちるのは利用者の環境なので、こちらで見つける。
  const bundled = readFileSync(join(pkgRoot, "dist", "server.js"), "utf8");
  assert.equal(bundled.includes("@agent-aiko/"), false);
});

test("人格を同梱している", () => {
  assert.equal(existsSync(join(pkgRoot, "persona", "origin", "persona.md")), true);
  assert.equal(existsSync(join(pkgRoot, "persona", "INVARIANTS.md")), true);
});

test("LICENSE を同梱している", () => {
  // package.json に MIT と書いてあっても、本体が無ければ受け取った人は条文を読めない。
  assert.equal(existsSync(join(pkgRoot, "LICENSE")), true);
});

test("同梱するものを files で絞っている", () => {
  assert.deepEqual([...(manifest.files ?? [])].sort(), [
    "LICENSE",
    "README.md",
    "dist",
    "persona",
  ]);
});

test("実行の入口が1つある", () => {
  assert.deepEqual(manifest.bin, { "aiko-mcp": "dist/server.js" });
});
