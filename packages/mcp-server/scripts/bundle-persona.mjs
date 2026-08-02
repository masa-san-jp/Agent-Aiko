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

console.log(`[bundle-persona] ${source} -> ${dest}`);
