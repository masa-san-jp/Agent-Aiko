// 応答契約。R7 仕様書 §6「validateResponse の照合元は Runtime Profile」。
//
// §6 が挙げる項目のうち、**構造として判定できるものだけ**をここに置く。
// 人格本文（identity core / behavioral contract）は自然文で、そのままでは
// 「一人称が違う」を機械判定できない。判定できる形で宣言されたものだけを見る。
//
// 宣言が無い項目は「合格」ではなく「検査していない」として返す（validator 側）。
// 無い規則を勝手に作ると、人格が決めていないことを人格の名前で強制することになる。

import { z } from "zod";

/** 禁止語の宣言。
 *
 *  文字列だけなら「見つけたら指摘する」。置換先まで書けば「そのまま直す」。
 *  自動で直せるのは、直した結果が宣言から一意に決まるときだけ——
 *  "私は" を一人称 "あたし" で置き換えると "あたし直しておいたよ" になる。
 *  何をどう直すかは人格側が決めることで、Validator が推測してよいことではない（§8）。 */
export const ProhibitedTermSchema = z.union([
  z.string().min(1),
  z.object({ text: z.string().min(1), replaceWith: z.string().min(1) }).strict(),
]);

export type ProhibitedTerm = z.infer<typeof ProhibitedTermSchema>;

export function termText(term: ProhibitedTerm): string {
  return typeof term === "string" ? term : term.text;
}

export function termReplacement(term: ProhibitedTerm): string | undefined {
  return typeof term === "string" ? undefined : term.replaceWith;
}

export const ResponseContractSchema = z
  .object({
    /** ユーザーの呼び名。User Profile の identity.preferred_name から来る。 */
    preferredName: z.string().min(1).optional(),
    /** 使ってはいけない呼び方。宣言が無ければ呼び名の検査は行わない——
     *  「呼び名が違う」を一般に判定するのは意味判断で、この層にはできない。 */
    prohibitedNames: z.array(ProhibitedTermSchema).optional(),
    /** 人格の一人称。 */
    firstPerson: z.string().min(1).optional(),
    /** 使ってはいけない一人称。部分一致で見るので、"私" ではなく "私は" のように
     *  誤検出しにくい形で宣言する。 */
    prohibitedFirstPersons: z.array(ProhibitedTermSchema).optional(),
    prohibitedExpressions: z.array(ProhibitedTermSchema).optional(),
    requiredExpressions: z.array(z.string().min(1)).optional(),
    /** 断定してはいけない言い回し（§6.1「禁止された断定表現」）。 */
    prohibitedAssertions: z.array(ProhibitedTermSchema).optional(),
    /** BCP 47。User Profile の communication.language から来る。 */
    language: z.string().min(1).optional(),
    /** 秘密情報の形（正規表現）。既定の検出に足す分だけを宣言する。 */
    secretPatterns: z.array(z.string().min(1)).optional(),
  })
  .strict();

export type ResponseContract = z.infer<typeof ResponseContractSchema>;

/** Runtime Profile から契約を取り出す。持っていなければ undefined。
 *  Profile の形そのものには依存しない——binder の型を SDK の判定へ持ち込むと、
 *  §1 が禁じている依存の向きになる。 */
export function responseContractOf(profile: unknown): ResponseContract | undefined {
  if (typeof profile !== "object" || profile === null) return undefined;
  const raw = (profile as Record<string, unknown>)["response_contract"];
  if (raw === undefined) return undefined;
  const parsed = ResponseContractSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/** 既定の秘密情報パターン。よく出る鍵の形だけ。網羅は狙わない——
 *  網羅したつもりになると、通ったことを「秘密が無い」証明として使ってしまう。 */
export const DEFAULT_SECRET_PATTERNS: readonly string[] = [
  "gh[pousr]_[A-Za-z0-9]{16,}",
  "sk-[A-Za-z0-9]{20,}",
  "AKIA[0-9A-Z]{16}",
  "-----BEGIN [A-Z ]*PRIVATE KEY-----",
  "xox[baprs]-[A-Za-z0-9-]{10,}",
];
