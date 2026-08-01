// R7-1 の型・schema 固定を確かめる。R7 仕様書 §2 / §4 / §6 / §7 / §8、受入基準 1-8, 12-15。
//
// 「仕様書どおりの型が置いてある」だけなら型検査で足りる。ここで確かめるのは
// **仕様が禁じている形を実際に作れないこと**——4判定以外を受け付けない、
// 承認主体の無い require_approval を作れない、モデル判定だけの deny を作れない、
// 呼び名を別入力で渡せない。これらは型では表現できず、parse でしか止まらない。

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ActionDecisionSchema,
  EvaluateActionRequestSchema,
  POLICY_JSON_SCHEMAS,
  POLICY_LAYERS,
  PolicyRuleSchema,
  ResponseValidationSchema,
  SuggestedRevisionSchema,
  ValidateResponseRequestSchema,
} from "../src/index.js";

const profileRef = { profileId: "p-1", contentHash: "h-1" };

const action = {
  actionId: "a-1",
  type: "file.delete",
  summary: "一時ファイルを消す",
  effects: {
    external: false,
    irreversible: true,
    production: false,
    financial: false,
    privacyRelevant: false,
  },
  proposedBy: "model" as const,
};

const decision = {
  decision: "allow" as const,
  severity: "info" as const,
  confidence: 1,
  enforcement: "observe" as const,
  reasons: [],
  matchedRules: [],
  evaluation: { deterministic: true, semantic: false },
  policyBundleHash: "pb-1",
  profileId: "p-1",
  decidedAt: "2026-08-01T00:00:00.000Z",
};

const validation = {
  status: "valid" as const,
  severity: "info" as const,
  confidence: 1,
  issues: [],
  checked: [],
  validation: { deterministic: true, semantic: false },
  profileId: "p-1",
  policyBundleHash: "pb-1",
  validatedAt: "2026-08-01T00:00:00.000Z",
};

// --- §2 / §8: 判定の種類 ---

test("ActionDecision は §2 の4判定を受け付ける", () => {
  const kinds = ["allow", "allow_with_warning", "require_approval", "deny"] as const;
  const accepted = kinds.filter(
    (kind) =>
      ActionDecisionSchema.safeParse({
        ...decision,
        decision: kind,
        ...(kind === "require_approval"
          ? {
              approval: {
                authority: "user",
                approvalId: "ap-1",
                actionHash: "ah-1",
                prompt: "消していい？",
              },
            }
          : {}),
      }).success,
  );
  assert.deepEqual(accepted, kinds);
});

test("ActionDecision は4判定以外を拒否する", () => {
  const result = ActionDecisionSchema.safeParse({ ...decision, decision: "allow_once" });
  assert.equal(result.success, false);
});

test("ResponseValidation は §8 の4状態を受け付ける", () => {
  const statuses = ["valid", "valid_with_warnings", "revision_required", "blocked"] as const;
  const accepted = statuses.filter(
    (status) =>
      ResponseValidationSchema.safeParse({
        ...validation,
        status,
        ...(status === "blocked"
          ? {
              issues: [
                {
                  code: "SECRET_LEAK",
                  check: "privacy",
                  message: "秘密情報が含まれている",
                  severity: "critical",
                  blocking: true,
                },
              ],
            }
          : {}),
      }).success,
  );
  assert.deepEqual(accepted, statuses);
});

// --- §2.3 / 受入基準 7-8: 承認 ---

test("require_approval は承認主体（approval）が無いと作れない", () => {
  const result = ActionDecisionSchema.safeParse({ ...decision, decision: "require_approval" });
  assert.equal(result.success, false);
});

test("承認は action hash に紐づく（approval に actionHash が必要）", () => {
  const result = ActionDecisionSchema.safeParse({
    ...decision,
    decision: "require_approval",
    approval: { authority: "user", approvalId: "ap-1", prompt: "消していい？" },
  });
  assert.equal(result.success, false);
});

// --- §1 / 受入基準 6: モデル判定だけで deny しない ---

test("deny はモデル判定だけでは作れない", () => {
  const result = ActionDecisionSchema.safeParse({
    ...decision,
    decision: "deny",
    evaluation: { deterministic: false, semantic: true, semanticEvaluator: "local" },
  });
  assert.equal(result.success, false);
});

test("deny は構造化判定を伴えば作れる", () => {
  const result = ActionDecisionSchema.safeParse({
    ...decision,
    decision: "deny",
    evaluation: { deterministic: true, semantic: true, semanticEvaluator: "local" },
  });
  assert.equal(result.success, true);
});

test("semantic matcher の規則に enforcement: block は設定できない", () => {
  const result = PolicyRuleSchema.safeParse({
    id: "r-1",
    version: "1.0.0",
    category: "persona-invariant",
    description: "人格価値観との重大な衝突",
    matcher: { kind: "semantic", rubricId: "value-conflict", question: "衝突しているか" },
    enforcement: "block",
    priority: 100,
    enabled: true,
    source: { layer: "persona-invariant", origin: "aiko" },
  });
  assert.equal(result.success, false);
});

// --- §8: blocked の条件 ---

test("blocked はモデル判定だけでは作れない", () => {
  const result = ResponseValidationSchema.safeParse({
    ...validation,
    status: "blocked",
    validation: { deterministic: false, semantic: true },
    issues: [
      {
        code: "VALUE_CONFLICT",
        check: "value-alignment",
        message: "価値観と衝突",
        severity: "high",
        blocking: true,
      },
    ],
  });
  assert.equal(result.success, false);
});

test("patch 以外の修正方針は書き換え済み本文を持てない", () => {
  const result = SuggestedRevisionSchema.safeParse({
    strategy: "regenerate",
    instructions: ["呼び名を直して書き直す"],
    patchedContent: "書き換えた本文",
  });
  assert.equal(result.success, false);
});

// --- §6 / 受入基準 12-13: 照合元は Runtime Profile ---

test("validateResponse の入力に呼び名を別入力で渡せない", () => {
  const result = ValidateResponseRequestSchema.safeParse({
    requestId: "r-1",
    profileRef,
    response: { responseId: "res-1", content: "マサくん、できたよ" },
    preferredName: "マサくん",
  });
  assert.equal(result.success, false);
});

test("validateResponse の入力は profileRef 以外の人格情報を持たない", () => {
  const parsed = ValidateResponseRequestSchema.parse({
    requestId: "r-1",
    profileRef,
    response: { responseId: "res-1", content: "できたよ" },
  });
  assert.deepEqual(Object.keys(parsed.profileRef).sort(), ["contentHash", "profileId"]);
});

// --- §7.1: 申告の取りこぼしを作らない ---

test("effects を申告しない Action は受け付けない", () => {
  const { effects: _omitted, ...withoutEffects } = action;
  const result = EvaluateActionRequestSchema.safeParse({
    requestId: "r-1",
    profileRef,
    action: withoutEffects,
  });
  assert.equal(result.success, false);
});

test("effects の一部だけを申告した Action は受け付けない", () => {
  const result = EvaluateActionRequestSchema.safeParse({
    requestId: "r-1",
    profileRef,
    action: { ...action, effects: { irreversible: true } },
  });
  assert.equal(result.success, false);
});

test("confidence は 0.0-1.0 の外を受け付けない", () => {
  const result = ActionDecisionSchema.safeParse({ ...decision, confidence: 1.2 });
  assert.equal(result.success, false);
});

// --- §4.2: 優先順位 ---

test("Policy の層は §4.2 の順番どおりに並んでいる", () => {
  assert.deepEqual(POLICY_LAYERS, [
    "host-safety",
    "organization",
    "permission-manifest",
    "persona-invariant",
    "user-privacy",
    "user-approval",
    "semantic-persona",
    "advisory",
  ]);
});

// --- R7-1: JSON Schema ---

test("JSON Schema は R7-1 が挙げた型ぶん揃っている", () => {
  assert.deepEqual(Object.keys(POLICY_JSON_SCHEMAS).sort(), [
    "ActionDecision",
    "EvaluateActionRequest",
    "PolicyRule",
    "ResponseValidation",
    "ValidateResponseRequest",
  ]);
});

test("JSON Schema の ActionDecision は4判定を列挙する", () => {
  const schema = POLICY_JSON_SCHEMAS["ActionDecision"] as {
    properties: { decision: { enum: string[] } };
  };
  assert.deepEqual(schema.properties.decision.enum, [
    "allow",
    "allow_with_warning",
    "require_approval",
    "deny",
  ]);
});

test("JSON Schema の ValidateResponseRequest は未知のキーを許さない", () => {
  // §6 の「呼び名を別入力で渡さない」は、MCP Tool 側の入口でも効く必要がある。
  // zod の refine は JSON Schema に写らないが、strict は additionalProperties に写る。
  const schema = POLICY_JSON_SCHEMAS["ValidateResponseRequest"] as {
    additionalProperties: boolean;
  };
  assert.equal(schema.additionalProperties, false);
});
