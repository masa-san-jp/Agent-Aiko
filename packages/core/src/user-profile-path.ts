// User Profile の既定の置き場。ここ1箇所で決める。
//
// CLI が書いて、MCP サーバーと各 Adapter が読む。決め方が散ると
// 「configure で作ったのに読まれない」が起きる。

import { join } from "node:path";

/** AIKO_HOME 配下の既定パス。 */
export function defaultUserProfilePath(aikoHome: string): string {
  return join(aikoHome, "user-profile.json");
}

/** 明示指定（AIKO_USER_PROFILE）があればそれを、無ければ既定の置き場を返す。
 *  既定側はファイルが無ければ undefined を返す ＝ 従来どおり既定値で動く。 */
export function resolveUserProfilePath(
  aikoHome: string,
  explicit: string | undefined,
  exists: (path: string) => boolean,
): string | undefined {
  if (explicit) return explicit;
  const fallback = defaultUserProfilePath(aikoHome);
  return exists(fallback) ? fallback : undefined;
}
