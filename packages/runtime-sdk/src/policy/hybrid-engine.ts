// Stage 1 と Stage 2 を繋ぐ。R7 仕様書 §5.2 / R7-4 / R7-5。
//
// Stage 2 を呼ぶのは **構造化規則で決まらないときだけ**（§5.2）。構造で deny に
// なったものへモデルの意見を重ねない——覆せないうえ、覆せる余地があるように見える。
//
// モデルの結論で強められるのは warn / approve まで。deny は構造化規則の側にしか出せない
// （§1）。ActionDecisionSchema も semantic だけの deny を弾くので、ここが間違えば落ちる。

import { actionHash } from "./canonical.js";
import type { ActionDecision, DecisionReason, EvaluateActionRequest } from "./action.js";
import type { EnforcementMode, Severity } from "./common.js";
import {
  DeterministicPolicyEngine,
  type DeterministicPolicyEngineOptions,
} from "./engine.js";
import { isHighRisk } from "./permission.js";
import type { SemanticMatcher } from "./rule.js";
import {
  runSemantic,
  type SemanticBudget,
  type SemanticEvaluator,
  type SemanticOutcome,
} from "./semantic.js";

export interface HybridPolicyEngineOptions extends DeterministicPolicyEngineOptions {
  /** 未登録でよい（§9）。いなければ Stage 1 の既定の扱いがそのまま残る。 */
  semanticEvaluator?: SemanticEvaluator | undefined;
}

export interface HybridEvaluateOptions {
  /** §5.3 の上限。渡さなければ上限なし。 */
  budget?: SemanticBudget | undefined;
}

export class HybridPolicyEngine {
  readonly #deterministic: DeterministicPolicyEngine;
  readonly #evaluator: SemanticEvaluator | undefined;

  constructor(options: HybridPolicyEngineOptions = {}) {
    const { semanticEvaluator, ...rest } = options;
    this.#deterministic = new DeterministicPolicyEngine(rest);
    this.#evaluator = semanticEvaluator;
  }

  get policyBundleHash(): string {
    return this.#deterministic.policyBundleHash;
  }

  async evaluate(
    request: EvaluateActionRequest,
    options: HybridEvaluateOptions = {},
  ): Promise<ActionDecision> {
    const pending = this.#deterministic.pendingSemanticRules(request);
    if (pending.length === 0 || this.#evaluator === undefined) {
      // 評価者がいなければ Stage 1 の既定（高リスクは承認）をそのまま使う。
      return this.#deterministic.evaluate(request);
    }

    const base = this.#deterministic.evaluate(request, { skipSemanticFallback: true });
    if (base.decision === "deny") return base;

    const reasons: DecisionReason[] = [...base.reasons];
    let enforcement = base.enforcement;
    let severity = base.severity;
    let confidence = 1;
    let evaluated = false;

    for (const rule of pending) {
      const matcher = rule.matcher as SemanticMatcher;
      const outcome: SemanticOutcome = await runSemantic(
        this.#evaluator,
        {
          rubricId: matcher.rubricId,
          question: matcher.question,
          subject: { kind: "action", content: request.action.summary },
          profileRef: request.profileRef,
          ...(request.timeoutMs !== undefined ? { timeoutMs: request.timeoutMs } : {}),
        },
        options.budget,
        "action",
      );

      if (outcome.status === "unavailable") {
        // §5.2 のタイムアウト時の既定。上限超過も未登録もここへ落ちる——
        // 「意味判定を通していない」ことは同じで、扱いも同じでよい。
        const mode: EnforcementMode = isHighRisk(request.action) ? "approve" : "warn";
        reasons.push({
          code: `SEMANTIC_${outcome.reason.toUpperCase().replace(/-/g, "_")}`,
          message: "意味判定が必要な規則を評価できなかった",
          severity: isHighRisk(request.action) ? "medium" : "low",
          origin: "fallback",
          ruleId: rule.id,
        });
        ({ enforcement, severity } = raise(enforcement, severity, mode, "medium"));
        continue;
      }

      evaluated = true;
      const { result } = outcome;
      confidence = Math.min(confidence, result.confidence);
      if (result.verdict === "clear") continue;

      const low = result.confidence < (matcher.minConfidence ?? 0.7);
      // 低 confidence の懸念で承認まで求めるのは高リスクのときだけ。
      // 可逆な操作を「たぶん怪しい」で止めると、止まることが常態になる。
      const mode: EnforcementMode = low
        ? isHighRisk(request.action)
          ? "approve"
          : "warn"
        : rule.enforcement === "block"
          ? "approve"
          : rule.enforcement;
      reasons.push({
        code: low ? "SEMANTIC_CONCERN_LOW_CONFIDENCE" : "SEMANTIC_CONCERN",
        message: result.rationale ?? rule.description,
        severity: low ? "low" : (rule.severity ?? "medium"),
        origin: "semantic",
        ruleId: rule.id,
      });
      ({ enforcement, severity } = raise(
        enforcement,
        severity,
        mode,
        low ? "low" : (rule.severity ?? "medium"),
      ));
    }

    const decision: ActionDecision["decision"] =
      enforcement === "block"
        ? "deny"
        : enforcement === "approve"
          ? "require_approval"
          : enforcement === "warn"
            ? "allow_with_warning"
            : "allow";

    return {
      ...base,
      decision,
      enforcement,
      severity: decision === "allow" ? "info" : severity,
      confidence: evaluated ? confidence : base.confidence,
      reasons,
      ...(decision === "require_approval"
        ? {
            // Stage 1 が承認を求めていなければ、意味判定で上がったぶんの承認を作る。
            // 紐づけ先は Stage 1 と同じ action hash（§3.3）。
            approval: base.approval ?? {
              authority: "user" as const,
              approvalId: `ap-semantic-${actionHash(request.action).slice(0, 24)}`,
              actionHash: actionHash(request.action),
              prompt: request.action.summary,
            },
          }
        : {}),
      evaluation: {
        deterministic: true,
        semantic: evaluated,
        ...(evaluated && this.#evaluator ? { semanticEvaluator: this.#evaluator.id } : {}),
      },
      cache: {
        // 意味判定を通した結果は再利用しない。同じ入力でも次は違う答えが出る。
        cacheable: evaluated ? false : (base.cache?.cacheable ?? false),
        ...(base.cache?.cacheKey ? { cacheKey: base.cache.cacheKey } : {}),
      },
    };
  }
}

const ENFORCEMENT_STRENGTH: Record<EnforcementMode, number> = {
  observe: 0,
  warn: 1,
  approve: 2,
  block: 3,
};

const SEVERITY_STRENGTH: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function raise(
  enforcement: EnforcementMode,
  severity: Severity,
  mode: EnforcementMode,
  level: Severity,
): { enforcement: EnforcementMode; severity: Severity } {
  return {
    enforcement:
      ENFORCEMENT_STRENGTH[mode] > ENFORCEMENT_STRENGTH[enforcement] ? mode : enforcement,
    severity: SEVERITY_STRENGTH[level] > SEVERITY_STRENGTH[severity] ? level : severity,
  };
}
