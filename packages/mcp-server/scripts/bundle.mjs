// 依存を1つに畳んで配る。
//
// `aiko-mcp` は社内 package 5つ（core / binder / user-context / capability-registry /
// runtime-sdk）に依存している。**それらも npm に出さないと動かない**ので、素直に
// 出すと公開する名前が6つになる。畳めば公開は1つで済み、利用者の設定も1行で済む。
//
// 畳むのは社内 package だけ。@modelcontextprotocol/sdk と zod は普通の依存として
// 宣言する——広く使われているものを二重に抱えると、利用者側と版が食い違う。

import { build } from "esbuild";
import { readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..");

const external = ["@modelcontextprotocol/sdk", "@modelcontextprotocol/sdk/*", "zod"];

for (const [entry, out] of [
  ["src/server.ts", "dist/server.js"],
  ["src/index.ts", "dist/index.js"],
]) {
  await build({
    entryPoints: [join(pkg, entry)],
    outfile: join(pkg, out),
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    external,
    // source map は作らない。**中に元のソースが丸ごと入る**（実測: 33ファイル分の
    // 本文が sourcesContent に埋まっていた）。開発の内輪のコメントごと配ることに
    // なるので、追跡性より外に出さないほうを取る。落ちたときは版を指定して手元で
    // 再現する。
    sourcemap: false,
    logLevel: "warning",
  });
}

// tsc が出した非 bundle の中間ファイルを消す。
//
// **これを残すと2つ問題が起きる。** ①中に `@agent-aiko/*` への import が残っていて、
// 利用者の環境には無いので、触れば落ちる。②ソースのコメントがそのまま入るので、
// 開発の内輪の記述（人の名前を含む）を配ることになる。実際に両方入っていた
// （2026-08-02 の公開前確認で発見）。
//
// 配るのは bundle した2本とその map だけ。
const keep = new Set(["server.js", "index.js"]);
const dist = join(pkg, "dist");
for (const entry of await readdir(dist)) {
  if (keep.has(entry)) continue;
  await rm(join(dist, entry), { recursive: true, force: true });
}

console.log("[bundle] dist/server.js, dist/index.js（他は削除）");
