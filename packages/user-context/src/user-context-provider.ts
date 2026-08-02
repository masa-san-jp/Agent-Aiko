// User Context Provider。設計書 §5.4 / §6.2。
//
// User Profile を読み、Compiler が使う最小の情報だけを渡す。§5.4 が「ユーザー
// 許可に基づく最小情報」と定めているので、Profile 全体をそのまま下流へ流さない。
// privacy と memory_namespace は指示文に載せるものではないため、UserContext には
// 含めず、必要な判断（外部送信の可否など）は Provider の戻り値で別に持つ。
//
// User Profile を解決できないのは §6.5 の fail-closed 条件。既定値で埋めて続行
// すると、誰のものか分からない関係情報で人格が立ち上がる。

import { readFile } from "node:fs/promises";
import { byteLength, checkSchemaVersion, INPUT_LIMITS, type UserContext } from "@agent-aiko/core";
import type { UserMarkdown } from "./user-markdown.js";

/** User Profile の現行 schema_version。増やすときは §10.3.1 の受理範囲も動く。 */
export const USER_PROFILE_SCHEMA_VERSION = 1;

export interface ResolvedUserContext {
  /** Compiler へ渡す最小情報。 */
  context: UserContext;
  /** 記憶の置き場所への参照。本体は持たない（§1.3 非目的）。 */
  memoryNamespace?: string;
  /** 外部送信の可否。既定はすべて拒否（§3.4・§11.2）。 */
  privacy: { allowRemotePersonaService: boolean; allowUsageTelemetry: boolean };
}

export class UserProfileError extends Error {
  override readonly name = "UserProfileError";

  constructor(
    message: string,
    readonly detail: { path?: string | undefined; userId?: string | undefined },
  ) {
    super(message);
  }
}

export interface UserContextProviderOptions {
  /** 判定に使う現行 schema_version。既定は USER_PROFILE_SCHEMA_VERSION。 */
  currentSchemaVersion?: number;
}

export class UserContextProvider {
  readonly #currentSchemaVersion: number;

  constructor(options: UserContextProviderOptions = {}) {
    this.#currentSchemaVersion = options.currentSchemaVersion ?? USER_PROFILE_SCHEMA_VERSION;
  }

  /** ファイルから読む。不在・壊れている・版が範囲外なら例外（§6.5）。 */
  async loadFromFile(path: string): Promise<ResolvedUserContext> {
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch (err) {
      if (isNotFound(err)) {
        throw new UserProfileError("User Profile が見つかりません", { path });
      }
      throw err;
    }
    // §21 の最大入力。JSON へ起こす前に断る——大きいものを parse してから
    // 断ると、断るために一番重い処理を通すことになる。
    if (byteLength(raw) > INPUT_LIMITS.userProfile) {
      throw new UserProfileError(
        `User Profile が上限を超えています（上限 ${INPUT_LIMITS.userProfile} bytes）`,
        { path },
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new UserProfileError("User Profile を JSON として読めません", { path });
    }
    return this.resolve(parsed, path);
  }

  /** user.md を重ねる。**user.md が書いている項目だけ**を上書きする。
   *  user.md は会話でアイコが書くもの、JSON は `aiko configure` が書くもので、
   *  どちらも消さずに済むようにこの形にした（片方を無視すると、設定したのに
   *  効かない項目ができる）。 */
  withMarkdown(base: ResolvedUserContext, md: UserMarkdown): ResolvedUserContext {
    const preferredName = md.address ?? md.name;
    return {
      ...base,
      context: {
        ...base.context,
        ...(preferredName ? { preferredName } : {}),
      },
      // 記憶は場所の参照だけ。中身はここでも下流でも開かない（§1.3）。
      ...(md.memory ? { memoryNamespace: md.memory } : {}),
    };
  }

  /** 読み込み済みの値から解決する。検証はここに集約する。 */
  resolve(profile: unknown, path?: string): ResolvedUserContext {
    if (typeof profile !== "object" || profile === null || Array.isArray(profile)) {
      throw new UserProfileError("User Profile がオブジェクトではありません", { path });
    }
    const p = profile as Record<string, unknown>;

    const verdict = checkSchemaVersion(
      typeof p["schema_version"] === "number" ? (p["schema_version"] as number) : Number.NaN,
      this.#currentSchemaVersion,
    );
    if (!verdict.accepted) {
      throw new UserProfileError(`User Profile を読めません: ${verdict.reason}`, { path });
    }

    const userId = p["user_id"];
    if (typeof userId !== "string" || userId.length === 0) {
      throw new UserProfileError("User Profile に user_id がありません", { path });
    }

    const identity = asRecord(p["identity"]);
    const communication = asRecord(p["communication"]);
    const relationship = asRecord(p["relationship"]);
    const privacy = asRecord(p["privacy"]);

    const context: UserContext = { id: userId };
    const preferredName = identity?.["preferred_name"];
    if (typeof preferredName === "string" && preferredName.length > 0) {
      context.preferredName = preferredName;
    }
    // 値が入っているのに既知でないものは黙って捨てない。捨てると、利用者は
    // 設定したつもりで効いていない状態に置かれ、しかもそれに気付けない。
    // スキーマ側も enum で弾く（§6.2）ので、ここで通すと二重基準になる。
    const language = communication?.["language"];
    if (language !== undefined) {
      if (typeof language !== "string" || language.length === 0) {
        throw new UserProfileError("User Profile の language が不正です", { path });
      }
      context.language = language;
    }
    const verbosity = communication?.["verbosity"];
    if (verbosity !== undefined) {
      if (!isVerbosity(verbosity)) {
        throw new UserProfileError(
          `User Profile の verbosity が不正です（${String(verbosity)}）。concise / normal / detailed のいずれかです`,
          { path },
        );
      }
      context.verbosity = verbosity;
    }
    const directness = communication?.["directness"];
    if (directness !== undefined) {
      if (!isDirectness(directness)) {
        throw new UserProfileError(
          `User Profile の directness が不正です（${String(directness)}）。low / medium / high のいずれかです`,
          { path },
        );
      }
      context.directness = directness;
    }

    const memoryNamespace = relationship?.["memory_namespace"];

    return {
      context,
      ...(typeof memoryNamespace === "string" && memoryNamespace.length > 0
        ? { memoryNamespace }
        : {}),
      // 既定は拒否。項目が無い Profile を「許可されている」と読まない。
      privacy: {
        allowRemotePersonaService: privacy?.["allow_remote_persona_service"] === true,
        allowUsageTelemetry: privacy?.["allow_usage_telemetry"] === true,
      },
    };
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isVerbosity(v: unknown): v is NonNullable<UserContext["verbosity"]> {
  return v === "concise" || v === "normal" || v === "detailed";
}

function isDirectness(v: unknown): v is NonNullable<UserContext["directness"]> {
  return v === "low" || v === "medium" || v === "high";
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}
