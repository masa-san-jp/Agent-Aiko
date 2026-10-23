// Permission Manifest 照合。R7 仕様書 R7-2、Manifest の形は
// schemas/permission-manifest.schema.json。
//
// ここが返すのは「権限として許されているか」だけ。人格や作法の判断はしない。
// §2.4 が deny の対象に挙げる「権限外操作」を出せるのはこの層と Host / Organization だけで、
// 既定規則（defaults.ts）は deny を出さない。

import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { CandidateAction } from "./action.js";

/** Manifest 側の語彙（schemas/permission-manifest.schema.json の require_for）。 */
export type PermissionKey =
  | "file-write"
  | "file-delete"
  | "shell"
  | "network"
  | "git-push"
  | "external-send";

export interface PermissionManifest {
  schema_version: number;
  runtime_id: string;
  filesystem?: { readable_paths?: string[]; writable_paths?: string[] };
  network?: { outbound?: "denied" | "allowlist" | "allowed"; allowed_hosts?: string[] };
  approval?: { policy?: string; require_for?: PermissionKey[] };
  sandbox?: { mode?: "read-only" | "workspace-write" | "danger-full-access" };
}

/** action.type から権限語彙への対応。**表で持つ。**
 *  文字列の当てずっぽう（"delete" を含むから削除だ、等）で権限を決めると、
 *  名前を変えた瞬間に静かに緩む。 */
const ACTION_TYPE_PERMISSIONS: Record<string, PermissionKey[]> = {
  "file.write": ["file-write"],
  "file.overwrite": ["file-write"],
  "file.delete": ["file-delete"],
  "shell.exec": ["shell"],
  "network.request": ["network"],
  "git.push": ["git-push"],
  "git.force-push": ["git-push"],
  "email.send": ["external-send", "network"],
  "calendar.write": ["external-send", "network"],
  "issue.write": ["external-send", "network"],
};

/** その Action が要求する権限。Adapter が requestedPermissions で明示していれば
 *  それを優先し、無ければ type から引く。どちらも無ければ空。 */
export function permissionKeysOf(action: CandidateAction): PermissionKey[] {
  const declared = (action.requestedPermissions ?? []).filter((p): p is PermissionKey =>
    (
      ["file-write", "file-delete", "shell", "network", "git-push", "external-send"] as string[]
    ).includes(p),
  );
  const fromType = ACTION_TYPE_PERMISSIONS[action.type] ?? [];
  return [...new Set([...declared, ...fromType])];
}

export interface PermissionFinding {
  /** §3.4 の判定不能時の扱いに対応する。
   *  - denied: 権限として許されていない（§2.4 の権限外操作）
   *  - unresolved: **権限情報そのものが無い** → deny
   *  - indeterminate: 権限情報はあるが Action 側の申告が足りず照合できない
   *    → 高リスクなら承認を求める。ここを deny にすると、申告漏れというだけで
   *      正当な操作が止まる（§12.4 の誤 deny）。 */
  kind: "denied" | "approval-required" | "unresolved" | "indeterminate";
  code: string;
  message: string;
  remediation: string;
}

/** 存在する最も近い親を realpath し、まだ無い部分は字句的に足す。
 *  パス自体が無い書き込み先でも、親が外へのリンクなら先を見る。 */
function canonical(input: string): string {
  const absolute = resolve(input);
  const missing: string[] = [];
  let current = absolute;
  for (;;) {
    try {
      const real = realpathSync(current);
      return missing.reduceRight((acc, part) => resolve(acc, part), real);
    } catch {
      const parent = dirname(current);
      if (parent === current) return absolute;
      missing.push(basename(current));
      current = parent;
    }
  }
}

/** 絶対パスだけを範囲内とみなす。`/ws/../etc` は文字列の前方一致では `/ws` の中に見える。 */
function isUnder(path: string, root: string): boolean {
  if (!isAbsolute(path) || !isAbsolute(root)) return false;
  const rel = relative(canonical(root), canonical(path));
  if (rel === "") return true;
  if (isAbsolute(rel)) return false;
  return rel !== ".." && !rel.startsWith(`..${sep}`);
}

/** 高リスク＝権限が分からないままでは進めない操作（受入基準 9）。 */
export function isHighRisk(action: CandidateAction): boolean {
  const e = action.effects;
  return e.irreversible || e.external || e.production || e.financial || e.privacyRelevant;
}

export function checkPermissionManifest(
  action: CandidateAction,
  manifest: PermissionManifest | undefined,
): PermissionFinding[] {
  const keys = permissionKeysOf(action);

  if (manifest === undefined) {
    // §3.4「権限情報そのものが欠落 → deny」。ただし読取りや局所計算まで止めると
    // 何も動かないので、対象は高リスク操作と権限を要する操作に限る。
    if (isHighRisk(action) || keys.length > 0) {
      return [
        {
          kind: "unresolved",
          code: "PERMISSION_UNRESOLVED",
          message: "権限情報が無いため、この操作を許可できるか判断できません",
          remediation: "Permission Manifest を渡してから再度評価してください",
        },
      ];
    }
    return [];
  }

  const findings: PermissionFinding[] = [];
  const writes = keys.includes("file-write") || keys.includes("file-delete");

  if (writes && manifest.sandbox?.mode === "read-only") {
    findings.push({
      kind: "denied",
      code: "SANDBOX_READ_ONLY",
      message: "読取り専用の実行環境では書き込みできません",
      remediation: "書き込みが必要なら実行環境の設定を変えてください",
    });
  }

  if (writes) {
    const writable = manifest.filesystem?.writable_paths;
    const fileTargets = (action.targets ?? []).filter((t) => t.type === "file");
    if (writable === undefined) {
      findings.push({
        kind: "unresolved",
        code: "PERMISSION_UNRESOLVED",
        message: "書き込みを許す範囲が宣言されていません",
        remediation: "Permission Manifest の filesystem.writable_paths を宣言してください",
      });
    } else if (fileTargets.length === 0) {
      findings.push({
        kind: "indeterminate",
        code: "FILE_TARGET_UNKNOWN",
        message: "書き込み先が申告されていないため、許された範囲と照合できません",
        remediation: "targets に type: file で書き込み先を申告してください",
      });
    } else {
      const outside = fileTargets.filter((t) => !writable.some((root) => isUnder(t.identifier, root)));
      if (outside.length > 0) {
        findings.push({
          kind: "denied",
          code: "PATH_NOT_WRITABLE",
          // 対象の中身は載せない（§14）。件数だけで足りる。
          message: `書き込みを許されていない場所への操作です（対象 ${outside.length} 件）`,
          remediation: "対象を writable_paths の中へ移すか、権限の範囲を見直してください",
        });
      }
    }
  }

  const needsNetwork = keys.includes("network") || keys.includes("external-send");
  if (needsNetwork) {
    const outbound = manifest.network?.outbound ?? "denied";
    if (outbound === "denied") {
      findings.push({
        kind: "denied",
        code: "NETWORK_DENIED",
        message: "外部への通信が許可されていません",
        remediation: "通信が必要なら Permission Manifest の network を見直してください",
      });
    } else if (outbound === "allowlist") {
      const allowed = manifest.network?.allowed_hosts ?? [];
      const hosts = (action.targets ?? [])
        .filter((t) => t.type === "service")
        .map((t) => t.identifier);
      const blocked = hosts.filter((h) => !allowed.includes(h));
      if (hosts.length === 0) {
        findings.push({
          kind: "indeterminate",
          code: "NETWORK_TARGET_UNKNOWN",
          message: "通信先が申告されていないため、許可リストと照合できません",
          remediation: "targets に type: service で通信先を申告してください",
        });
      } else if (blocked.length > 0) {
        findings.push({
          kind: "denied",
          code: "NETWORK_HOST_NOT_ALLOWED",
          message: `許可リストに無い通信先です（${blocked.length} 件）`,
          remediation: "通信先を allowed_hosts へ加えるか、別の手段を使ってください",
        });
      }
    }
  }

  const requireFor = manifest.approval?.require_for ?? [];
  const hit = keys.filter((k) => requireFor.includes(k));
  if (hit.length > 0) {
    findings.push({
      kind: "approval-required",
      code: "MANIFEST_REQUIRES_APPROVAL",
      message: `実行環境がこの操作に承認を求めています（${hit.join(", ")}）`,
      remediation: "内容を示して承認を求めてください",
    });
  }

  return findings;
}
