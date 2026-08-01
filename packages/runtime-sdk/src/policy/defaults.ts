// 既定の Policy Rule。R7 仕様書 R7-2「irreversible / external / production / privacy 判定」。
//
// §2.3 が require_approval の対象として挙げているものを、そのまま規則にしてある。
// **人格由来でも Organization 由来でもない**ので、層は user-approval（§4.2 の6番目）。
// 上に来る Host safety / Organization / Permission Manifest / 人格不変条項が
// より強い判定を出したら、そちらが勝つ。
//
// deny は1つも無い。既定で拒否してよいのは権限違反と明示的禁止だけで（§2.4）、
// 「不可逆だから」は承認で進める余地がある——止めるのではなく、聞く。

import type { PolicyRule } from "./rule.js";

function approvalRule(
  id: string,
  description: string,
  effects: NonNullable<Extract<PolicyRule["matcher"], { kind: "structured" }>["effects"]>,
  severity: PolicyRule["severity"],
  priority: number,
  remediation: string,
): PolicyRule {
  return {
    id,
    version: "1.0.0",
    category: "approval",
    description,
    matcher: { kind: "structured", effects },
    enforcement: "approve",
    approvalAuthority: "user",
    priority,
    enabled: true,
    source: { layer: "user-approval", origin: "runtime-sdk:default", ruleSetVersion: "1.0.0" },
    remediation,
    severity,
  };
}

/** §2.3 の対象例に対応する既定規則。 */
export const DEFAULT_POLICY_RULES: readonly PolicyRule[] = [
  approvalRule(
    "default-irreversible",
    "取り返しがつかない操作は承認を得てから行う",
    { irreversible: true },
    "high",
    100,
    "何が元に戻せないのかを示して承認を求める",
  ),
  approvalRule(
    "default-production",
    "本番環境を変える操作は承認を得てから行う",
    { production: true },
    "high",
    95,
    "対象の環境と影響範囲を示して承認を求める",
  ),
  approvalRule(
    "default-financial",
    "費用が発生する操作は承認を得てから行う",
    { financial: true },
    "high",
    90,
    "発生する費用を示して承認を求める",
  ),
  approvalRule(
    "default-privacy-external",
    "個人情報を外部へ出す操作は承認を得てから行う",
    { privacyRelevant: true, external: true },
    "high",
    85,
    "何を誰へ送るのかを示して承認を求める",
  ),
  approvalRule(
    "default-external",
    "外部へ影響が出る操作は承認を得てから行う",
    { external: true },
    "medium",
    80,
    "送信先と内容を示して承認を求める",
  ),
];
