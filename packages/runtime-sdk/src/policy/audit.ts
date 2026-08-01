// 監査ログ。R7 仕様書 §14。
//
// 記録してよいものと、してはいけないものが決まっている。**組み立てをここに1本化する**
// ——呼び出し側が decision をそのままログへ流すと、reasons の本文や approval prompt
// （＝ Action の summary）まで出る。載せない側を守るには、載せる側を明示するしかない。

import type { ActionDecision, EvaluateActionRequest } from "./action.js";
import type { ResponseValidation, ValidateResponseRequest } from "./response.js";

export interface PolicyAuditRecord {
  requestId: string;
  actionId?: string;
  responseId?: string;
  profileId: string;
  policyBundleHash: string;
  outcome: string;
  matchedRuleIds: string[];
  approvalId?: string;
  evaluator: "deterministic" | "semantic" | "hybrid";
  latencyMs: number;
  timestamp: string;
}

function evaluatorOf(origin: { deterministic: boolean; semantic: boolean }): PolicyAuditRecord["evaluator"] {
  if (origin.deterministic && origin.semantic) return "hybrid";
  return origin.semantic ? "semantic" : "deterministic";
}

export function auditAction(
  request: EvaluateActionRequest,
  decision: ActionDecision,
  latencyMs: number,
): PolicyAuditRecord {
  return {
    requestId: request.requestId,
    actionId: request.action.actionId,
    profileId: decision.profileId,
    policyBundleHash: decision.policyBundleHash,
    outcome: decision.decision,
    matchedRuleIds: decision.matchedRules.map((r) => r.ruleId),
    ...(decision.approval ? { approvalId: decision.approval.approvalId } : {}),
    evaluator: evaluatorOf(decision.evaluation),
    latencyMs,
    timestamp: decision.decidedAt,
  };
}

export function auditResponse(
  request: ValidateResponseRequest,
  validation: ResponseValidation,
  latencyMs: number,
): PolicyAuditRecord {
  return {
    requestId: request.requestId,
    responseId: request.response.responseId,
    profileId: validation.profileId,
    policyBundleHash: validation.policyBundleHash,
    outcome: validation.status,
    matchedRuleIds: validation.issues.map((i) => i.code),
    evaluator: evaluatorOf(validation.validation),
    latencyMs,
    timestamp: validation.validatedAt,
  };
}
