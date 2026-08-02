// 人格の一覧・切り替え・保存。`~/.aiko` の中だけを書く。
//
// **配布物側（同梱人格・不変条項）には触れない。** 不変条項 I-5 が
// 「オリジナルの persona.md は書き換えません」「不変条項自体を書き換えません」と
// 定めており、ここでも同じ制限を実装する。文章で禁じるだけだと、次に書く人が破る。
//
// 書き込みはすべて一時ファイル経由の置き換え。インストーラー版と MCP 版が
// 同じ場所を見るので、書いている途中を読む経路が実在する。

import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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

/** 置き換え方式で書く。途中の状態を他方に読ませない。 */
async function writeAtomic(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = join(dirname(path), `.tmp-${process.pid}-${path.split("/").pop() ?? "f"}`);
  await writeFile(temp, text, { mode: 0o600 });
  await rename(temp, path);
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

  const path = join(aikoHome, "persona", "overrides", name, "persona.md");
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
  if ((await readActivePersona(aikoHome)) === name) {
    await writeAtomic(join(aikoHome, "mode"), "origin\n");
  }
  await rm(dir, { recursive: true, force: true });
}
