// Capability Registry。設計書 §5.5 / §6.3。
//
// 実行環境から集めた能力の目録を保持し、使えるものと使えないものに分ける。
// §6.5 の末尾が「Tool や Skill の一部が利用不能な場合は、その能力を除外して警告
// する」と定めている＝ここは fail closed にしない。ただし黙って落とすと、ある
// つもりで呼んで失敗するので、除外したものは理由つきで残す。
//
// 認証情報の値は決して受け取らない（§3.3）。values_included: true を宣言した
// Manifest は、その時点で扱ってはいけないものなので拒否する。

import { checkSchemaVersion } from "@agent-aiko/core";

/** Capability Manifest の現行 schema_version。 */
export const CAPABILITY_MANIFEST_SCHEMA_VERSION = 1;

export type Availability = "ready" | "unavailable" | "unknown";

export interface CapabilityEntry {
  /** 目録上の種別。指示文では区別せず一覧にするが、除外理由の説明に使う。 */
  kind: "tool" | "mcp-server" | "skill";
  id: string;
  /** "invalid" は Manifest が既知でない値を宣言していた場合。目録側の値ではない。 */
  availability: Availability | "invalid";
}

export interface ResolvedCapabilities {
  /** 使える能力の識別子（重複排除・昇順）。 */
  available: string[];
  /** 使えない能力と理由。除外しても続行する（§6.5 末尾）。 */
  excluded: Array<{ id: string; reason: string }>;
}

export class CapabilityManifestError extends Error {
  override readonly name = "CapabilityManifestError";
}

export interface CapabilityRegistryOptions {
  currentSchemaVersion?: number;
}

export class CapabilityRegistry {
  readonly #currentSchemaVersion: number;

  constructor(options: CapabilityRegistryOptions = {}) {
    this.#currentSchemaVersion =
      options.currentSchemaVersion ?? CAPABILITY_MANIFEST_SCHEMA_VERSION;
  }

  resolve(manifest: unknown): ResolvedCapabilities {
    if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
      throw new CapabilityManifestError("Capability Manifest がオブジェクトではありません");
    }
    const m = manifest as Record<string, unknown>;

    const verdict = checkSchemaVersion(
      typeof m["schema_version"] === "number" ? (m["schema_version"] as number) : Number.NaN,
      this.#currentSchemaVersion,
    );
    if (!verdict.accepted) {
      throw new CapabilityManifestError(`Capability Manifest を読めません: ${verdict.reason}`);
    }

    // 認証情報の値が入っている宣言は、受け取った時点で §3.3 違反になる。
    const credentials = asRecord(m["credentials"]);
    if (credentials && credentials["values_included"] === true) {
      throw new CapabilityManifestError(
        "Capability Manifest が認証情報の値を含むと宣言しています。Aiko-MCP は認証情報を扱いません（設計書 §3.3）",
      );
    }

    const entries = [
      ...readEntries(m["built_in_tools"], "tool"),
      ...readEntries(m["mcp_servers"], "mcp-server"),
      ...readEntries(m["skills"], "skill"),
    ];

    const available = new Set<string>();
    const excluded: Array<{ id: string; reason: string }> = [];
    for (const entry of entries) {
      if (entry.availability === "ready") {
        available.add(entry.id);
      } else {
        excluded.push({ id: entry.id, reason: reasonFor(entry) });
      }
    }

    return {
      available: [...available].sort(),
      excluded: excluded.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    };
  }
}

/** availability の扱いは3通りに分ける。
 *  - 項目が無い → "ready"。§6.3 の例は built_in_tools に availability を書いて
 *    おらず、それを使えないものとして落とすと目録どおりの環境が空になる。
 *  - 既知の値 → そのまま。
 *  - 値はあるが不正 → "invalid"。**"ready" に丸めない。** 宣言が壊れている
 *    ものを、一番許す側へ倒すのは危険側の既定になる。止めはしないが（§6.5 末尾）、
 *    除外して理由を残す。 */
function readEntries(value: unknown, kind: CapabilityEntry["kind"]): CapabilityEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: CapabilityEntry[] = [];
  for (const item of value) {
    const record = asRecord(item);
    const id = record?.["id"];
    if (typeof id !== "string" || id.length === 0) continue;
    const declared = record === undefined ? undefined : record["availability"];
    const availability: CapabilityEntry["availability"] =
      declared === undefined ? "ready" : isAvailability(declared) ? declared : "invalid";
    entries.push({ kind, id, availability });
  }
  return entries;
}

function reasonFor(entry: CapabilityEntry): string {
  const label =
    entry.kind === "mcp-server" ? "MCP サーバー" : entry.kind === "skill" ? "スキル" : "ツール";
  switch (entry.availability) {
    case "unavailable":
      return `${label}が利用できません`;
    case "invalid":
      return `${label}の利用可否の宣言が不正です`;
    default:
      return `${label}の利用可否を確認できません`;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isAvailability(value: unknown): value is Availability {
  return value === "ready" || value === "unavailable" || value === "unknown";
}
