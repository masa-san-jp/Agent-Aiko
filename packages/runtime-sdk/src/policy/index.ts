// Policy Engine / Response Validator の公開面。R7 仕様書 §7 / §11。
//
// §11 は packages/policy-engine と packages/response-validator を挙げつつ、
// 「初期実装では runtime-sdk 内部 module として開始してよい」としている。
// 公開 interface と Rule schema は本書に従うので、切り出すときも
// ここの export だけを別 package へ移せばよい形にしてある。

export {
  ApprovalAuthoritySchema,
  ConfidenceSchema,
  EnforcementModeSchema,
  EvaluationModeSchema,
  EvaluationOriginSchema,
  RuntimeProfileRefSchema,
  SeveritySchema,
  TraceContextSchema,
} from "./common.js";
export type {
  ApprovalAuthority,
  EnforcementMode,
  EvaluationMode,
  EvaluationOrigin,
  RuntimeProfileRef,
  Severity,
  TraceContext,
} from "./common.js";

export {
  ActionProposerSchema,
  ActionTargetTypeSchema,
  DataClassificationSchema,
  EnvironmentSchema,
  POLICY_LAYERS,
  PolicyLayerSchema,
  PolicyRuleSchema,
  PolicySourceSchema,
  SemanticMatcherSchema,
  StructuredMatcherSchema,
} from "./rule.js";
export type {
  ActionProposer,
  ActionTargetType,
  DataClassification,
  Environment,
  PolicyLayer,
  PolicyRule,
  PolicySource,
  SemanticMatcher,
  StructuredMatcher,
} from "./rule.js";

export {
  ActionDecisionKindSchema,
  ActionDecisionSchema,
  ActionEvaluationContextSchema,
  ActionTargetSchema,
  ApprovalGrantSchema,
  ApprovalRequirementSchema,
  CandidateActionSchema,
  DecisionReasonSchema,
  EvaluateActionRequestSchema,
  MatchedPolicyRuleSchema,
  RemediationActionSchema,
} from "./action.js";
export type {
  ActionDecision,
  ActionDecisionKind,
  ActionEvaluationContext,
  ActionTarget,
  ApprovalGrant,
  ApprovalRequirement,
  CandidateAction,
  DecisionReason,
  EvaluateActionRequest,
  MatchedPolicyRule,
  RemediationAction,
} from "./action.js";

export {
  ResponseCandidateSchema,
  ResponseCheckIdSchema,
  ResponseCheckResultSchema,
  ResponseIssueSchema,
  ResponseValidationContextSchema,
  ResponseValidationSchema,
  ResponseValidationStatusSchema,
  SuggestedRevisionSchema,
  ValidateResponseRequestSchema,
} from "./response.js";
export type {
  ResponseCandidate,
  ResponseCheckId,
  ResponseCheckResult,
  ResponseIssue,
  ResponseValidation,
  ResponseValidationContext,
  ResponseValidationStatus,
  SuggestedRevision,
  ValidateResponseRequest,
} from "./response.js";

export { POLICY_JSON_SCHEMAS, POLICY_SCHEMA_VERSION } from "./json-schema.js";
export type { JsonSchema } from "./json-schema.js";

// --- R7-2: Deterministic Policy Engine ---

export { actionHash, canonicalizeAction, decisionCacheKey, isApprovalStillValid } from "./canonical.js";
export type { CanonicalAction } from "./canonical.js";
export { isEmptyMatcher, matchesStructured } from "./matcher.js";
export { DEFAULT_POLICY_RULES } from "./defaults.js";
export { checkPermissionManifest, isHighRisk, permissionKeysOf } from "./permission.js";
export type { PermissionFinding, PermissionKey, PermissionManifest } from "./permission.js";
export { DeterministicPolicyEngine } from "./engine.js";
export type { DeterministicPolicyEngineOptions } from "./engine.js";
export { auditAction, auditResponse } from "./audit.js";
export type { PolicyAuditRecord } from "./audit.js";
