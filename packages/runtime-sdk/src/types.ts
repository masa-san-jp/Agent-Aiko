// Runtime SDK の型。SDK 設計書 §7。
//
// R1 は「既存 Binder を呼ぶ薄い層」で、挙動を変えない。したがってここに置くのは
// **R1 で実際に使う型だけ**にする。仕様書には Permission や Policy の型もあるが、
// 実装が無いまま型だけ並べると、使えるように見えて使えないものが増える。

import type { InjectionMethod, RuntimeProfile } from "@agent-aiko/binder";

export type RuntimeId = "claude-code" | "codex" | "antigravity" | "generic-mcp";

/** §7.2。R1 で使うのは id と version。 */
export interface RuntimeDescriptor {
  id: RuntimeId;
  version: string;
}

/** §7.3。Adapter が「自分は何で注入できるか」を申告する。
 *  SDK 側で推測しない——推測すると、注入できないのにできることにされる。 */
export interface InjectionCapability {
  /** system / developer 級に置ける手段。空なら Level 2 に到達しない。 */
  systemLevel: InjectionMethod[];
  /** 会話の先頭に置くしかない場合の手段。 */
  conversationLevel?: InjectionMethod[];
}

/** §7.1。R1 では permissionInput / taskContext は受け取るが使わない。
 *  受け取れる形だけ先に決めておくと、R2 以降で呼び出し側を変えずに済む。 */
export interface PrepareLaunchRequest {
  requestId: string;
  personaRef: { personaId: string; version?: string };
  userRef: { userId: string };
  runtime: RuntimeDescriptor;
  capabilityManifest?: unknown;
  injectionCapability: InjectionCapability;
  requestedConsistencyLevel: 1 | 2;
  outputPrefix?: string;
}

/** §7.5。R1 は Binder が作った instructions をそのまま載せる。 */
export interface CompiledInstructions {
  targetRuntime: string;
  content: string;
  contentHash: string;
  format: "plain-text" | "markdown" | "json";
  personaVersion: string;
  compilerVersion: string;
}

/** §7.6。どの手段で注入するかを決めた結果。 */
export interface InjectionPlan {
  method: InjectionMethod;
  /** system 級か会話級か。Level 2 を名乗れるのは system 級のときだけ。 */
  level: "system" | "conversation";
}

/** §9.2。止めないが黙らない、の記録。 */
export interface RuntimeWarning {
  code: string;
  subject: string;
  reason: string;
  impact: string;
}

/** §7.4。 */
export interface RuntimeLaunchBundle {
  bundleId: string;
  requestId: string;
  profile: RuntimeProfile;
  compiledInstructions: CompiledInstructions;
  injectionPlan: InjectionPlan;
  consistencyLevel: 1 | 2;
  warnings: RuntimeWarning[];
  createdAt: string;
}

export interface GetProfileRequest {
  requestId: string;
  profileId: string;
}

export interface CompileInstructionsRequest {
  requestId: string;
  personaRef: { personaId: string };
  userRef: { userId: string };
  runtime: RuntimeDescriptor;
}

export interface HealthRequest {
  requestId?: string;
  personaId?: string;
}

export interface RuntimeHealth {
  status: "ok" | "degraded" | "unavailable";
  persona?: { id: string; version: string; invariantsPresent: boolean };
  /** 読めなかった理由。status が ok 以外のとき必ず入る。 */
  reason?: string;
}
