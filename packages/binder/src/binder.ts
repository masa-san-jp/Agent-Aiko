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

import { compile, checkSchemaVersion, hashObject, type CompiledInstructions, type PersonaRef, type PersonaRepository, type UserContext } from "@agent-aiko/core";
import { type ResolvedUserContext } from "@agent-aiko/user-context";
import { CapabilityRegistry, type ResolvedCapabilities } from "@agent-aiko/capability-registry";

/** Runtime Profile の現行 schema_version。 */
export const RUNTIME_PROFILE_SCHEMA_VERSION = 1;

/** provenance に載せる版。合成の手順が変わったことを、あとから見分けられるように。 */
export const BINDER_VERSION = "0.1.0";

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
  /** この Profile が何から作られたか（§5.2 / Threat Model §5-7）。
   *  人格がすり替わっていないかを、あとから照合できるようにするための記録。 */
  provenance: {
    created_at: string;
    binder_version: string;
    compiler_version: string;
    persona_package_hash: string;
    persona_sources: Array<{ part: string; location: string }>;
    capability_manifest_hash?: string;
  };
  /** 応答の機械判定に使う宣言（R7 仕様書 §6）。validateResponse の唯一の照合元。
   *  人格も利用者も何も宣言していなければ持たない——空の契約を作ると、
   *  「何も決まっていない」と「全部合格した」が見分けられなくなる。 */
  response_contract?: Record<string, unknown>;
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
  /** 時刻。provenance の created_at に使う。検証で固定できるようにしてある。 */
  clock?: () => Date;
}

export class RuntimeProfileBinder {
  readonly #personas: PersonaRepository;
  readonly #capabilities: CapabilityRegistry;
  readonly #currentSchemaVersion: number;
  readonly #now: () => Date;

  constructor(options: BinderOptions) {
    this.#personas = options.personaRepository;
    this.#capabilities = options.capabilityRegistry ?? new CapabilityRegistry();
    this.#currentSchemaVersion = options.currentSchemaVersion ?? RUNTIME_PROFILE_SCHEMA_VERSION;
    this.#now = options.clock ?? (() => new Date());
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

    // SDK 設計書 §14.1 は content hash の入力に Runtime Descriptor を挙げている。
    // 指示文だけを hash すると、**注入手段が違う Profile が同じ hash になる**
    // ——Claude Code 向けと Codex 向けで指示文が同一なら見分けられない
    // （2026-08-01 の cross-runtime テストで実測）。ランタイムまで含めて取る。
    // Compiler にランタイムを持ち込まないのは §5.3（core は runtime を知らない）。
    // 応答契約は人格の宣言に利用者側の呼び名・言語を重ねたもの。呼び名は
    // 人格ではなく利用者に属するので、人格側の宣言では決まらない。
    const responseContract = mergeResponseContract(persona.responseContract, user.context);

    // 適用した人格そのものの checksum。合成結果ではなく**材料**を指す。
    // Threat Model T2（Persona Package のすり替え）は、合成後の hash だけでは
    // 検知できない——材料が変わっても合成の手順は同じだから。
    const personaPackageHash = hashObject({
      id: persona.id,
      version: persona.version,
      identityCore: persona.identityCore,
      invariants: persona.invariants,
      behavioralContract: persona.behavioralContract,
      ...(persona.responseContract ? { responseContract: persona.responseContract } : {}),
    });

    const profileHash = hashObject({
      instructions: compiled.instructions,
      runtime: { id: request.runtime.id, consistency_level: level, injection_method: injection },
      schema_version: this.#currentSchemaVersion,
      // 契約が無ければ hashObject が落とすので、従来の profile の hash は変わらない。
      response_contract: responseContract,
    });

    return {
      schema_version: this.#currentSchemaVersion,
      // profile_id は hash の先頭を使う。同じ合成結果が同じ id を持ち、
      // §7.2 の runtime-profile://{profile_id}/summary から一意に引ける。
      profile_id: profileHash.slice(0, 16),
      profile_hash: profileHash,
      configuration_hash: compiled.configurationHash,
      persona: { id: persona.id, version: persona.version },
      user_id: user.context.id,
      runtime: { id: request.runtime.id, consistency_level: level, injection_method: injection },
      instructions: compiled.instructions,
      excluded_capabilities: capabilities.excluded,
      ...(responseContract ? { response_contract: responseContract } : {}),
      provenance: {
        created_at: this.#now().toISOString(),
        binder_version: BINDER_VERSION,
        compiler_version: BINDER_VERSION,
        persona_package_hash: personaPackageHash,
        persona_sources: persona.sources.map((src) => ({
          part: src.part,
          location: src.location,
        })),
        ...(request.capabilityManifest === undefined
          ? {}
          : { capability_manifest_hash: hashObject(request.capabilityManifest) }),
      },
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

/** 人格の宣言と利用者の設定を重ねる。どちらも何も持たなければ undefined。
 *  利用者側が上書きするのは呼び名と言語だけ——人格の禁止表現を利用者が
 *  外せてしまうと、人格の宣言が宣言でなくなる。 */
function mergeResponseContract(
  personaContract: Record<string, unknown> | undefined,
  user: UserContext,
): Record<string, unknown> | undefined {
  const merged: Record<string, unknown> = { ...(personaContract ?? {}) };
  if (user.preferredName !== undefined) merged["preferredName"] = user.preferredName;
  if (user.language !== undefined) merged["language"] = user.language;
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function injectionMatchesRuntime(runtime: RuntimeId, injection: InjectionMethod): boolean {
  if (injection === "none") return true;
  const prefix = injection.split(":")[0];
  return prefix === runtime;
}
