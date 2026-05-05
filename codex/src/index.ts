// Agent-Aiko for Codex — public package entry.
//
// 設計の正本: dev-docs/2026-05-05-Agent-Aiko-Codex-design.md v0.3.1

import { CLIENT_VERSION } from "./codex-client/codex-client.js";

export const PACKAGE = "@agent-aiko/codex" as const;
/** 単一情報源：codex-client.ts の CLIENT_VERSION を再エクスポート。
 *  package.json と initialize で送る clientInfo.version の同期は CLIENT_VERSION で取る。 */
export const VERSION = CLIENT_VERSION;
export const PHASE = "phase-2-codex-client" as const;

export { CodexClient } from "./codex-client/index.js";
export type {
  AccountInfo,
  AskOptions,
  AskResult,
  CodexClientOptions,
  StartThreadOptions,
} from "./codex-client/index.js";
