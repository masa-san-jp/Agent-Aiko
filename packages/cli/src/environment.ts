// CLI が見る場所。MCP サーバー（packages/mcp-server/src/server.ts）と同じ環境変数を
// 同じ既定で読む。ここがずれると `aiko doctor` が「問題なし」と言った構成で
// サーバーが起動に失敗する、という最悪の食い違いになる。

import { homedir } from "node:os";
import { join } from "node:path";

export interface Environment {
  aikoHome: string;
  /** User Profile の場所。未設定なら既定値で解決する（サーバーと同じ挙動）。 */
  userProfilePath?: string;
  personaId: string;
}

export function resolveEnvironment(env: NodeJS.ProcessEnv = process.env): Environment {
  const userProfilePath = env["AIKO_USER_PROFILE"];
  return {
    aikoHome: env["AIKO_HOME"] ?? join(homedir(), ".aiko"),
    ...(userProfilePath ? { userProfilePath } : {}),
    personaId: env["AIKO_PERSONA_ID"] ?? "aiko",
  };
}
