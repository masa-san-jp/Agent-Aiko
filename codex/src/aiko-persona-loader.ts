// Aiko persona loader — ~/.aiko/ から人格・INVARIANTS・ユーザー情報・ルール・スキルを集約する。
//
// 設計の正本: 非公開設計メモ v0.3.1 §6.2

import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** ~/.aiko/ から読み込んだ人格スナップショット。 */
export interface AikoPersonaSnapshot {
  /** 現在のモード。mode ファイルが無い／不正値の場合は "origin" として扱う。 */
  mode: "origin" | "override";
  /** override モード時のアクティブ人格スラグ。空文字列はデフォルト override を意味する。 */
  activePersona: string;
  /** mode と activePersona に応じて選んだ persona 本文。 */
  persona: string;
  /** INVARIANTS.md の内容（不変条項）。 */
  invariants: string;
  /** user.md からパースしたユーザー情報。 */
  user: { name?: string; address?: string };
  /** capability/rules/rules-base.md の内容（無ければ空文字列）。 */
  rulesBase: string;
  /** capability/skills/ 配下のスキル名一覧（参照用、ソート済）。 */
  capabilitySkills: string[];
}

export interface LoadPersonaOptions {
  /** ~/.aiko/ の場所を上書き。既定は os.homedir() + "/.aiko"。 */
  aikoHome?: string;
}

/** ~/.aiko/ を読み込んで AikoPersonaSnapshot を返す。
 *
 * 必須ファイル（不在は throw）：
 *   - persona/aiko-origin.md または persona/aiko-override.md または persona/overrides/<slug>.md（mode + activePersona に応じて）
 *   - persona/INVARIANTS.md
 *
 * 任意（不在は安全側にフォールバック）：
 *   - mode（無ければ "origin"）
 *   - active-persona（無ければ "" = デフォルト override）
 *   - user.md（無ければ name/address とも未設定）
 *   - capability/rules/rules-base.md（無ければ空文字列）
 *   - capability/skills/（無ければ空配列）
 */
export async function loadPersona(opts: LoadPersonaOptions = {}): Promise<AikoPersonaSnapshot> {
  const aikoHome = opts.aikoHome ?? join(homedir(), ".aiko");

  const mode = await readMode(aikoHome);
  const activePersona = mode === "override" ? await readActivePersona(aikoHome) : "";
  const persona = await readPersonaFile(aikoHome, mode, activePersona);
  const invariants = await readFile(join(aikoHome, "persona", "INVARIANTS.md"), "utf8");
  const user = await readUser(aikoHome);
  const rulesBase = await readOptionalFile(
    join(aikoHome, "capability", "rules", "rules-base.md")
  );
  const capabilitySkills = await readSkillNames(join(aikoHome, "capability", "skills"));

  return { mode, activePersona, persona, invariants, user, rulesBase, capabilitySkills };
}

/** ENOENT（ファイル／ディレクトリ不在）のときだけ true を返す型ガード。
 *  これ以外（EACCES / EPERM 等）は呼び出し側で rethrow して可視化する。 */
function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

async function readMode(aikoHome: string): Promise<"origin" | "override"> {
  try {
    const content = (await readFile(join(aikoHome, "mode"), "utf8")).trim();
    return content === "override" ? "override" : "origin";
  } catch (err) {
    if (isNotFound(err)) return "origin";
    throw err;
  }
}

async function readActivePersona(aikoHome: string): Promise<string> {
  try {
    return (await readFile(join(aikoHome, "active-persona"), "utf8")).trim();
  } catch (err) {
    if (isNotFound(err)) return "";
    throw err;
  }
}

/** mode と activePersona に応じた人格ファイルを読む。
 *  named persona のファイルが ENOENT（見つからない）場合のみ aiko-override.md にフォールバックする。
 *  EACCES / EPERM 等の他エラーは rethrow して呼び出し元に可視化する。 */
async function readPersonaFile(
  aikoHome: string,
  mode: "origin" | "override",
  activePersona: string
): Promise<string> {
  if (mode !== "override") {
    return readFile(join(aikoHome, "persona", "aiko-origin.md"), "utf8");
  }
  if (activePersona) {
    const namedPath = join(aikoHome, "persona", "overrides", `${activePersona}.md`);
    try {
      return await readFile(namedPath, "utf8");
    } catch (err) {
      if (!isNotFound(err)) throw err;
      // ファイルが消えていた場合は aiko-override.md にフォールバック
    }
  }
  return readFile(join(aikoHome, "persona", "aiko-override.md"), "utf8");
}

async function readUser(aikoHome: string): Promise<{ name?: string; address?: string }> {
  let content: string;
  try {
    content = await readFile(join(aikoHome, "user.md"), "utf8");
  } catch (err) {
    if (isNotFound(err)) return {};
    throw err;
  }
  const result: { name?: string; address?: string } = {};
  const nameMatch = content.match(/^name:\s*(.+)$/m);
  if (nameMatch && typeof nameMatch[1] === "string" && nameMatch[1].trim().length > 0) {
    result.name = nameMatch[1].trim();
  }
  const addressMatch = content.match(/^address:\s*(.+)$/m);
  if (addressMatch && typeof addressMatch[1] === "string" && addressMatch[1].trim().length > 0) {
    result.address = addressMatch[1].trim();
  }
  return result;
}

async function readOptionalFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if (isNotFound(err)) return "";
    throw err;
  }
}

async function readSkillNames(skillsDir: string): Promise<string[]> {
  try {
    const entries = await readdir(skillsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (err) {
    if (isNotFound(err)) return [];
    throw err;
  }
}
