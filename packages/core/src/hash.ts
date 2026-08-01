// ハッシュ。設計書 §5.3（profile hash）／§6.5（hash 検証失敗は fail closed）。
//
// 同じ入力からは必ず同じ hash が出る必要がある。オブジェクトを JSON にすると
// キーの並び順で結果が変わるため、並びを正規化してから取る。

import { createHash } from "node:crypto";

/** 文字列の SHA-256（16進小文字）。 */
export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** 入れ子の上限。これを超える入力は、正規化の再帰でスタックを使い切って
 *  RangeError になっていた（SDK 設計書 §20.6 の schema bomb で実測）。
 *  制御された拒否に変える——落ちる場所と理由が分からない例外は扱いようがない。
 *  実用の Profile は数段しかないので、64 で足りないものは入力側が異常。 */
export const MAX_HASH_DEPTH = 64;

export class HashInputError extends Error {
  override readonly name = "HashInputError";
}

/** オブジェクトの SHA-256。キー順に依存しない。
 *  undefined の項目は「無い」と同じ扱いにする（JSON.stringify と同じ挙動に揃える）。 */
export function hashObject(value: unknown): string {
  return sha256(canonicalize(value, 0));
}

function canonicalize(value: unknown, depth: number): string {
  if (depth > MAX_HASH_DEPTH) {
    throw new HashInputError(`入れ子が深すぎます（上限 ${MAX_HASH_DEPTH} 段）`);
  }
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => canonicalize(v, depth + 1)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v, depth + 1)}`).join(",")}}`;
}
