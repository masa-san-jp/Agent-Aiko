// Runtime Profile Binder。設計書 §5.3 / §6.1 / §6.5。
//
// 人格・ユーザー・能力を集めて Runtime Profile を1つ作る。§5.3 の手順のうち、
// 本実装が持つのは「入力取得 → スキーマ検証 → 参照解決 → Runtime Profile 生成 →
// profile hash 生成 → fail-closed 判定」。最小権限化と競合解消は Permission
// Manifest を扱う段（Adapter 側）に属するため、ここでは行わない。
//
// 一番大事な性質は「合成できなければ Profile を返さない」こと。§3.4 が
// Binding 失敗時は Aiko として起動しないと定めている。部分的に欠けた Profile を
// 返すと、呼び出し側がそれを見て起動してしまう。だから欠けたら例外で止める。

import { compile, type CompiledInstructions } from "./compiler.js";
import { CapabilityRegistry, type ResolvedCapabilities } from "./capability-registry.js";
import { checkSchemaVersion } from "./schema-compatibility.js";
import type { PersonaRef, PersonaRepository } from "./persona-repository.js";
import type { ResolvedUserContext } from "./user-context-provider.js";

/** Runtime Profile の現行 schema_version。 */
export const RUNTIME_PROFILE_SCHEMA_VERSION = 1;

export type RuntimeId = "claude-code" | "codex" | "antigravity-cli" | "generic-mcp-host";

/** §8.5 で実測した注入手段だけを値に持つ。未検証の手段を Profile に名乗らせない。 */
export type InjectionMethod =
  | "claude-code:system-prompt-file"
  | "claude-code:append-system-prompt-file"
  | "codex:base-instructions"
  | "none";

/** ランタイムごとの到達可能な適合レベル（§2.1・§8.5）。 */
const CONSISTENCY_LEVEL: Record<RuntimeId, 0 | 1 | 2> = {
  "claude-code": 2,
  codex: 2,
  // system 級注入の手段が未確認。#45 で判明するまで 1 のまま（§8.3・§8.5）。
  "antigravity-cli": 1,
  // system-level instruction 注入を制御できない（§8.4）。
  "generic-mcp-host": 0,
};

export interface BindingRequest {
  persona: PersonaRef;
  runtime: { id: RuntimeId; injectionMethod?: InjectionMethod };
  capabilityManifest?: unknown;
  outputPrefix?: string;
}

export interface RuntimeProfile {
  schema_version: number;
  profile_id: string;
  profile_hash: string;
  configuration_hash: string;
  persona: { id: string; version: string };
  user_id: string;
  runtime: { id: RuntimeId; consistency_level: 0 | 1 | 2; injection_method: InjectionMethod };
  instructions: string;
  excluded_capabilities: Array<{ id: string; reason: string }>;
}

export class BindingError extends Error {
  override readonly name = "BindingError";

  constructor(
    message: string,
    readonly detail: { stage: string },
  ) {
    super(message);
    // 呼び出し側が「起動しない」判断をするための理由。握りつぶさせない。
  }
}

export interface BinderOptions {
  personaRepository: PersonaRepository;
  capabilityRegistry?: CapabilityRegistry;
  currentSchemaVersion?: number;
}

export class RuntimeProfileBinder {
  readonly #personas: PersonaRepository;
  readonly #capabilities: CapabilityRegistry;
  readonly #currentSchemaVersion: number;

  constructor(options: BinderOptions) {
    this.#personas = options.personaRepository;
    this.#capabilities = options.capabilityRegistry ?? new CapabilityRegistry();
    this.#currentSchemaVersion = options.currentSchemaVersion ?? RUNTIME_PROFILE_SCHEMA_VERSION;
  }

  async bind(request: BindingRequest, user: ResolvedUserContext): Promise<RuntimeProfile> {
    const persona = await this.#loadPersona(request);

    if (persona.invariants.trim().length === 0) {
      // §6.5 の fail-closed 条件。ファイルは在ったが中身が空、という経路がある。
      throw new BindingError("不変条項が空です。Aiko として起動できません", {
        stage: "persona-validation",
      });
    }

    const level = CONSISTENCY_LEVEL[request.runtime.id];
    const injection = request.runtime.injectionMethod ?? "none";
    if (level === 2 && injection === "none") {
      // Level 2 は起動前の強制注入が前提（§2.1・§3.4）。手段が無いのに Level 2 を
      // 名乗らせない。
      throw new BindingError(
        `${request.runtime.id} は Level 2 対象ですが、注入手段が指定されていません`,
        { stage: "injection-method" },
      );
    }
    if (!injectionMatchesRuntime(request.runtime.id, injection)) {
      throw new BindingError(
        `注入手段 ${injection} は ${request.runtime.id} のものではありません`,
        { stage: "injection-method" },
      );
    }

    const capabilities: ResolvedCapabilities =
      request.capabilityManifest === undefined
        ? { available: [], excluded: [] }
        : this.#capabilities.resolve(request.capabilityManifest);

    const compiled: CompiledInstructions = compile({
      persona,
      user: user.context,
      capabilities: capabilities.available,
      excluded: capabilities.excluded,
      ...(request.outputPrefix ? { outputPrefix: request.outputPrefix } : {}),
    });

    const verdict = checkSchemaVersion(this.#currentSchemaVersion, this.#currentSchemaVersion);
    if (!verdict.accepted) {
      throw new BindingError(`Runtime Profile の版が不正です: ${verdict.reason}`, {
        stage: "schema-version",
      });
    }

    return {
      schema_version: this.#currentSchemaVersion,
      // profile_id は hash の先頭を使う。同じ合成結果が同じ id を持ち、
      // §7.2 の runtime-profile://{profile_id}/summary から一意に引ける。
      profile_id: compiled.profileHash.slice(0, 16),
      profile_hash: compiled.profileHash,
      configuration_hash: compiled.configurationHash,
      persona: { id: persona.id, version: persona.version },
      user_id: user.context.id,
      runtime: { id: request.runtime.id, consistency_level: level, injection_method: injection },
      instructions: compiled.instructions,
      excluded_capabilities: capabilities.excluded,
    };
  }

  async #loadPersona(request: BindingRequest) {
    try {
      return await this.#personas.load(request.persona);
    } catch (err) {
      // 人格を解決できないのは §6.5 の fail-closed 条件。元の例外は残す。
      throw new BindingError(
        `人格を解決できませんでした: ${err instanceof Error ? err.message : String(err)}`,
        { stage: "persona-resolution" },
      );
    }
  }
}

function injectionMatchesRuntime(runtime: RuntimeId, injection: InjectionMethod): boolean {
  if (injection === "none") return true;
  const prefix = injection.split(":")[0];
  return prefix === runtime;
}
