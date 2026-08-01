// validateResponse の入出力。R7 仕様書 §7.3 / §7.4、強制力は §8、照合元は §6。

import { z } from "zod";
import {
  ConfidenceSchema,
  EvaluationModeSchema,
  EvaluationOriginSchema,
  RuntimeProfileRefSchema,
  SeveritySchema,
  TraceContextSchema,
} from "./common.js";

/** §7.3。 */
export const ResponseCandidateSchema = z
  .object({
    responseId: z.string().min(1),
    content: z.string(),
    language: z.string().min(1).optional(),
    format: z.enum(["plain-text", "markdown", "json", "code", "mixed"]).optional(),
    channel: z.enum(["chat", "email", "document", "tool-result", "system-message"]).optional(),
    generatedBy: z.string().min(1).optional(),
  })
  .strict();

/** §7.3。 */
export const ResponseValidationContextSchema = z
  .object({
    userMessage: z.string().optional(),
    taskSummary: z.string().optional(),
    actionDecisionRef: z.string().min(1).optional(),
    runtimeId: z.string().min(1).optional(),
    priorResponseIds: z.array(z.string().min(1)).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

/** §7.3。§6.1 が deterministic、§6.2 が semantic に対応する。 */
export const ResponseCheckIdSchema = z.enum([
  "preferred-name",
  "first-person",
  "prohibited-expression",
  "required-expression",
  "persona-identity",
  "value-alignment",
  "uncertainty",
  "relationship",
  "privacy",
  "language",
  "format",
]);

/** §7.3。
 *
 *  strict にしてあるのは §6 のため。呼出側が preferredName や firstPerson を
 *  ここへ渡せてしまうと、照合元が Runtime Profile ではなく呼出側になる。
 *  渡せる口を作らないことでしか防げない。 */
export const ValidateResponseRequestSchema = z
  .object({
    requestId: z.string().min(1),
    profileRef: RuntimeProfileRefSchema,
    response: ResponseCandidateSchema,
    context: ResponseValidationContextSchema.optional(),
    mode: EvaluationModeSchema.optional(),
    checks: z.array(ResponseCheckIdSchema).optional(),
    timeoutMs: z.number().int().positive().optional(),
    traceContext: TraceContextSchema.optional(),
  })
  .strict();

/** §8 の4状態。 */
export const ResponseValidationStatusSchema = z.enum([
  "valid",
  "valid_with_warnings",
  "revision_required",
  "blocked",
]);

/** §7.4。evidence は該当箇所の抜粋。応答全文は載せない（§14）。 */
export const ResponseIssueSchema = z
  .object({
    code: z.string().min(1),
    check: ResponseCheckIdSchema,
    message: z.string().min(1),
    severity: SeveritySchema,
    location: z.object({ start: z.number().int().min(0), end: z.number().int().min(0) }).strict().optional(),
    evidence: z.string().optional(),
    blocking: z.boolean(),
  })
  .strict();

/** どの検査を実際に走らせたか。走らせていない検査を「合格」と区別するために、
 *  evaluated と passed を分けて持つ。 */
export const ResponseCheckResultSchema = z
  .object({
    check: ResponseCheckIdSchema,
    evaluated: z.boolean(),
    passed: z.boolean(),
    method: z.enum(["deterministic", "semantic"]),
    /** evaluated が false のときの理由（未実装・timeout・対象外）。 */
    skippedReason: z.string().min(1).optional(),
  })
  .strict();

/** §7.4 / §8。形式的違反だけ patch を許し、意味を変える書き換えは regenerate。 */
export const SuggestedRevisionSchema = z
  .object({
    strategy: z.enum(["patch", "regenerate", "remove-content", "add-disclosure"]),
    instructions: z.array(z.string().min(1)),
    patchedContent: z.string().optional(),
  })
  .strict()
  .refine((r) => r.strategy === "patch" || r.patchedContent === undefined, {
    // §8: Validator が意味を変更する全文書換えを勝手に行ってはならない。
    // patch 以外に本文を持たせられると、「再生成してね」と言いながら
    // 書き換え済みの本文を差し出すことになる。
    message: "patchedContent を持てるのは strategy: patch のときだけ（R7 §8）",
    path: ["patchedContent"],
  });

/** §7.4。 */
export const ResponseValidationSchema = z
  .object({
    status: ResponseValidationStatusSchema,
    severity: SeveritySchema,
    confidence: ConfidenceSchema,
    issues: z.array(ResponseIssueSchema),
    checked: z.array(ResponseCheckResultSchema),
    suggestedRevision: SuggestedRevisionSchema.optional(),
    validation: EvaluationOriginSchema,
    profileId: z.string().min(1),
    policyBundleHash: z.string().min(1),
    validatedAt: z.string().min(1),
  })
  .strict()
  .refine((v) => v.status !== "blocked" || v.validation.deterministic, {
    // §8: モデルによる価値観評価だけでは原則 revision_required まで。
    // blocked（送信禁止）は構造化された根拠を伴う必要がある。
    message: "blocked は構造化された検査による根拠を伴う必要がある（R7 §8）",
    path: ["validation", "deterministic"],
  })
  .refine((v) => v.status !== "blocked" || v.issues.some((i) => i.blocking), {
    // 送信禁止なのに blocking な issue が1つも無い状態は、理由を示せていない。
    message: "blocked には blocking な issue が必要（R7 §8）",
    path: ["issues"],
  });

export type ResponseCandidate = z.infer<typeof ResponseCandidateSchema>;
export type ResponseValidationContext = z.infer<typeof ResponseValidationContextSchema>;
export type ResponseCheckId = z.infer<typeof ResponseCheckIdSchema>;
export type ValidateResponseRequest = z.infer<typeof ValidateResponseRequestSchema>;
export type ResponseValidationStatus = z.infer<typeof ResponseValidationStatusSchema>;
export type ResponseIssue = z.infer<typeof ResponseIssueSchema>;
export type ResponseCheckResult = z.infer<typeof ResponseCheckResultSchema>;
export type SuggestedRevision = z.infer<typeof SuggestedRevisionSchema>;
export type ResponseValidation = z.infer<typeof ResponseValidationSchema>;
