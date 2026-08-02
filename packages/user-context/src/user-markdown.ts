// user.md の読み書き。
//
// インストーラーが置くのは昔からこの形（`name:` / `address:` の行）で、
// **利用者が手で作るものではなく、アイコが会話しながら書くもの**。だから
// JSON ではなくこの形を正にする（マサさん指定 2026-08-02）。
//
// 書き込みは一時ファイル経由で置き換える。インストーラー版と MCP 版が同じ
// ファイルを見るので、片方が書いている途中をもう片方が読む経路が実在する。
// 途中のファイルを読ませないことが、共存の前提。

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** user.md が持てる項目。増やすときは書き出し側も一緒に直す。 */
export interface UserMarkdown {
  /** 本人の名前。 */
  name?: string;
  /** 呼び方。未設定なら name を使う。 */
  address?: string;
  /** 記憶の置き場。**参照だけ持ち、中身は読まない。**
   *  読むのは繋いでいるクライアント側で、こちらは場所を伝えるだけ。 */
  memory?: string;
}

const KEYS = ["name", "address", "memory"] as const;

/** `key: value` の行だけ拾う。見出しやコメントは無視する。 */
export function parseUserMarkdown(text: string): UserMarkdown {
  const out: UserMarkdown = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || trimmed.startsWith("<!--")) continue;
    const at = trimmed.indexOf(":");
    if (at < 0) continue;
    const key = trimmed.slice(0, at).trim().toLowerCase();
    const value = trimmed.slice(at + 1).trim();
    if (value.length === 0) continue;
    if ((KEYS as readonly string[]).includes(key)) {
      out[key as (typeof KEYS)[number]] = value;
    }
  }
  return out;
}

export function renderUserMarkdown(user: UserMarkdown): string {
  const lines = [
    "# ユーザー設定",
    "",
    "<!-- アイコが会話しながら書きます。手で直しても構いません。 -->",
    "",
    `name: ${user.name ?? ""}`,
    `address: ${user.address ?? ""}`,
  ];
  // 書いていないものは行ごと出さない。空の行があると「設定できるが未設定」に
  // 見えるが、記憶は設定していないほうが普通なので、無い状態を既定にする。
  if (user.memory) lines.push(`memory: ${user.memory}`);
  return `${lines.join("\n")}\n`;
}

/** 候補を順に読む。最初に見つかったものを返す（見つからなければ undefined）。 */
export async function readUserMarkdown(
  paths: readonly string[],
): Promise<{ path: string; user: UserMarkdown } | undefined> {
  for (const path of paths) {
    const text = await readFile(path, "utf8").catch(() => undefined);
    if (text === undefined) continue;
    return { path, user: parseUserMarkdown(text) };
  }
  return undefined;
}

/** 置き場の候補。人格ごとの user.md を先に見る（CLAUDE.md の起動手順と同じ順）。 */
export function userMarkdownCandidates(aikoHome: string, activePersona?: string): string[] {
  const paths: string[] = [];
  if (activePersona) {
    paths.push(join(aikoHome, "persona", "overrides", activePersona, "user.md"));
  }
  paths.push(join(aikoHome, "user.md"));
  return paths;
}

/** 途中の状態を読ませずに置き換える。同じ場所を2つの経路が見ているため。 */
export async function writeUserMarkdown(path: string, user: UserMarkdown): Promise<void> {
  // 置き場ごと無いことがある。初めて覚えるのが `~/.aiko` を作る前、という順序は
  // 実際に起きる（入れた直後に呼び名を教える）。0700 は §11.3 の権限に合わせる。
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = join(dirname(path), `.user.md.tmp-${process.pid}`);
  await writeFile(temp, renderUserMarkdown(user), { mode: 0o600 });
  await rename(temp, path);
}
