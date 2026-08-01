// Semantic Evaluator の入口。R7 仕様書 R7-4 / §1 / §5.2 / §5.3。
//
// **評価者は結論を返さない。** 返すのは「懸念があるか」と「どれくらい確からしいか」で、
// それを allow / approve のどちらへ倒すかは呼び出し側が決める。§1 が
// 「モデル判定だけを根拠として不可逆的に拒否してはならない」と定めているので、
// 評価者に deny を返させる口は作らない。

import { featureUnavailable, RuntimeSdkError } from "../errors.js";
import type { ConfidenceSchema } from "./common.js";
import type { z } from "zod";

export type Confidence = z.infer<typeof ConfidenceSchema>;

/** どこで動く評価者か。§R7-4 の local / host / remote。 */
export type SemanticEvaluatorKind = "local" | "host" | "remote";

/** §5.2 の標準 timeout。remote は往復があるぶん長い。 */
export const SEMANTIC_TIMEOUT_MS: Record<SemanticEvaluatorKind, number> = {
  local: 2000,
  host: 2000,
  remote: 5000,
};

export interface SemanticEvaluationRequest {
  /** どの評価軸で見るか。規則の SemanticMatcher.rubricId と対応する。 */
  rubricId: string;
  /** 評価者へ渡す問い。 */
  question: string;
  /** 何を見るか。Action なら要約、Response なら本文。 */
  subject: { kind: "action" | "response"; content: string };
  profileRef: { profileId: string; contentHash: string };
  timeoutMs?: number | undefined;
}

export interface SemanticEvaluationResult {
  rubricId: string;
  /** clear = 懸念なし、concern = 懸念あり。**violation は無い。**
   *  「違反である」と断ずるのは構造化規則の仕事（§1）。 */
  verdict: "clear" | "concern";
  confidence: Confidence;
  /** 評価者の識別子。結果の再現性を追えるようにする。 */
  evaluator: string;
  /** 理由の要約。本文の引き写しは載せない（§14）。 */
  rationale?: string;
}

export interface SemanticEvaluator {
  readonly id: string;
  readonly kind: SemanticEvaluatorKind;
  evaluate(request: SemanticEvaluationRequest): Promise<SemanticEvaluationResult>;
}

/** §5.3 の上限。**1ターンにつき** semantic evaluation 3回、最終応答の検査 1回。
 *  上限は「使い切ったら黙って素通し」ではなく、使い切ったことを理由に残して
 *  既定の扱い（高リスクなら承認）へ倒すためにある。 */
export class SemanticBudget {
  #actionsLeft: number;
  #responsesLeft: number;

  constructor(options: { actions?: number; responses?: number } = {}) {
    this.#actionsLeft = options.actions ?? 3;
    this.#responsesLeft = options.responses ?? 1;
  }

  get actionsLeft(): number {
    return this.#actionsLeft;
  }

  get responsesLeft(): number {
    return this.#responsesLeft;
  }

  /** 使えたら true。使えなければ false（例外にしない——上限は異常ではない）。 */
  take(kind: "action" | "response"): boolean {
    if (kind === "action") {
      if (this.#actionsLeft <= 0) return false;
      this.#actionsLeft -= 1;
      return true;
    }
    if (this.#responsesLeft <= 0) return false;
    this.#responsesLeft -= 1;
    return true;
  }
}

/** 評価の結末。timeout と上限超過と未登録を区別する——
 *  どれも「意味判定を通していない」だが、次に何をすべきかが違う。 */
export type SemanticOutcome =
  | { status: "evaluated"; result: SemanticEvaluationResult }
  | { status: "unavailable"; reason: "no-evaluator" | "budget-exhausted" | "timeout" | "failed" };

/** timeout つきで評価する。評価者が投げても呼び出し側は止まらない——
 *  意味判定が落ちたことで人格の起動そのものを止めるのは §9 の趣旨に反する。 */
export async function runSemantic(
  evaluator: SemanticEvaluator | undefined,
  request: SemanticEvaluationRequest,
  budget: SemanticBudget | undefined,
  kind: "action" | "response",
): Promise<SemanticOutcome> {
  if (evaluator === undefined) return { status: "unavailable", reason: "no-evaluator" };
  if (budget !== undefined && !budget.take(kind)) {
    return { status: "unavailable", reason: "budget-exhausted" };
  }

  const timeoutMs = request.timeoutMs ?? SEMANTIC_TIMEOUT_MS[evaluator.kind];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<SemanticOutcome>((resolve) => {
    timer = setTimeout(() => resolve({ status: "unavailable", reason: "timeout" }), timeoutMs);
  });

  try {
    return await Promise.race([
      evaluator
        .evaluate(request)
        .then<SemanticOutcome>((result) => ({ status: "evaluated", result }))
        .catch<SemanticOutcome>(() => ({ status: "unavailable", reason: "failed" })),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** 評価者が要るのに無いときのエラー。§9 の `AIKO_RUNTIME_FEATURE_UNAVAILABLE`。
 *  enforce 指定のときだけ呼び出し側がこれを投げる。 */
export function semanticEvaluatorUnavailable(requestId = ""): RuntimeSdkError {
  return featureUnavailable("Semantic Evaluator", requestId);
}
