// CLI が見る場所。MCP サーバー（packages/mcp-server/src/server.ts）と同じ環境変数を
// 同じ既定で読む。ここがずれると `aiko doctor` が「問題なし」と言った構成で
// サーバーが起動に失敗する、という最悪の食い違いになる。

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveUserProfilePath } from "@agent-aiko/core";

export interface Environment {
  aikoHome: string;
  /** User Profile の場所。未設定なら既定値で解決する（サーバーと同じ挙動）。 */
  userProfilePath?: string;
  personaId: string;
}

export function resolveEnvironment(env: NodeJS.ProcessEnv = process.env): Environment {
  const aikoHome = env["AIKO_HOME"] ?? join(homedir(), ".aiko");
  // 明示指定が無くても、configure が置いた既定のファイルがあれば拾う。
  // 無ければ undefined＝従来どおり既定値で動く。
  const userProfilePath = resolveUserProfilePath(aikoHome, env["AIKO_USER_PROFILE"], existsSync);
  return {
    aikoHome,
    ...(userProfilePath ? { userProfilePath } : {}),
    personaId: env["AIKO_PERSONA_ID"] ?? "aiko",
  };
}
