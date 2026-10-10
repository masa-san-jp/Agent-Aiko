// 配布物へ同梱する人格を、テンプレートから複製する。
//
// **コピーを git に置かない。** 置くと、テンプレートを直したのに同梱側が古いまま、
// という状態が作れてしまう。ビルドのたびに元から取り直すので、ずれようがない。
//
// 元: claude-code/template/.claude/aiko/persona/
// 先: packages/mcp-server/persona/（package.json の files に入れてある）

import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const source = join(repoRoot, "claude-code", "template", ".claude", "aiko", "persona");
const dest = join(here, "..", "persona");

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });

// 同梱するのは origin と不変条項だけ。override 用の空ディレクトリや
// 利用者が書く前提のファイルは配らない——配ると「初期値」に見える。
await cp(join(source, "origin", "persona.md"), join(dest, "origin", "persona.md"), {
  recursive: true,
});
await cp(join(source, "INVARIANTS.md"), join(dest, "INVARIANTS.md"));

// 話し方の定義。人格ではなく口調だけなので、テンプレートではなくこのパッケージに
// 元を置く（Claude Code 版の配布物には入れない）。
// ディレクトリごとは写さない。後から置いた私的なファイルまで npm に出てしまう。
for (const style of ["friend", "servant"]) {
  await cp(join(here, "..", "speech-styles", `${style}.md`), join(dest, "speech-styles", `${style}.md`));
}



// LICENSE も一緒に運ぶ。package.json に MIT と書いてあっても、本体が入っていなければ
// 受け取った人は条文を読めない。
await cp(join(repoRoot, "LICENSE"), join(here, "..", "LICENSE"));

console.log(`[bundle-persona] ${source} -> ${dest}`);
