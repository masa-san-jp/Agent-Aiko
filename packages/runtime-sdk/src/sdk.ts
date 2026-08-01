// Aiko Runtime SDK。SDK 設計書 §6 / §23 Phase R1。
//
// **R1 の約束は「挙動を変えない」こと。** ここは既存の Binder を呼ぶ薄い層で、
// 合成の中身も hash も変えない。先に通り道だけ作っておくと、R2 以降で
// 「SDK にしたから壊れた」と「移行で壊れた」を切り分けられる。
//
// §6.2: Dependency Injection を標準とし、グローバルな active user / active persona /
// current project を保持しない。ここも受け取ったものだけで動く。

import { hashObject, type PersonaRepository } from "@agent-aiko/core";
import type { ResolvedUserContext } from "@agent-aiko/user-context";
import { CapabilityRegistry } from "@agent-aiko/capability-registry";
import {
  RuntimeProfileBinder,
  type InjectionMethod,
  type RuntimeId as BinderRuntimeId,
  type RuntimeProfile,
} from "@agent-aiko/binder";
import { classify, featureUnavailable, notImplemented, RuntimeSdkError } from "./errors.js";
import { HybridPolicyEngine, type HybridEvaluateOptions, type HybridPolicyEngineOptions } from "./policy/hybrid-engine.js";
import { DeterministicResponseValidator } from "./policy/validator.js";
import type { ActionDecision, EvaluateActionRequest } from "./policy/action.js";
import type { ResponseValidation, ValidateResponseRequest } from "./policy/response.js";
import type {
  CompileInstructionsRequest,
  CompiledInstructions,
  GetProfileRequest,
  HealthRequest,
  InjectionPlan,
  PrepareLaunchRequest,
  RuntimeHealth,
  RuntimeLaunchBundle,
  RuntimeId,
} from "./types.js";

export const SDK_VERSION = "0.1.0";

export interface CreateRuntimeSdkOptions {
  /** 省略すると personaRepository から自分で組む。呼び出し側が Binder を
   *  import しなくて済むようにするため（SDK 設計書 §1・§23 R2 の完了基準）。 */
  binder?: RuntimeProfileBinder;
  personaRepository: PersonaRepository;
  capabilityRegistry?: CapabilityRegistry;
  /** User Context の解決結果。SDK は取得の仕方を決めない（§6.2）。 */
  user: ResolvedUserContext;
  /** 合成済み Profile の置き場。渡さなければ SDK 内に持つ。 */
  profileStore?: RuntimeProfileStore;
  /** 時刻。決定性の検証で固定できるようにしてある（§14）。 */
  clock?: () => Date;
  /** Policy Engine の設定。渡さなければ evaluateAction は機能なしを返す（R7 §9）。 */
  policy?: Omit<HybridPolicyEngineOptions, "clock"> | undefined;
  /** Response Validator の設定。照合元の Profile は SDK の置き場から引く（R7 §6）。 */
  responseValidation?: { policyBundleHash?: string } | undefined;
}

export interface RuntimeProfileStore {
  put(profile: RuntimeProfile): void;
  get(profileId: string): RuntimeProfile | undefined;
}

/** 既定の置き場。プロセス内にのみ持つ（§15.3 は秘密の永続化を禁じている）。 */
class MemoryProfileStore implements RuntimeProfileStore {
  readonly #items = new Map<string, RuntimeProfile>();
  put(profile: RuntimeProfile): void {
    this.#items.set(profile.profile_id, profile);
  }
  get(profileId: string): RuntimeProfile | undefined {
    return this.#items.get(profileId);
  }
}

/** SDK の RuntimeId と Binder の RuntimeId は綴りが違う（antigravity /
 *  antigravity-cli、generic-mcp / generic-mcp-host）。ここで1箇所に閉じる。 */
const TO_BINDER_RUNTIME: Record<RuntimeId, BinderRuntimeId> = {
  "claude-code": "claude-code",
  codex: "codex",
  antigravity: "antigravity-cli",
  "generic-mcp": "generic-mcp-host",
};

/** §7.3 の申告から、実際に使う手段を決める。SDK 側で手段を発明しない。 */
function planInjection(
  request: PrepareLaunchRequest,
): { plan: InjectionPlan; level: 1 | 2 } | RuntimeSdkError {
  const system = request.injectionCapability.systemLevel;
  if (system.length > 0) {
    return { plan: { method: system[0] as InjectionMethod, level: "system" }, level: 2 };
  }
  if (request.requestedConsistencyLevel === 2) {
    // §9.3: Level 2 を要求されて system 級が無いとき、会話級へ格下げして
    // 起動しない。格下げは「人格を適用できた」と言えない。
    return new RuntimeSdkError({
      code: "AIKO_RUNTIME_INJECTION_UNSUPPORTED",
      userMessage: "Level 2 を要求されましたが、system 級の注入手段が申告されていません",
      remediation:
        "Adapter が使える system 級の手段を injectionCapability.systemLevel に列挙するか、requestedConsistencyLevel を 1 にしてください",
      component: "runtime-sdk",
      requestId: request.requestId,
    });
  }
  const conversation = request.injectionCapability.conversationLevel ?? [];
  return {
    plan: { method: (conversation[0] ?? "none") as InjectionMethod, level: "conversation" },
    level: 1,
  };
}

export interface AikoRuntimeSdk {
  prepareLaunch(request: PrepareLaunchRequest): Promise<RuntimeLaunchBundle>;
  getProfile(request: GetProfileRequest): Promise<RuntimeProfile>;
  compileInstructions(request: CompileInstructionsRequest): Promise<CompiledInstructions>;
  health(request?: HealthRequest): Promise<RuntimeHealth>;
  /** R7 §7.1。Policy Engine が無ければ AIKO_RUNTIME_FEATURE_UNAVAILABLE（§9）。 */
  evaluateAction(request: EvaluateActionRequest, options?: HybridEvaluateOptions): Promise<ActionDecision>;
  /** R7 §7.3。Response Validator が無ければ AIKO_RUNTIME_FEATURE_UNAVAILABLE（§9）。 */
  validateResponse(request: ValidateResponseRequest): Promise<ResponseValidation>;
}

export function createRuntimeSdk(options: CreateRuntimeSdkOptions): AikoRuntimeSdk {
  const store = options.profileStore ?? new MemoryProfileStore();
  // R7 §9: 起動の必須条件にしない。渡されなければ機能なしとして返す。
  const policyEngine = options.policy
    ? new HybridPolicyEngine({ ...options.policy, ...(options.clock ? { clock: options.clock } : {}) })
    : undefined;
  const responseValidator = options.responseValidation
    ? new DeterministicResponseValidator({
        resolveProfile: (profileId) => store.get(profileId),
        ...options.responseValidation,
        ...(options.clock ? { clock: options.clock } : {}),
      })
    : undefined;
  const now = options.clock ?? (() => new Date());
  const binder =
    options.binder ??
    new RuntimeProfileBinder({
      personaRepository: options.personaRepository,
      capabilityRegistry: options.capabilityRegistry ?? new CapabilityRegistry(),
    });

  const bind = async (
    requestId: string,
    personaId: string,
    runtime: RuntimeId,
    injectionMethod: InjectionMethod | undefined,
    capabilityManifest: unknown,
    outputPrefix: string | undefined,
  ): Promise<RuntimeProfile> => {
    try {
      return await binder.bind(
        {
          persona: { id: personaId },
          runtime: {
            id: TO_BINDER_RUNTIME[runtime],
            ...(injectionMethod && injectionMethod !== "none" ? { injectionMethod } : {}),
          },
          ...(capabilityManifest === undefined ? {} : { capabilityManifest }),
          ...(outputPrefix ? { outputPrefix } : {}),
        },
        options.user,
      );
    } catch (err) {
      throw classify(err, requestId);
    }
  };

  return {
    async prepareLaunch(request) {
      const planned = planInjection(request);
      if (planned instanceof RuntimeSdkError) throw planned;

      const profile = await bind(
        request.requestId,
        request.personaRef.personaId,
        request.runtime.id,
        planned.plan.method,
        request.capabilityManifest,
        request.outputPrefix,
      );
      store.put(profile);

      const compiled: CompiledInstructions = {
        targetRuntime: request.runtime.id,
        content: profile.instructions,
        // 本文の hash は profile_hash とは別物。前者は「注入した文が同じか」、
        // 後者は「合成の入力が同じか」を見る（§14）。
        contentHash: hashObject({ content: profile.instructions }),
        format: "markdown",
        personaVersion: profile.persona.version,
        compilerVersion: SDK_VERSION,
      };

      // §9.2: 除外した能力は黙って落とさない。
      const warnings = profile.excluded_capabilities.map((e) => ({
        code: "AIKO_RUNTIME_CAPABILITY_EXCLUDED",
        subject: e.id,
        reason: e.reason,
        impact: "この能力は使えません",
      }));

      return {
        bundleId: hashObject({ profile: profile.profile_id, requestId: request.requestId }).slice(0, 16),
        requestId: request.requestId,
        profile,
        compiledInstructions: compiled,
        injectionPlan: planned.plan,
        consistencyLevel: planned.level,
        warnings,
        createdAt: now().toISOString(),
      };
    },

    async getProfile(request) {
      const profile = store.get(request.profileId);
      if (!profile) {
        throw new RuntimeSdkError({
          code: "AIKO_RUNTIME_BIND_FAILED",
          userMessage: "その profile_id の Runtime Profile は見つかりません",
          remediation: "prepareLaunch で合成してから参照してください",
          component: "profile-store",
          requestId: request.requestId,
          details: { profileId: request.profileId },
        });
      }
      return profile;
    },

    async compileInstructions(request) {
      const profile = await bind(
        request.requestId,
        request.personaRef.personaId,
        request.runtime.id,
        undefined,
        undefined,
        undefined,
      );
      return {
        targetRuntime: request.runtime.id,
        content: profile.instructions,
        contentHash: hashObject({ content: profile.instructions }),
        format: "markdown",
        personaVersion: profile.persona.version,
        compilerVersion: SDK_VERSION,
      };
    },

    async evaluateAction(request, evaluateOptions) {
      if (policyEngine === undefined) throw featureUnavailable("evaluateAction", request.requestId);
      return policyEngine.evaluate(request, evaluateOptions ?? {});
    },

    async validateResponse(request) {
      if (responseValidator === undefined) {
        throw featureUnavailable("validateResponse", request.requestId);
      }
      return responseValidator.validate(request);
    },

    async health(request) {
      const personaId = request?.personaId ?? "aiko";
      try {
        const persona = await options.personaRepository.load({ id: personaId });
        const invariantsPresent = persona.invariants.trim().length > 0;
        return {
          status: invariantsPresent ? "ok" : "degraded",
          persona: { id: persona.id, version: persona.version, invariantsPresent },
          ...(invariantsPresent ? {} : { reason: "不変条項が空です" }),
        };
      } catch (err) {
        const sdkError = classify(err, request?.requestId ?? "");
        // health は投げない。「不健全である」を返すのが仕事なので。
        return { status: "unavailable", reason: sdkError.userMessage };
      }
    },
  };
}

/** 仕様にあるが R1 では作らないもの。呼ばれたら理由を返す。 */
export const notImplementedInR1 = {
  verifyInjection: () => Promise.reject(notImplemented("verifyInjection")),
  rebind: () => Promise.reject(notImplemented("rebind")),
  diagnostics: () => Promise.reject(notImplemented("diagnostics")),
};
