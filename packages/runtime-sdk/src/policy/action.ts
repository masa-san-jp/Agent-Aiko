// evaluateAction の入出力。R7 仕様書 §7.1 / §7.2、判定規則は §2 / §3。

import { z } from "zod";
import {
  ApprovalAuthoritySchema,
  ConfidenceSchema,
  EnforcementModeSchema,
  EvaluationModeSchema,
  EvaluationOriginSchema,
  RuntimeProfileRefSchema,
  SeveritySchema,
  TraceContextSchema,
} from "./common.js";
import {
  ActionProposerSchema,
  ActionTargetTypeSchema,
  DataClassificationSchema,
  EnvironmentSchema,
} from "./rule.js";

/** §7.1。 */
export const ActionTargetSchema = z
  .object({
    type: ActionTargetTypeSchema,
    identifier: z.string().min(1),
    dataClassification: DataClassificationSchema.optional(),
  })
  .strict();

/** §7.1。effects は5項目すべて必須。「書かなかった＝false」にすると、
 *  不可逆かどうかを申告し忘れた Action が可逆として通る。 */
export const CandidateActionSchema = z
  .object({
    actionId: z.string().min(1),
    type: z.string().min(1),
    toolId: z.string().min(1).optional(),
    operation: z.string().min(1).optional(),
    summary: z.string().min(1),
    arguments: z.record(z.string(), z.unknown()).optional(),
    targets: z.array(ActionTargetSchema).optional(),
    effects: z
      .object({
        external: z.boolean(),
        irreversible: z.boolean(),
        production: z.boolean(),
        financial: z.boolean(),
        privacyRelevant: z.boolean(),
      })
      .strict(),
    requestedPermissions: z.array(z.string().min(1)).optional(),
    proposedBy: ActionProposerSchema,
  })
  .strict();

/** §7.1。 */
export const ActionEvaluationContextSchema = z
  .object({
    userIntent: z.string().optional(),
    taskSummary: z.string().optional(),
    priorApprovalRef: z.string().min(1).optional(),
    runtimeId: z.string().min(1).optional(),
    projectRoot: z.string().min(1).optional(),
    environment: EnvironmentSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

/** §7.1。 */
export const EvaluateActionRequestSchema = z
  .object({
    requestId: z.string().min(1),
    profileRef: RuntimeProfileRefSchema,
    action: CandidateActionSchema,
    context: ActionEvaluationContextSchema.optional(),
    requestedMode: EvaluationModeSchema.optional(),
    timeoutMs: z.number().int().positive().optional(),
    traceContext: TraceContextSchema.optional(),
  })
  .strict();

/** §2 の4判定。 */
export const ActionDecisionKindSchema = z.enum([
  "allow",
  "allow_with_warning",
  "require_approval",
  "deny",
]);

/** 判定の理由。どの規則が効いたか、構造化とモデルのどちらから来たかを残す。 */
export const DecisionReasonSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    severity: SeveritySchema,
    origin: z.enum(["deterministic", "semantic", "fallback"]),
    ruleId: z.string().min(1).optional(),
  })
  .strict();

/** 当たった規則。規則本体ではなく識別子だけを載せる（§14 の記録禁止に合わせる）。 */
export const MatchedPolicyRuleSchema = z
  .object({
    ruleId: z.string().min(1),
    version: z.string().min(1),
    layer: z.string().min(1),
    enforcement: EnforcementModeSchema,
    priority: z.number().int(),
    matchedBy: z.enum(["structured", "semantic"]),
    confidence: ConfidenceSchema.optional(),
  })
  .strict();

/** §3.4 / §4.1 remediation。「どうすれば進めるか」を返す。 */
export const RemediationActionSchema = z
  .object({
    kind: z.enum([
      "request-approval",
      "reduce-scope",
      "use-alternative",
      "gather-information",
      "abort",
    ]),
    instruction: z.string().min(1),
    ruleId: z.string().min(1).optional(),
  })
  .strict();

/** §7.2。承認を求めるときの中身。actionHash に紐づけるので、
 *  操作が変われば hash が変わり、承認は自動的に無効になる（§3.3）。 */
export const ApprovalRequirementSchema = z
  .object({
    authority: ApprovalAuthoritySchema,
    approvalId: z.string().min(1),
    actionHash: z.string().min(1),
    expiresAt: z.string().min(1).optional(),
    prompt: z.string().min(1),
  })
  .strict();

/** §3.3。承認そのものの記録。承認は「この Action のこの版に対して」しか効かない。 */
export const ApprovalGrantSchema = z
  .object({
    approvalId: z.string().min(1),
    actionHash: z.string().min(1),
    /** §3.3 の policy version。判定側が返す policyBundleHash と同じ識別子を使う。
     *  別名を付けると、承認と判定が同じ規則集合を見ていたか照合できなくなる。 */
    policyBundleHash: z.string().min(1),
    profileId: z.string().min(1),
    scope: z.string().min(1),
    grantedBy: ApprovalAuthoritySchema,
    grantedAt: z.string().min(1),
    expiresAt: z.string().min(1).optional(),
  })
  .strict();

/** §7.2。 */
export const ActionDecisionSchema = z
  .object({
    decision: ActionDecisionKindSchema,
    severity: SeveritySchema,
    confidence: ConfidenceSchema,
    enforcement: EnforcementModeSchema,
    reasons: z.array(DecisionReasonSchema),
    matchedRules: z.array(MatchedPolicyRuleSchema),
    approval: ApprovalRequirementSchema.optional(),
    remediation: z.array(RemediationActionSchema).optional(),
    evaluation: EvaluationOriginSchema,
    cache: z
      .object({
        cacheable: z.boolean(),
        cacheKey: z.string().min(1).optional(),
        expiresAt: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    policyBundleHash: z.string().min(1),
    profileId: z.string().min(1),
    decidedAt: z.string().min(1),
  })
  .strict()
  .refine((d) => d.decision !== "require_approval" || d.approval !== undefined, {
    // §2.3 / §16-2: require_approval は承認主体を必須とする。承認主体の無い
    // require_approval は「誰に聞けばいいか分からないまま止まる」になる。
    message: "require_approval には approval（承認主体）が必要（R7 §2.3）",
    path: ["approval"],
  })
  .refine((d) => d.decision !== "deny" || d.evaluation.deterministic, {
    // §1 / §16-3: モデル判定だけを根拠に deny してはならない。規約ではなく
    // 「その形の ActionDecision を作れない」ようにする。
    message: "deny は構造化規則による判定を伴う必要がある（R7 §1）",
    path: ["evaluation", "deterministic"],
  });

export type ActionTarget = z.infer<typeof ActionTargetSchema>;
export type CandidateAction = z.infer<typeof CandidateActionSchema>;
export type ActionEvaluationContext = z.infer<typeof ActionEvaluationContextSchema>;
export type EvaluateActionRequest = z.infer<typeof EvaluateActionRequestSchema>;
export type ActionDecisionKind = z.infer<typeof ActionDecisionKindSchema>;
export type DecisionReason = z.infer<typeof DecisionReasonSchema>;
export type MatchedPolicyRule = z.infer<typeof MatchedPolicyRuleSchema>;
export type RemediationAction = z.infer<typeof RemediationActionSchema>;
export type ApprovalRequirement = z.infer<typeof ApprovalRequirementSchema>;
export type ApprovalGrant = z.infer<typeof ApprovalGrantSchema>;
export type ActionDecision = z.infer<typeof ActionDecisionSchema>;
