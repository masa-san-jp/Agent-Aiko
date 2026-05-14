// override-history.jsonl への追記を扱う小ユーティリティ。
//
// 設計の正本: Agent-Lab/Agent-team/agents/aiko/dev-docs/2026-05-05-Agent-Aiko-Codex-design.md v0.3.1 §6.4 の
//   "/aiko-override" コマンド仕様

import { appendFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface OverrideHistoryEntry {
  /** ISO8601 タイムスタンプ。 */
  ts: string;
  /** "override" / "reset" 等のアクション種別。 */
  action: "override" | "reset" | "mode-set";
  /** ユーザー指示（reset / mode-set では空文字でよい）。 */
  instruction: string;
  /** 変更点の 1 行サマリ（省略可）。 */
  summary?: string;
}

/** ~/.aiko/override-history.jsonl に 1 行追記する。 */
export async function appendOverrideHistory(
  entry: OverrideHistoryEntry,
  aikoHome?: string
): Promise<void> {
  const home = aikoHome ?? join(homedir(), ".aiko");
  const path = join(home, "override-history.jsonl");
  const minimal: Record<string, string> = {
    ts: entry.ts,
    action: entry.action,
    instruction: entry.instruction,
  };
  if (entry.summary !== undefined) minimal["summary"] = entry.summary;
  await appendFile(path, `${JSON.stringify(minimal)}\n`, { encoding: "utf8" });
}
