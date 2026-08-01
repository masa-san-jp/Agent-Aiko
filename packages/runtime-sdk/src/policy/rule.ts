// Policy Rule と matcher。R7 仕様書 §4。
//
// §4 は「判定可能な項目を構造化し、意味的な人格判断だけをモデルへ委ねる」（案C）。
// したがって matcher は2種類しかない：構造化で書けるもの（StructuredMatcher）と、
// 書けないもの（SemanticMatcher）。**両方を混ぜた matcher は作らない。**
// 混ぜられると「この deny はモデル判定由来か」が判別できなくなり、
// §1 の「モデル判定だけを根拠に deny しない」を検査できなくなる。

import { z } from "zod";
import {
  ApprovalAuthoritySchema,
  ConfidenceSchema,
  EnforcementModeSchema,
  SeveritySchema,
} from "./common.js";

/** §7.1 の ActionTarget.type。matcher 側でも参照する。 */
export const ActionTargetTypeSchema = z.enum([
  "file",
  "repository",
  "issue",
  "email",
  "calendar-event",
  "database",
  "service",
  "user",
  "other",
]);

/** §7.1 の dataClassification。 */
export const DataClassificationSchema = z.enum([
  "public",
  "internal",
  "confidential",
  "secret",
  "personal",
]);

/** §7.1 の environment。 */
export const EnvironmentSchema = z.enum(["local", "development", "staging", "production"]);

/** §7.1 の proposedBy。 */
export const ActionProposerSchema = z.enum(["model", "user", "adapter", "automation"]);

/** §4 の machine_policy が指せる条件。**書いた条件はすべて満たす（AND）**、
 *  配列の中はどれか1つで満たす（OR）。条件を1つも書かない matcher は
 *  全 Action に当たってしまうので、R7-2 の rule 読み込み時に拒否する。 */
export const StructuredMatcherSchema = z
  .object({
    kind: z.literal("structured"),
    actionTypes: z.array(z.string().min(1)).optional(),
    toolIds: z.array(z.string().min(1)).optional(),
    operations: z.array(z.string().min(1)).optional(),
    /** §7.1 の effects。指定した項目だけを見る。 */
    effects: z
      .object({
        external: z.boolean().optional(),
        irreversible: z.boolean().optional(),
        production: z.boolean().optional(),
        financial: z.boolean().optional(),
        privacyRelevant: z.boolean().optional(),
      })
      .strict()
      .optional(),
    targetTypes: z.array(ActionTargetTypeSchema).optional(),
    dataClassifications: z.array(DataClassificationSchema).optional(),
    /** Permission Manifest 側の権限名。§4.2 の 3 番目の層で使う。 */
    requiredPermissions: z.array(z.string().min(1)).optional(),
    environments: z.array(EnvironmentSchema).optional(),
    proposedBy: z.array(ActionProposerSchema).optional(),
  })
  .strict();

/** §1 のモデル判定側。rubricId は R7-4 の Semantic Evaluator が持つ評価軸の id。
 *  appliesTo を付けると「まず構造で絞ってから聞く」ができる（§5.2 の Stage 2 は
 *  構造化規則で決まらないときだけ呼ぶ）。 */
export const SemanticMatcherSchema = z
  .object({
    kind: z.literal("semantic"),
    rubricId: z.string().min(1),
    /** 評価者へ渡す問い。人格本文そのものは渡さない（§14）。 */
    question: z.string().min(1),
    /** これを下回る confidence では規則を成立させない（§2.6 / R7-4）。 */
    minConfidence: ConfidenceSchema.optional(),
    appliesTo: StructuredMatcherSchema.optional(),
  })
  .strict();

/** §4.2 の優先順位。**並び順が優先順位そのもの**なので、
 *  層を増やすときはここの順番を変えることになる。 */
export const POLICY_LAYERS = [
  "host-safety",
  "organization",
  "permission-manifest",
  "persona-invariant",
  "user-privacy",
  "user-approval",
  "semantic-persona",
  "advisory",
] as const;

export const PolicyLayerSchema = z.enum(POLICY_LAYERS);

/** 規則がどこから来たか。層は §4.2 の 8 段、origin はその中の出所。 */
export const PolicySourceSchema = z
  .object({
    layer: PolicyLayerSchema,
    /** 人格パッケージ名、Organization Policy 名など。秘密は入れない。 */
    origin: z.string().min(1),
    ruleSetVersion: z.string().min(1).optional(),
  })
  .strict();

/** §4.1。 */
export const PolicyRuleSchema = z
  .object({
    id: z.string().min(1),
    version: z.string().min(1),
    category: z.enum([
      "permission",
      "approval",
      "irreversibility",
      "persona-invariant",
      "safety",
      "privacy",
      "relationship",
      "response-style",
      "organization",
    ]),
    description: z.string().min(1),
    matcher: z.union([StructuredMatcherSchema, SemanticMatcherSchema]),
    enforcement: EnforcementModeSchema,
    approvalAuthority: ApprovalAuthoritySchema.optional(),
    priority: z.number().int(),
    enabled: z.boolean(),
    source: PolicySourceSchema,
    remediation: z.string().min(1).optional(),
    severity: SeveritySchema.optional(),
  })
  .strict()
  .refine((rule) => !(rule.matcher.kind === "semantic" && rule.enforcement === "block"), {
    // §1: モデル判定だけを根拠として不可逆的に拒否してはならない。block は
    // 「承認でも解除不可」（§3.1）＝最も不可逆なので、意味判定には持たせない。
    // 規約として書くのではなく、その組み合わせの規則を**作れなくする**。
    message: "semantic matcher に enforcement: block は設定できない（R7 §1）",
    path: ["enforcement"],
  });

export type ActionTargetType = z.infer<typeof ActionTargetTypeSchema>;
export type DataClassification = z.infer<typeof DataClassificationSchema>;
export type Environment = z.infer<typeof EnvironmentSchema>;
export type ActionProposer = z.infer<typeof ActionProposerSchema>;
export type StructuredMatcher = z.infer<typeof StructuredMatcherSchema>;
export type SemanticMatcher = z.infer<typeof SemanticMatcherSchema>;
export type PolicyLayer = z.infer<typeof PolicyLayerSchema>;
export type PolicySource = z.infer<typeof PolicySourceSchema>;
export type PolicyRule = z.infer<typeof PolicyRuleSchema>;
