// Runtime SDK の公開面。SDK 設計書 §6。

export { createRuntimeSdk, SDK_VERSION, notImplementedInR1 } from "./sdk.js";
export type { AikoRuntimeSdk, CreateRuntimeSdkOptions, RuntimeProfileStore } from "./sdk.js";
export { RuntimeSdkError, RUNTIME_ERROR_CODES, classify, notImplemented } from "./errors.js";
export type { RuntimeErrorCode, RuntimeSdkErrorInit } from "./errors.js";
export type {
  CompileInstructionsRequest,
  CompiledInstructions,
  GetProfileRequest,
  HealthRequest,
  InjectionCapability,
  InjectionPlan,
  PrepareLaunchRequest,
  RuntimeDescriptor,
  RuntimeHealth,
  RuntimeId,
  RuntimeLaunchBundle,
  RuntimeWarning,
} from "./types.js";

// 利用側（Adapter / MCP Server / CLI）が binder・core・user-context を直接
// import せずに済むよう、必要な型をここから出す。SDK 設計書 §1 は通常処理での
// 直接呼び出しを禁じており、型のためだけの import も依存として残ってしまう。
export type {
  InjectionMethod,
  RuntimeProfile,
  RuntimeId as BinderRuntimeId,
} from "@agent-aiko/binder";
export type { PersonaRepository, PersonaSnapshot } from "@agent-aiko/core";
export type { ResolvedUserContext } from "@agent-aiko/user-context";

// User Profile の置き場と版。利用側（CLI）が user-context を直接見ずに済むよう
// ここから出す。どこに置くかは「利用者を解決する」話で、SDK の担当範囲に入る。
export {
  defaultUserProfilePath,
  resolveUserProfilePath,
  USER_PROFILE_SCHEMA_VERSION,
} from "@agent-aiko/user-context";
