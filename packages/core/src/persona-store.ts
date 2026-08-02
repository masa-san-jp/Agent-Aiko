// 人格の一覧・切り替え・保存。`~/.aiko` の中だけを書く。
//
// **配布物側（同梱人格・不変条項）には触れない。** 不変条項 I-5 が
// 「オリジナルの persona.md は書き換えません」「不変条項自体を書き換えません」と
// 定めており、ここでも同じ制限を実装する。文章で禁じるだけだと、次に書く人が破る。
//
// 書き込みはすべて一時ファイル経由の置き換え。インストーラー版と MCP 版が
// 同じ場所を見るので、書いている途中を読む経路が実在する。

import { randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { isSafePersonaName } from "./filesystem-persona-repository.js";
import { assertWithinLimit } from "./limits.js";

export class PersonaStoreError extends Error {
  override readonly name = "PersonaStoreError";
}

export interface PersonaEntry {
  name: string;
  /** いま使われているか。 */
  active: boolean;
  /** 配布物が持つオリジナルか。書き換えられない。 */
  builtin: boolean;
}

async function readOptional(path: string): Promise<string | undefined> {
  return readFile(path, "utf8").catch(() => undefined);
}

/** 置き換え方式で書く。途中の状態を他方に読ませない。
 *
 *  **一時ファイル名は呼び出しごとに変える。** プロセス番号だけで決めると、
 *  同じプロセス内の並行呼び出しが同じ一時ファイルを取り合い、片方の rename の後に
 *  もう片方が書いて、壊れたファイルが残る（公開前レビューで実測: 3並行×5回、
 *  5回ともデータが消え、1回はファイルが途中で千切れた）。
 *
 *  basename を使うのは Windows のため。`split("/")` だと区切りが `\` の環境で
 *  パス全体が名前になり、`:` を含む不正なファイル名になる。 */
async function writeAtomic(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = join(dirname(path), `.tmp-${randomUUID()}-${basename(path)}`);
  try {
    await writeFile(temp, text, { mode: 0o600 });
    await rename(temp, path);
  } catch (err) {
    // 失敗しても一時ファイルを残さない。次の読み手が拾う余地を作らない。
    await rm(temp, { force: true }).catch(() => undefined);
    throw err;
  }
}

export async function readMode(aikoHome: string): Promise<"origin" | "override"> {
  const raw = (await readOptional(join(aikoHome, "mode")))?.trim();
  return raw === "override" ? "override" : "origin";
}

export async function readActivePersona(aikoHome: string): Promise<string> {
  const raw = (await readOptional(join(aikoHome, "active-persona")))?.trim() ?? "";
  return isSafePersonaName(raw) ? raw : "";
}

/** 使える人格の一覧。オリジナルは常に先頭。 */
export async function listPersonas(aikoHome: string): Promise<PersonaEntry[]> {
  const mode = await readMode(aikoHome);
  const active = await readActivePersona(aikoHome);

  const entries: PersonaEntry[] = [
    { name: "origin", active: mode !== "override", builtin: true },
  ];

  const dir = join(aikoHome, "persona", "overrides");
  const names = await readdir(dir).catch(() => [] as string[]);
  for (const name of names.sort()) {
    if (!isSafePersonaName(name)) continue;
    const info = await stat(join(dir, name)).catch(() => undefined);
    if (info?.isDirectory() !== true) continue;
    entries.push({
      name,
      active: mode === "override" && active === name,
      builtin: false,
    });
  }
  return entries;
}

/** 使う人格を変える。origin を指定すると mode を origin へ戻す。 */
export async function switchPersona(aikoHome: string, name: string): Promise<void> {
  if (name === "origin") {
    await writeAtomic(join(aikoHome, "mode"), "origin\n");
    return;
  }
  if (!isSafePersonaName(name)) {
    throw new PersonaStoreError(`人格名として使えません: ${name}`);
  }
  const path = join(aikoHome, "persona", "overrides", name, "persona.md");
  if ((await readOptional(path)) === undefined) {
    throw new PersonaStoreError(`人格 ${name} がありません`);
  }
  await writeAtomic(join(aikoHome, "mode"), "override\n");
  await writeAtomic(join(aikoHome, "active-persona"), `${name}\n`);
}

/** 独自人格を保存する。**オリジナルと不変条項は対象外。** */
export async function savePersona(
  aikoHome: string,
  name: string,
  content: string,
): Promise<string> {
  if (name === "origin") {
    // 配布物のオリジナルは書き換えない（不変条項 I-5）。別名で保存させる。
    throw new PersonaStoreError("origin は書き換えられません。別の名前で保存してください");
  }
  if (!isSafePersonaName(name)) {
    throw new PersonaStoreError(`人格名として使えません: ${name}`);
  }
  if (content.trim().length === 0) {
    throw new PersonaStoreError("中身が空の人格は保存しません");
  }
  assertWithinLimit("personaPackage", content);

  const dir = join(aikoHome, "persona", "overrides", name);
  // 置き場が symlink だと、書き込みがその先へ抜ける。~/.aiko の外へ書けてしまうので、
  // リンクなら断る（消す側は rm がリンク自体を外すので問題ない。実測済み）。
  const info = await lstat(dir).catch(() => undefined);
  if (info?.isSymbolicLink() === true) {
    throw new PersonaStoreError(`${name} はリンクです。実体のある場所に作り直してください`);
  }
  const path = join(dir, "persona.md");
  await writeAtomic(path, content.endsWith("\n") ? content : `${content}\n`);
  return path;
}

/** 独自人格を消す。使用中なら origin へ戻してから消す（人格の無い状態を作らない）。 */
export async function deletePersona(aikoHome: string, name: string): Promise<void> {
  if (name === "origin" || !isSafePersonaName(name)) {
    throw new PersonaStoreError(`消せません: ${name}`);
  }
  const dir = join(aikoHome, "persona", "overrides", name);
  if ((await stat(dir).catch(() => undefined)) === undefined) {
    throw new PersonaStoreError(`人格 ${name} がありません`);
  }
  // 人格であることを確かめてから消す。名前が通るだけで中身を見ないと、
  // overrides の下に置かれた別のディレクトリを丸ごと消せてしまう。
  if ((await readOptional(join(dir, "persona.md"))) === undefined) {
    throw new PersonaStoreError(`${name} は人格ではありません（persona.md がありません）`);
  }
  if ((await readActivePersona(aikoHome)) === name) {
    await writeAtomic(join(aikoHome, "mode"), "origin\n");
    // 指定も消す。残すと、次に override へ切り替えたとき無い人格を指す。
    await writeAtomic(join(aikoHome, "active-persona"), "\n");
  }
  await rm(dir, { recursive: true, force: true });
}
