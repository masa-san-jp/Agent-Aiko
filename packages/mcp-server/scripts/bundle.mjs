// 依存を1つに畳んで配る。
//
// `aiko-mcp` は社内 package 5つ（core / binder / user-context / capability-registry /
// runtime-sdk）に依存している。**それらも npm に出さないと動かない**ので、素直に
// 出すと公開する名前が6つになる。畳めば公開は1つで済み、利用者の設定も1行で済む。
//
// 畳むのは社内 package だけ。@modelcontextprotocol/sdk と zod は普通の依存として
// 宣言する——広く使われているものを二重に抱えると、利用者側と版が食い違う。

import { build } from "esbuild";
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
    // 元の行がどこか分かるように残す。落ちたとき素の bundle だけだと追えない。
    sourcemap: true,
    logLevel: "warning",
  });
}

console.log("[bundle] dist/server.js, dist/index.js");
