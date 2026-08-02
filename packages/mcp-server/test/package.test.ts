// 公開する配布物の形。
//
// npm へ出したものは取り消せない（72時間を過ぎると消せず、名前も再利用できない）。
// だから「出す前に必ず見る」項目を、目で見るのではなく検査にしておく。
//
// 見るのは3つ——**1つで完結しているか**（社内 package を要求しないか）、
// **人格とライセンスが入っているか**、**版と名前が意図どおりか**。

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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

/** 実際に配る中身。files の指定どおりに集める。 */
function shippedFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(full);
    }
  };
  for (const rel of manifest.files ?? []) {
    const full = join(pkgRoot, rel);
    if (!existsSync(full)) continue;
    if (statSync(full).isDirectory()) walk(full);
    else out.push(full);
  }
  return out;
}

test("配る中身のどれにも社内 package の名前が残っていない", () => {
  // 依存の宣言を消しても、bundle し損ねていれば実行時に落ちる。落ちるのは
  // 利用者の環境なので、こちらで見つける。**1ファイルだけ見ても足りない**——
  // bundle していない tsc 出力が dist に残っていて、そこに import が生きていた
  // （2026-08-02 の公開前確認で発見）。
  const offenders = shippedFiles().filter((f) =>
    readFileSync(f, "utf8").includes("@agent-aiko/"),
  );
  assert.deepEqual(offenders.map((f) => f.replace(pkgRoot, "")), []);
});

test("配る中身に個人名が入っていない", () => {
  // ソースのコメントには開発の内輪の記述が入る。bundle していない出力や source map を
  // 配ると、それがそのまま外へ出る（source map には元のソースが丸ごと埋まる）。
  //
  // **エスケープを戻してから見る。** JSON は日本語を \uXXXX で書くので、生の文字列で
  // 探すと map の中の名前を素通しする。最初その形で書いて、通ってしまった。
  const offenders = shippedFiles().filter((f) => {
    const raw = readFileSync(f, "utf8");
    const decoded = raw.replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
    return /マサ(さん|くん)/.test(decoded);
  });
  assert.deepEqual(offenders.map((f) => f.replace(pkgRoot, "")), []);
});

test("配るのは bundle した2本だけ", () => {
  // 型定義は手元に残す（他 package の型検査が使う）。**配る範囲は files で絞る**。
  const shipped = (manifest.files ?? []).filter((f) => f.startsWith("dist/")).sort();
  assert.deepEqual(shipped, ["dist/index.js", "dist/server.js"]);
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
    "dist/index.js",
    "dist/server.js",
    "persona",
  ]);
});

test("実行の入口が1つある", () => {
  assert.deepEqual(manifest.bin, { "aiko-mcp": "dist/server.js" });
});
