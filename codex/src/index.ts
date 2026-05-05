// Agent-Aiko for Codex — public package entry.
//
// 設計の正本: 2026-05-05-Agent-Aiko-Codex-design.md（masa-san-jp/Agent-Aiko-dev リポ） v0.3.1

import { CLIENT_VERSION } from "./codex-client/codex-client.js";

export const PACKAGE = "@agent-aiko/codex" as const;
/** 単一情報源：codex-client.ts の CLIENT_VERSION を再エクスポート。
 *  package.json と initialize で送る clientInfo.version の同期は CLIENT_VERSION で取る。 */
export const VERSION = CLIENT_VERSION;
export const PHASE = "phase-6-installer" as const;

export { CodexClient } from "./codex-client/index.js";
export type {
  AccountInfo,
  AskOptions,
  AskResult,
  CodexClientOptions,
  StartThreadOptions,
} from "./codex-client/index.js";

export { loadPersona } from "./aiko-persona-loader.js";
export type { AikoPersonaSnapshot, LoadPersonaOptions } from "./aiko-persona-loader.js";

export { buildBaseInstructions } from "./aiko-prompt-builder.js";

export { AikoRuntime } from "./aiko-runtime.js";
export type { AikoRuntimeOptions, AikoAskOptions } from "./aiko-runtime.js";

export { AikoCommandRouter, parseSlashCommand, KNOWN_COMMANDS } from "./aiko-command-router.js";
export type {
  AikoCommandRouterOptions,
  CommandResult,
  ParsedSlashCommand,
} from "./aiko-command-router.js";

export { appendOverrideHistory } from "./aiko-history.js";
export type { OverrideHistoryEntry } from "./aiko-history.js";
