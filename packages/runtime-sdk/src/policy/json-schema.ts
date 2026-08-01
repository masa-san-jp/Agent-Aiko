// 公開型の JSON Schema。R7 仕様書 R7-1「この段階で Runtime SDK と MCP Tool の
// 入出力を一致させる」。
//
// schema は zod 定義から生成する。手書きすると、型を直したのに schema を直し忘れた
// 状態が作れてしまい、SDK 直呼びと MCP Tool 経由で受理される入力が食い違う。
// R7-5 の contract test（同一入力で同一結果）は、その食い違いを前提にすると成立しない。
//
// **JSON Schema に写らないものがある。** zod の refine（require_approval には
// approval が要る／deny は構造化判定を伴う 等）は生成結果へ出ない。schema 検証を
// 通っただけでは §2.3 や §1 を満たしたことにならない——満たすのは zod 側の parse。
// MCP Tool 側も、入口で JSON Schema を見せたうえで parse は zod で行う。

import { z } from "zod";
import { EvaluateActionRequestSchema, ActionDecisionSchema } from "./action.js";
import { ValidateResponseRequestSchema, ResponseValidationSchema } from "./response.js";
import { PolicyRuleSchema } from "./rule.js";

export type JsonSchema = Record<string, unknown>;

function toJsonSchema(schema: z.ZodType, id: string): JsonSchema {
  return {
    $id: id,
    ...z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }),
  };
}

/** R7-1 が固定する schema 一式。key は MCP Tool 側からも参照する識別子。 */
export const POLICY_JSON_SCHEMAS: Record<string, JsonSchema> = {
  EvaluateActionRequest: toJsonSchema(EvaluateActionRequestSchema, "aiko:EvaluateActionRequest"),
  ActionDecision: toJsonSchema(ActionDecisionSchema, "aiko:ActionDecision"),
  ValidateResponseRequest: toJsonSchema(
    ValidateResponseRequestSchema,
    "aiko:ValidateResponseRequest",
  ),
  ResponseValidation: toJsonSchema(ResponseValidationSchema, "aiko:ResponseValidation"),
  PolicyRule: toJsonSchema(PolicyRuleSchema, "aiko:PolicyRule"),
};

/** schema の版。型を変えたらここを上げる。ActionDecision の policyBundleHash とは別物で、
 *  こちらは「入出力の形」の版。 */
export const POLICY_SCHEMA_VERSION = "1.0.0";
