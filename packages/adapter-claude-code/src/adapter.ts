// Claude Code 向け Runtime Adapter。設計書 §8.1 / §3.4。
//
// 合成した人格を system 級の指示として Claude Code へ渡す。手段は §8.5 で実測
// 確認済みの `--system-prompt-file` / `--append-system-prompt-file`。
//
// CLAUDE.md には触らない。§8.1 が「既存 CLAUDE.md を上書きしない」と定めている
// うえ、ファイルを書き換えずに済む手段があるなら、そもそも触る理由がない。
//
// Binding に失敗したら起動用の引数を作らない（§3.4 Fail Closed）。人格が無い
// まま claude が立ち上がったら、それは Aiko ではない。

import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createRuntimeSdk,
  RuntimeSdkError,
  type InjectionMethod,
  type PersonaRepository,
  type ResolvedUserContext,
  type RuntimeProfile,
} from "@agent-aiko/runtime-sdk";

/** 既定の注入手段。base を置き換える側を使う。 */
export const DEFAULT_INJECTION: InjectionMethod = "claude-code:system-prompt-file";

export interface PrepareOptions {
  personaRepository: PersonaRepository;
  user: ResolvedUserContext;
  personaId?: string;
  capabilityManifest?: unknown;
  outputPrefix?: string;
  /** 既定の人格指示を置き換えるか、後ろに足すか。 */
  mode?: "replace" | "append";
  /** 指示文を書き出すディレクトリ。既定は $XDG_RUNTIME_DIR か os の一時領域。 */
  stateDir: string;
}

export interface PreparedLaunch {
  /** claude に渡す引数。実行はしない。 */
  args: string[];
  /** 書き出した指示文のパス（0600）。 */
  instructionsPath: string;
  profile: RuntimeProfile;
}

export class AdapterError extends Error {
  override readonly name = "AdapterError";

  constructor(
    message: string,
    readonly detail: { stage: string },
  ) {
    super(message);
  }
}

/** 起動に必要なものを用意する。ここでは claude を起動しない。
 *  「引数を作る」と「起動する」を分けておくと、起動せずに中身を検証できる。 */
export async function prepareLaunch(options: PrepareOptions): Promise<PreparedLaunch> {
  const mode = options.mode ?? "replace";
  const injectionMethod: InjectionMethod =
    mode === "append"
      ? "claude-code:append-system-prompt-file"
      : "claude-code:system-prompt-file";

  // R3: Binder を直接呼ばず Runtime SDK を通す（SDK 設計書 §1・§23 R3）。
  // Adapter はホスト固有の処理（引数の組み立てとファイル書き出し）だけを持つ。
  const sdk = createRuntimeSdk({
    personaRepository: options.personaRepository,
    user: options.user,
  });

  let profile: RuntimeProfile;
  try {
    const bundle = await sdk.prepareLaunch({
      requestId: `claude-code-${Date.now()}`,
      personaRef: { personaId: options.personaId ?? "aiko" },
      userRef: { userId: options.user.context.id },
      runtime: { id: "claude-code", version: "1" },
      // §17.1: Adapter は自分が使える注入手段を申告する。SDK に推測させない。
      injectionCapability: { systemLevel: [injectionMethod] },
      requestedConsistencyLevel: 2,
      ...(options.capabilityManifest === undefined
        ? {}
        : { capabilityManifest: options.capabilityManifest }),
      ...(options.outputPrefix ? { outputPrefix: options.outputPrefix } : {}),
    });
    profile = bundle.profile;
  } catch (err) {
    // 合成できないなら引数を作らない。呼び出し側が「とりあえず起動」できないよう、
    // 部分的な結果を返さず例外で止める（§3.4）。
    // §10.3: SDK のエラーコードを別の意味へ置き換えない。理由はそのまま伝える。
    throw new AdapterError(
      `人格を合成できなかったため Claude Code を起動しません: ${
        err instanceof RuntimeSdkError
          ? err.userMessage
          : err instanceof Error
            ? err.message
            : String(err)
      }`,
      { stage: "binding" },
    );
  }

  const instructionsPath = await writeInstructions(options.stateDir, profile);

  const flag =
    injectionMethod === "claude-code:append-system-prompt-file"
      ? "--append-system-prompt-file"
      : "--system-prompt-file";

  return { args: [flag, instructionsPath], instructionsPath, profile };
}

/** 指示文をファイルへ書く。§11.3 が Runtime Profile を 0600 と定めている。
 *  指示文には呼称など利用者の情報が入るため、他ユーザーから読めてはいけない。 */
async function writeInstructions(stateDir: string, profile: RuntimeProfile): Promise<string> {
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  // profile_id をファイル名にすると、同じ合成結果は同じファイルに落ちる。
  const path = join(stateDir, `runtime-profile-${profile.profile_id}.md`);
  await writeFile(path, profile.instructions, { encoding: "utf8", mode: 0o600 });
  // mkdir/writeFile の mode は umask に削られる。作った後に明示的に締め直す。
  await chmod(path, 0o600);
  return path;
}
