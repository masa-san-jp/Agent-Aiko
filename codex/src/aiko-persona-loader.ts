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
  /** active persona の user.md からパースしたユーザー情報。 */
  user: { name?: string; address?: string };
  /** capability/rules/rules-base.md の内容（無ければ空文字列）。 */
  rulesBase: string;
  /** active persona 固有 rules.md の内容（無ければ空文字列）。 */
  personaRules: string;
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
 *   - persona/origin/persona.md または persona/overrides/<slug>/persona.md（Lab 型）
 *     旧形式（persona/aiko-origin.md / persona/aiko-override.md / persona/overrides/<slug>.md）にも互換対応
 *   - INVARIANTS.md または persona/INVARIANTS.md
 *
 * 任意（不在は安全側にフォールバック）：
 *   - mode（無ければ "origin"）
 *   - active-persona（無ければ "" = デフォルト override）
 *   - active persona の user.md（旧形式 user.md にも互換対応。無ければ name/address とも未設定）
 *   - capability/rules/rules-base.md（無ければ空文字列）
 *   - capability/skills/（無ければ空配列）
 */
export async function loadPersona(opts: LoadPersonaOptions = {}): Promise<AikoPersonaSnapshot> {
  const aikoHome = opts.aikoHome ?? join(homedir(), ".aiko");

  const mode = await readMode(aikoHome);
  const activePersona = mode === "override" ? await readActivePersona(aikoHome) : "";
  const personaRef = await resolvePersonaRef(aikoHome, mode, activePersona);
  const persona = await readFile(personaRef.personaPath, "utf8");
  const invariants = await readFirstExisting([
    join(aikoHome, "INVARIANTS.md"),
    join(aikoHome, "persona", "INVARIANTS.md"),
  ]);
  const user = await readUser(personaRef.userPath, join(aikoHome, "user.md"));
  const rulesBase = await readOptionalFile(
    join(aikoHome, "capability", "rules", "rules-base.md")
  );
  const personaRules = personaRef.rulesPath ? await readOptionalFile(personaRef.rulesPath) : "";
  const capabilitySkills = await readSkillNames(join(aikoHome, "capability", "skills"));

  return { mode, activePersona, persona, invariants, user, rulesBase, personaRules, capabilitySkills };
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

interface PersonaRef {
  personaPath: string;
  userPath?: string;
  rulesPath?: string;
}

/** mode と activePersona に応じた Lab 型の人格ディレクトリを解決する。
 *  旧 flat 型も読み込めるよう、見つからない場合だけ互換パスへフォールバックする。 */
async function resolvePersonaRef(
  aikoHome: string,
  mode: "origin" | "override",
  activePersona: string
): Promise<PersonaRef> {
  if (mode !== "override") {
    return {
      personaPath: await firstExistingPath([
        join(aikoHome, "persona", "origin", "persona.md"),
        join(aikoHome, "persona", "aiko-origin.md"),
      ]),
      userPath: join(aikoHome, "persona", "origin", "user.md"),
      rulesPath: join(aikoHome, "persona", "origin", "rules.md"),
    };
  }
  if (activePersona) {
    const namedDir = join(aikoHome, "persona", "overrides", activePersona);
    const namedPath = await firstExistingPath(
      [join(namedDir, "persona.md"), join(aikoHome, "persona", "overrides", `${activePersona}.md`)],
      true
    );
    if (namedPath) {
      return {
        personaPath: namedPath,
        userPath: join(namedDir, "user.md"),
        rulesPath: join(namedDir, "rules.md"),
      };
    }
    // active-persona が消えていた場合はデフォルト override にフォールバック
  }
  return {
    personaPath: await firstExistingPath([
      join(aikoHome, "persona", "override", "persona.md"),
      join(aikoHome, "persona", "aiko-override.md"),
    ]),
    userPath: join(aikoHome, "persona", "override", "user.md"),
    rulesPath: join(aikoHome, "persona", "override", "rules.md"),
  };
}

async function readUser(...paths: Array<string | undefined>): Promise<{ name?: string; address?: string }> {
  for (const path of paths.filter((p): p is string => Boolean(p))) {
    let content: string;
    try {
      content = await readFile(path, "utf8");
    } catch (err) {
      if (isNotFound(err)) continue;
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
    if (result.name !== undefined || result.address !== undefined) return result;
  }
  return {};
}

async function readFirstExisting(paths: string[], optional = false): Promise<string> {
  const path = optional ? await firstExistingPath(paths, true) : await firstExistingPath(paths);
  if (!path) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  return readFile(path, "utf8");
}

async function firstExistingPath(paths: string[], optional?: false): Promise<string>;
async function firstExistingPath(paths: string[], optional: true): Promise<string | undefined>;
async function firstExistingPath(paths: string[], optional = false): Promise<string | undefined> {
  let lastNotFound: unknown;
  for (const path of paths) {
    try {
      await readFile(path, "utf8");
      return path;
    } catch (err) {
      if (!isNotFound(err)) throw err;
      lastNotFound = err;
    }
  }
  if (optional) return undefined;
  throw lastNotFound ?? Object.assign(new Error("ENOENT"), { code: "ENOENT" });
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
