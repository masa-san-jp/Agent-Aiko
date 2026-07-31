// Codex 向け Runtime Adapter。設計書 §8.2 / §3.4。
//
// Codex は `thread/start` の `baseInstructions` に人格を渡す。スレッドが生きて
// いる間は固定され、ターン単位で上書きできない——Level 2 が要求する「起動前に
// 入れて、途中で外せない」をそのまま満たす。既存 codex/src/aiko-prompt-builder.ts
// が実現している方式で、本 Adapter はその組み立てを Core へ移す。
//
// Claude Code 側と違い、ここではファイルを書かない。Codex は文字列を受け取る
// ので、ディスクに落とす必要がない。呼び方などの利用者情報を書き出さずに済む
// なら、書き出さないほうが安全（§11.2）。

import {
  createRuntimeSdk,
  RuntimeSdkError,
  type PersonaRepository,
  type ResolvedUserContext,
  type RuntimeProfile,
} from "@agent-aiko/runtime-sdk";

export interface PrepareOptions {
  personaRepository: PersonaRepository;
  user: ResolvedUserContext;
  personaId?: string;
  capabilityManifest?: unknown;
  outputPrefix?: string;
}

export interface PreparedThread {
  /** `thread/start` の baseInstructions に渡す文字列。 */
  baseInstructions: string;
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

/** スレッド開始に必要なものを用意する。スレッドは開始しない。
 *  「文字列を作る」と「スレッドを張る」を分けると、通信せずに中身を検証できる。 */
export async function prepareThread(options: PrepareOptions): Promise<PreparedThread> {
  // R4: Binder を直接呼ばず Runtime SDK を通す（SDK 設計書 §1・§23 R4）。
  const sdk = createRuntimeSdk({
    personaRepository: options.personaRepository,
    user: options.user,
  });

  let profile: RuntimeProfile;
  try {
    const bundle = await sdk.prepareLaunch({
      requestId: `codex-${Date.now()}`,
      personaRef: { personaId: options.personaId ?? "aiko" },
      userRef: { userId: options.user.context.id },
      runtime: { id: "codex", version: "1" },
      // §17.1: Adapter が使える注入手段を申告する。SDK に推測させない。
      injectionCapability: { systemLevel: ["codex:base-instructions"] },
      requestedConsistencyLevel: 2,
      ...(options.capabilityManifest === undefined
        ? {}
        : { capabilityManifest: options.capabilityManifest }),
      ...(options.outputPrefix ? { outputPrefix: options.outputPrefix } : {}),
    });
    profile = bundle.profile;
  } catch (err) {
    // 合成できないならスレッドを張らせない。部分的な結果を返すと、呼び出し側が
    // 人格なしでスレッドを開始できてしまう（§3.4）。
    // §10.3: SDK のエラーコードを別の意味へ置き換えない。
    throw new AdapterError(
      `人格を合成できなかったため Codex スレッドを開始しません: ${
        err instanceof RuntimeSdkError
          ? err.userMessage
          : err instanceof Error
            ? err.message
            : String(err)
      }`,
      { stage: "binding" },
    );
  }

  return { baseInstructions: profile.instructions, profile };
}
