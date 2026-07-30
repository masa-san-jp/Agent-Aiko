// 現行の ~/.aiko/ をそのまま読む PersonaRepository。設計書 §14 Phase 1。
//
// 既存の codex/src/aiko-persona-loader.ts が扱っているレイアウトと同じものを読む。
// 移行の第一段階では保存形式を変えないことが要件なので、ここでは manifest を要求
// しない。manifest を持つ形式は §14 Phase 2 以降で別実装として足す。
//
// 読めなかったものは黙って空にせず、必須なら PersonaResolutionError を投げる。
// 人格の一部が欠けたまま起動するのは §6.5 の fail-closed 条件に当たる。

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  PersonaResolutionError,
  type PersonaRef,
  type PersonaRepository,
  type PersonaSnapshot,
  type PersonaSource,
} from "./persona-repository.js";

export interface FileSystemPersonaRepositoryOptions {
  /** ~/.aiko/ の場所。既定は os.homedir() + "/.aiko"。 */
  aikoHome?: string;
  /** 版を持たない現行レイアウトを読むときに名乗る版。既定 "0.0.0"。 */
  assumedVersion?: string;
}

type Mode = "origin" | "override";

export class FileSystemPersonaRepository implements PersonaRepository {
  readonly #aikoHome: string;
  readonly #assumedVersion: string;

  constructor(options: FileSystemPersonaRepositoryOptions = {}) {
    this.#aikoHome = options.aikoHome ?? join(homedir(), ".aiko");
    this.#assumedVersion = options.assumedVersion ?? "0.0.0";
  }

  async load(ref: PersonaRef): Promise<PersonaSnapshot> {
    const mode = await this.#readMode();
    const activePersona = mode === "override" ? await this.#readActivePersona() : "";
    const dirs = this.#candidateDirs(mode, activePersona);

    const sources: PersonaSource[] = [];
    const identity = await this.#readFirst(
      this.#candidatePersonaFiles(mode, activePersona),
      ref,
      "identity-core",
    );
    sources.push({ part: "identity-core", location: identity.path });

    // 不変条項はモードや人格に依らず共通。欠落は起動させない（§6.5）。
    const invariants = await this.#readFirst(
      [join(this.#aikoHome, "INVARIANTS.md"), join(this.#aikoHome, "persona", "INVARIANTS.md")],
      ref,
      "invariants",
    );
    sources.push({ part: "invariants", location: invariants.path });

    // 判断原則は無い環境がある。空でも起動はできるため必須にしない。
    const contract = await this.#readOptionalFirst([
      ...dirs.map((d) => join(d, "rules.md")),
      join(this.#aikoHome, "capability", "rules", "rules-base.md"),
    ]);
    if (contract) sources.push({ part: "behavioral-contract", location: contract.path });

    return {
      id: ref.id,
      version: ref.version ?? this.#assumedVersion,
      identityCore: identity.content,
      invariants: invariants.content,
      behavioralContract: contract?.content ?? "",
      sources,
    };
  }

  /** mode / active-persona から人格ディレクトリの候補を優先順に並べる。
   *  active-persona が消えていた場合に既定 override へ落ちられるよう、候補は複数返す。 */
  #candidateDirs(mode: Mode, activePersona: string): string[] {
    const personaRoot = join(this.#aikoHome, "persona");
    if (mode !== "override") return [join(personaRoot, "origin")];
    const dirs: string[] = [];
    if (activePersona) dirs.push(join(personaRoot, "overrides", activePersona));
    dirs.push(join(personaRoot, "override"));
    return dirs;
  }

  /** 人格本文の候補を優先順に並べる。
   *  ディレクトリ型（persona/origin/persona.md 等）を先に見て、見つからなければ旧
   *  フラット型（persona/aiko-origin.md・persona/overrides/<slug>.md）へ落ちる。
   *  旧型を落とすと、まだ移行していない既存インストールが起動時に fail closed する。
   *  Phase 1 の要件は「現行のレイアウトをそのまま読む」なので、既存の loader が
   *  対応していた配置はすべて読めなければならない。 */
  #candidatePersonaFiles(mode: Mode, activePersona: string): string[] {
    const personaRoot = join(this.#aikoHome, "persona");
    if (mode !== "override") {
      return [join(personaRoot, "origin", "persona.md"), join(personaRoot, "aiko-origin.md")];
    }
    const paths: string[] = [];
    // 指定された人格を、ディレクトリ型・旧フラット型の順で先に使い切る。既定
    // override を先に見ると、旧型で置かれた指定人格が既定に食われて別人が立つ。
    if (activePersona) {
      paths.push(join(personaRoot, "overrides", activePersona, "persona.md"));
      paths.push(join(personaRoot, "overrides", `${activePersona}.md`));
    }
    paths.push(join(personaRoot, "override", "persona.md"));
    paths.push(join(personaRoot, "aiko-override.md"));
    return paths;
  }

  async #readMode(): Promise<Mode> {
    const content = await readOptional(join(this.#aikoHome, "mode"));
    // 不正値は origin として扱う（既存の起動シーケンスと同じ扱い）。
    return content?.trim() === "override" ? "override" : "origin";
  }

  async #readActivePersona(): Promise<string> {
    return (await readOptional(join(this.#aikoHome, "active-persona")))?.trim() ?? "";
  }

  async #readFirst(
    paths: string[],
    ref: PersonaRef,
    part: string,
  ): Promise<{ path: string; content: string }> {
    const found = await this.#readOptionalFirst(paths);
    if (found) return found;
    throw new PersonaResolutionError(`人格の ${part} を解決できませんでした`, {
      ref,
      searched: paths,
    });
  }

  async #readOptionalFirst(paths: string[]): Promise<{ path: string; content: string } | undefined> {
    for (const path of paths) {
      const content = await readOptional(path);
      if (content !== undefined) return { path, content };
    }
    return undefined;
  }
}

/** 不在なら undefined。それ以外の失敗（権限など）は握りつぶさず投げる。 */
async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if (isNotFound(err)) return undefined;
    throw err;
  }
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}
