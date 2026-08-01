// 出力の形。設計書 §4.4 の状態確認の見た目に合わせる。
//
// 色を付けない。CI のログやリダイレクト先で読めなくなるより、どの環境でも
// 同じに見えるほうを取る。

import type { CheckResult } from "./checks.js";
import type { Status } from "./status.js";

export function renderStatus(status: Status): string {
  const lines = [
    `Aiko-MCP ${status.version}`,
    `Persona: ${status.persona}`,
    `User: ${status.user}`,
    `Binding: ${status.binding}`,
  ];
  if (status.bindingDetail) {
    lines.push(`  理由: ${status.bindingDetail}`);
  }
  // §20.7 は「Claude Code と Codex が同じ profile hash を表示すること」を受入条件に
  // している。実際に一致するのは人格の中身の hash で、起動の hash は注入手段を
  // 含むため経路ごとに変わる（§14.1）。**両方出す**——片方だけだと、
  // 一致するはずのものと変わるはずのものが混ざる。
  if (status.configurationHash) {
    lines.push(`人格の中身: ${status.configurationHash}`);
  }
  if (status.profileHash) {
    lines.push(`この起動:   ${status.profileHash}`);
  }
  lines.push("Adapters:");
  const width = Math.max(...status.adapters.map((a) => a.name.length));
  for (const adapter of status.adapters) {
    const state = adapter.installed ? "ready" : "not installed";
    const level = adapter.installed && adapter.level === 2 ? "  Level 2" : "";
    lines.push(`  ${adapter.name.padEnd(width)}  ${state}${level}`);
  }
  return lines.join("\n") + "\n";
}

const MARK: Record<CheckResult["level"], string> = {
  ok: "ok  ",
  warn: "warn",
  fail: "FAIL",
};

export function renderChecks(results: readonly CheckResult[], fixed: readonly string[]): string {
  const lines = results.map((r) => `${MARK[r.level]}  ${r.title}\n      ${r.detail}`);
  const fixable = results.filter((r) => r.fix && !fixed.includes(r.id));
  if (fixed.length > 0) {
    lines.push("", `直したもの: ${fixed.join(", ")}`);
  }
  if (fixable.length > 0) {
    lines.push("", `\`aiko doctor --fix\` で直せるもの: ${fixable.map((r) => r.id).join(", ")}`);
  }
  return lines.join("\n") + "\n";
}
