// CLI の組み立て口。SDK 設計書 §1・§23 R5。
//
// 実体（Persona Repository / User Context Provider）を作るのはここだけ。
// 人格を適用する処理（status / doctor）は SDK だけを見る。
//
// この1ファイルが「入口」として直接 import を許される代わりに、他のファイルは
// 許されない。tests/no-direct-imports がその線を見張る。

import { FileSystemPersonaRepository } from "@agent-aiko/core";
import { UserContextProvider, UserProfileError } from "@agent-aiko/user-context";
import { createRuntimeSdk, type AikoRuntimeSdk } from "@agent-aiko/runtime-sdk";
import type { Environment } from "./environment.js";

export interface Opened {
  sdk: AikoRuntimeSdk;
  /** User Profile を読めたか。読めなければ理由。 */
  userError?: string;
  userId: string;
}

/** 環境から SDK を1つ作る。User Profile が読めない場合も、理由を持ったまま返す
 *  ——status も doctor も「読めなかったこと」を表示する必要があるため、ここで
 *  例外にして握り潰さない。 */
export async function openEnvironment(env: Environment): Promise<Opened> {
  const personaRepository = new FileSystemPersonaRepository({ aikoHome: env.aikoHome });
  const provider = new UserContextProvider();

  let user;
  let userError: string | undefined;
  try {
    user = env.userProfilePath
      ? await provider.loadFromFile(env.userProfilePath)
      : provider.resolve({ schema_version: 1, user_id: "default" });
  } catch (err) {
    userError = err instanceof UserProfileError || err instanceof Error ? err.message : String(err);
    // 読めなくても SDK は作る。人格が読めるかどうかは別に見せたいため。
    user = provider.resolve({ schema_version: 1, user_id: "default" });
  }

  return {
    sdk: createRuntimeSdk({ personaRepository, user }),
    ...(userError ? { userError } : {}),
    userId: user.context.id,
  };
}
