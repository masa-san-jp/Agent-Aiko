// Policy Engine / Response Validator で共有する基本型。R7 仕様書 §2 / §3 / §6 / §7。
//
// 型は zod で1回だけ定義し、TypeScript 型は z.infer で導く。仕様書 R7-1 は
// 「この段階で Runtime SDK と MCP Tool の入出力を一致させる」と定めており、
// 手書きの interface と別に検証用 schema を置くと、片方だけ直された時点で
// 一致しなくなる。定義が1つなら、ずれようがない。
//
// request 側は strict（未知キーを拒否）にしてある。§6 は「呼出側が毎回、
// 正しい呼び名等を別入力で渡してはならない」と定めており、strict でなければ
// 余計な入力は黙って捨てられ、渡した側は渡せたつもりのまま気づかない。

import { z } from "zod";

/** §2.5。判定そのものとは別に持つ深刻度。 */
export const SeveritySchema = z.enum(["info", "low", "medium", "high", "critical"]);

/** §3.1。規則ごとの強制力。observe → block の順に強い。 */
export const EnforcementModeSchema = z.enum(["observe", "warn", "approve", "block"]);

/** §2.7。承認できるのは誰か。Adapter は推測しない。 */
export const ApprovalAuthoritySchema = z.enum([
  "user",
  "repository_owner",
  "organization_admin",
  "security_admin",
  "runtime_host",
  "external_system",
]);

/** §6。照合元は Runtime Profile だけ。呼び名や人格ルールはここから引く。 */
export const RuntimeProfileRefSchema = z
  .object({
    profileId: z.string().min(1),
    contentHash: z.string().min(1),
  })
  .strict();

/** §7.1 / §7.3。追跡用。本文や引数は載せない（§14 の記録禁止）。 */
export const TraceContextSchema = z
  .object({
    traceId: z.string().min(1),
    spanId: z.string().min(1).optional(),
    parentSpanId: z.string().min(1).optional(),
  })
  .strict();

/** §7.1 / §7.3。enforce は「機能が無ければ処理を始めない」、
 *  advisory は「警告として Host Policy へ委ねる」（§9）。 */
export const EvaluationModeSchema = z.enum(["enforce", "advisory"]);

/** §5.2。構造化規則だけで決めたのか、モデル判定を通したのか。
 *  §1 の「モデル判定だけを根拠に deny しない」を検査できる形にするために、
 *  結果へ必ず載せる。 */
export const EvaluationOriginSchema = z
  .object({
    deterministic: z.boolean(),
    semantic: z.boolean(),
    semanticEvaluator: z.string().min(1).optional(),
  })
  .strict();

/** §2.6。モデル判定を含むときの確からしさ。構造化規則だけなら原則 1.0。 */
export const ConfidenceSchema = z.number().min(0).max(1);

export type Severity = z.infer<typeof SeveritySchema>;
export type EnforcementMode = z.infer<typeof EnforcementModeSchema>;
export type ApprovalAuthority = z.infer<typeof ApprovalAuthoritySchema>;
export type RuntimeProfileRef = z.infer<typeof RuntimeProfileRefSchema>;
export type TraceContext = z.infer<typeof TraceContextSchema>;
export type EvaluationMode = z.infer<typeof EvaluationModeSchema>;
export type EvaluationOrigin = z.infer<typeof EvaluationOriginSchema>;
