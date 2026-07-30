// ハッシュ。設計書 §5.3（profile hash）／§6.5（hash 検証失敗は fail closed）。
//
// 同じ入力からは必ず同じ hash が出る必要がある。オブジェクトを JSON にすると
// キーの並び順で結果が変わるため、並びを正規化してから取る。

import { createHash } from "node:crypto";

/** 文字列の SHA-256（16進小文字）。 */
export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** オブジェクトの SHA-256。キー順に依存しない。
 *  undefined の項目は「無い」と同じ扱いにする（JSON.stringify と同じ挙動に揃える）。 */
export function hashObject(value: unknown): string {
  return sha256(canonicalize(value));
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
}
