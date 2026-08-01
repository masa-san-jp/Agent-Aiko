// StructuredMatcher の照合。R7 仕様書 §4 / R7-2。
//
// 書いた条件はすべて満たす（AND）、配列の中はどれか1つ（OR）。
// **条件を1つも書かない matcher は全 Action に当たる**ので、規則として受け付けない。

import type { CandidateAction, ActionEvaluationContext } from "./action.js";
import type { StructuredMatcher } from "./rule.js";

export interface MatchInput {
  action: CandidateAction;
  context?: ActionEvaluationContext | undefined;
}

/** 条件が1つも無い matcher か。R7-2 の規則読み込みで弾くために公開する。 */
export function isEmptyMatcher(matcher: StructuredMatcher): boolean {
  const { kind: _kind, ...conditions } = matcher;
  return Object.values(conditions).every((v) => v === undefined);
}

export function matchesStructured(matcher: StructuredMatcher, input: MatchInput): boolean {
  const { action, context } = input;

  if (isEmptyMatcher(matcher)) return false;

  if (matcher.actionTypes && !matcher.actionTypes.includes(action.type)) return false;
  if (matcher.toolIds && (action.toolId === undefined || !matcher.toolIds.includes(action.toolId))) {
    return false;
  }
  if (
    matcher.operations &&
    (action.operation === undefined || !matcher.operations.includes(action.operation))
  ) {
    return false;
  }
  if (matcher.proposedBy && !matcher.proposedBy.includes(action.proposedBy)) return false;

  if (matcher.effects) {
    for (const [key, expected] of Object.entries(matcher.effects)) {
      if (expected === undefined) continue;
      if (action.effects[key as keyof CandidateAction["effects"]] !== expected) return false;
    }
  }

  if (matcher.targetTypes) {
    const types = (action.targets ?? []).map((t) => t.type);
    if (!types.some((t) => matcher.targetTypes?.includes(t))) return false;
  }

  if (matcher.dataClassifications) {
    const classes = (action.targets ?? [])
      .map((t) => t.dataClassification)
      .filter((c): c is NonNullable<typeof c> => c !== undefined);
    if (!classes.some((c) => matcher.dataClassifications?.includes(c))) return false;
  }

  if (matcher.requiredPermissions) {
    const requested = action.requestedPermissions ?? [];
    if (!matcher.requiredPermissions.some((p) => requested.includes(p))) return false;
  }

  if (matcher.environments) {
    // environment が分からないまま「production ではない」と決めない。
    // 分からないなら当たらない側ではなく、**当たる側**に倒す——
    // production 向けの規則を、環境未申告というだけで外すのは緩めることになる。
    const env = context?.environment;
    if (env !== undefined && !matcher.environments.includes(env)) return false;
  }

  return true;
}
