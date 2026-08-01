// Deterministic Policy Engine。R7 仕様書 R7-2 / §3 / §4 / §5。
//
// **構造化規則だけで判定する。** モデル判定（Stage 2）は R7-4 で足す。
// ここで意味判断をしないことが §1 の担保になる——deny を出せるのは構造だけを
// 見たこの層で、evaluation.deterministic は常に true。
//
// 判定は「当たった規則のうち最も強い強制力」で決まる。§4.2 の層は、
// 同じ強さが並んだときにどれを理由として示すかの順序に使う。上位の deny を
// 下位が解除できないのは、弱いほうを採らないから（規約ではなく手続きで守る）。

import { hashObject } from "@agent-aiko/core";
import type { ActionDecision, ApprovalGrant, DecisionReason, EvaluateActionRequest, MatchedPolicyRule, RemediationAction } from "./action.js";
import type { EnforcementMode, Severity } from "./common.js";
import { POLICY_LAYERS, type PolicyRule } from "./rule.js";
import { matchesStructured } from "./matcher.js";
import { actionHash, decisionCacheKey, isApprovalStillValid } from "./canonical.js";
import { DEFAULT_POLICY_RULES } from "./defaults.js";
import { checkPermissionManifest, isHighRisk, type PermissionManifest } from "./permission.js";

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

/** 権限の判断がつかないときに使う擬似規則。実在の規則ではないので id を分ける。 */
const PERMISSION_LAYER = "permission-manifest";

export interface DeterministicPolicyEngineOptions {
  /** 既定規則に足す・置き換える規則。省略すると既定だけ。 */
  rules?: readonly PolicyRule[] | undefined;
  /** 明示的に undefined を渡せる。「権限情報が無い」は判定に効く状態であって、
   *  書き忘れと同じではない（§3.4）。 */
  permissionManifest?: PermissionManifest | undefined;
  /** 既に得ている承認。§3.3 の紐づけが合っていれば require_approval を解く。 */
  approvals?: readonly ApprovalGrant[] | undefined;
  /** 承認要求の有効期限。省略すると期限なし。 */
  approvalTtlMs?: number | undefined;
  clock?: (() => Date) | undefined;
}

export class DeterministicPolicyEngine {
  readonly #rules: readonly PolicyRule[];
  readonly #manifest: PermissionManifest | undefined;
  readonly #approvals: readonly ApprovalGrant[];
  readonly #approvalTtlMs: number | undefined;
  readonly #clock: () => Date;
  readonly #policyBundleHash: string;

  constructor(options: DeterministicPolicyEngineOptions = {}) {
    this.#rules = options.rules ?? DEFAULT_POLICY_RULES;
    this.#manifest = options.permissionManifest;
    this.#approvals = options.approvals ?? [];
    this.#approvalTtlMs = options.approvalTtlMs;
    this.#clock = options.clock ?? (() => new Date());
    // 規則集合そのものの識別子。承認はこの版に紐づくので、規則を変えれば
    // 過去の承認は自動的に無効になる（§3.3）。
    this.#policyBundleHash = hashObject(this.#rules);
  }

  get policyBundleHash(): string {
    return this.#policyBundleHash;
  }

  evaluate(request: EvaluateActionRequest): ActionDecision {
    const { action } = request;
    const hash = actionHash(action);
    const now = this.#clock();

    const reasons: DecisionReason[] = [];
    const matchedRules: MatchedPolicyRule[] = [];
    const remediation: RemediationAction[] = [];

    const state: {
      enforcement: EnforcementMode;
      severity: Severity;
      layerRank: number;
      authority: PolicyRule["approvalAuthority"];
    } = {
      enforcement: "observe",
      severity: "info",
      layerRank: POLICY_LAYERS.length,
      authority: undefined,
    };

    const raise = (
      mode: EnforcementMode,
      level: Severity,
      layer: string,
      ruleAuthority: PolicyRule["approvalAuthority"],
    ): void => {
      const rank = POLICY_LAYERS.indexOf(layer as (typeof POLICY_LAYERS)[number]);
      const stronger = ENFORCEMENT_STRENGTH[mode] > ENFORCEMENT_STRENGTH[state.enforcement];
      const sameButHigherLayer =
        ENFORCEMENT_STRENGTH[mode] === ENFORCEMENT_STRENGTH[state.enforcement] &&
        rank < state.layerRank;
      if (stronger || sameButHigherLayer) {
        state.enforcement = mode;
        state.layerRank = rank;
        state.authority = ruleAuthority;
      }
      if (SEVERITY_STRENGTH[level] > SEVERITY_STRENGTH[state.severity]) state.severity = level;
    };

    // --- 1. Permission Manifest（§2.4 の権限外操作を出せる層） ---
    for (const finding of checkPermissionManifest(action, this.#manifest)) {
      // §3.4: 権限情報そのものが欠落していれば止める。申告が足りないだけなら聞く。
      const stops = finding.kind === "denied" || finding.kind === "unresolved";
      const mode: EnforcementMode = stops ? "block" : "approve";
      const level: Severity = stops ? "critical" : "medium";
      reasons.push({
        code: finding.code,
        message: finding.message,
        severity: level,
        origin: "deterministic",
      });
      remediation.push({
        kind: stops ? "reduce-scope" : "request-approval",
        instruction: finding.remediation,
      });
      matchedRules.push({
        ruleId: `permission:${finding.code}`,
        version: "1.0.0",
        layer: PERMISSION_LAYER,
        enforcement: mode,
        priority: 1000,
        matchedBy: "structured",
      });
      raise(mode, level, PERMISSION_LAYER, "user");
    }

    // --- 2. 構造化規則 ---
    for (const rule of this.#rules) {
      if (!rule.enabled) continue;
      if (rule.matcher.kind !== "structured") continue;
      if (!matchesStructured(rule.matcher, { action, context: request.context })) continue;

      const level = rule.severity ?? "medium";
      matchedRules.push({
        ruleId: rule.id,
        version: rule.version,
        layer: rule.source.layer,
        enforcement: rule.enforcement,
        priority: rule.priority,
        matchedBy: "structured",
      });
      reasons.push({
        code: `RULE_${rule.id}`,
        message: rule.description,
        severity: level,
        origin: "deterministic",
        ruleId: rule.id,
      });
      if (rule.remediation) {
        remediation.push({
          kind: rule.enforcement === "approve" ? "request-approval" : "reduce-scope",
          instruction: rule.remediation,
          ruleId: rule.id,
        });
      }
      raise(rule.enforcement, level, rule.source.layer, rule.approvalAuthority);
    }

    // --- 3. 意味判定が要る規則（R7-4 まで評価者がいない） ---
    const pendingSemantic = this.#rules.some(
      (rule) =>
        rule.enabled &&
        rule.matcher.kind === "semantic" &&
        (rule.matcher.appliesTo === undefined ||
          matchesStructured(rule.matcher.appliesTo, { action, context: request.context })),
    );
    if (pendingSemantic && ENFORCEMENT_STRENGTH[state.enforcement] < ENFORCEMENT_STRENGTH.approve) {
      // §5.2 のタイムアウト時の既定と同じ扱い。評価者がいないことを黙って
      // 「問題なし」にしない——高リスクなら聞き、可逆なら警告して進む。
      const mode: EnforcementMode = isHighRisk(action) ? "approve" : "warn";
      reasons.push({
        code: "SEMANTIC_EVALUATOR_UNAVAILABLE",
        message: "意味判定が必要な規則があるが、評価者が登録されていない",
        severity: isHighRisk(action) ? "medium" : "low",
        origin: "fallback",
      });
      raise(mode, isHighRisk(action) ? "medium" : "low", "semantic-persona", "user");
    }

    // --- 4. 既に得ている承認 ---
    const approved =
      state.enforcement === "approve" &&
      this.#approvals.some((grant) =>
        isApprovalStillValid(grant, {
          actionHash: hash,
          policyBundleHash: this.#policyBundleHash,
          profileId: request.profileRef.profileId,
          now,
        }),
      );
    if (approved) {
      reasons.push({
        code: "APPROVAL_PRESENT",
        message: "この操作内容に対する有効な承認がある",
        severity: "info",
        origin: "deterministic",
      });
    }

    const decision: ActionDecision["decision"] = approved
      ? "allow_with_warning"
      : state.enforcement === "block"
        ? "deny"
        : state.enforcement === "approve"
          ? "require_approval"
          : state.enforcement === "warn"
            ? "allow_with_warning"
            : "allow";

    const approvalId = `ap-${hashObject({ hash, bundle: this.#policyBundleHash, profile: request.profileRef.profileId }).slice(0, 32)}`;

    return {
      decision,
      severity: decision === "allow" ? "info" : state.severity,
      // 構造化規則だけで決めた（§2.6）。
      confidence: 1,
      enforcement: state.enforcement,
      reasons,
      matchedRules,
      ...(decision === "require_approval"
        ? {
            approval: {
              authority: state.authority ?? "user",
              approvalId,
              actionHash: hash,
              ...(this.#approvalTtlMs !== undefined
                ? { expiresAt: new Date(now.getTime() + this.#approvalTtlMs).toISOString() }
                : {}),
              prompt: action.summary,
            },
          }
        : {}),
      ...(remediation.length > 0 ? { remediation } : {}),
      evaluation: { deterministic: true, semantic: false },
      cache: {
        // §5.3「不可逆操作はキャッシュしない」。承認を跨いで再利用されると、
        // 一度承認した削除が二度目も素通りする。
        cacheable: !action.effects.irreversible && decision !== "require_approval",
        cacheKey: decisionCacheKey({
          actionHash: hash,
          profileId: request.profileRef.profileId,
          policyBundleHash: this.#policyBundleHash,
        }),
      },
      policyBundleHash: this.#policyBundleHash,
      profileId: request.profileRef.profileId,
      decidedAt: now.toISOString(),
    };
  }
}
