// Golden Test の実行部。設計書 §12.1。
//
// 2段構えにしてある。
//
//   1. 応答を作る（人格を適用したモデルに投げかける）
//   2. 応答が合格条件を満たすかを判定する
//
// どちらもモデルが要る。**CI では動かさない。** 判定にモデルを使う以上、結果は
// 完全には再現しない。再現しないものを PR の合否に混ぜると、人格と無関係な
// 揺らぎでマージが止まる。ここは明示的に走らせる検査として置く。
//
// モデルの呼び出しは差し替え可能にしてある。手元のローカルモデルでも、別の
// 提供元でも、同じ手順で回せるようにするため。

import { DIMENSIONS, type Dimension, type DimensionId, type Probe } from "./dimensions.js";

/** モデルへの1往復。system に人格、user に投げかけを置く。 */
export type Respond = (system: string, user: string) => Promise<string>;

/** 応答が合格条件を満たすかを判定する。理由も返す。 */
export type Judge = (probe: Probe, response: string) => Promise<Verdict>;

export interface Verdict {
  pass: boolean;
  reason: string;
}

export interface ProbeResult {
  dimension: DimensionId;
  prompt: string;
  criterion: string;
  response: string;
  verdict: Verdict;
}

export interface GoldenReport {
  results: ProbeResult[];
  byDimension: Array<{ id: DimensionId; title: string; passed: number; total: number }>;
  passed: number;
  total: number;
}

export interface RunOptions {
  /** 人格を適用した指示文。Binder が合成したものを渡す。 */
  instructions: string;
  respond: Respond;
  judge: Judge;
  dimensions?: readonly Dimension[];
  /** 1件終わるごとに呼ばれる。長いので進捗を出せるようにしてある。 */
  onProgress?: (done: number, total: number, result: ProbeResult) => void;
}

export async function runGolden(options: RunOptions): Promise<GoldenReport> {
  const dimensions = options.dimensions ?? DIMENSIONS;
  const results: ProbeResult[] = [];
  const total = dimensions.reduce((n, d) => n + d.probes.length, 0);

  for (const dimension of dimensions) {
    for (const probe of dimension.probes) {
      // 直列に回す。並列にすると、ローカルモデルでは待ち時間が伸びるだけで速くならない。
      const response = await options.respond(options.instructions, probe.prompt);
      const verdict = await options.judge(probe, response);
      const result: ProbeResult = {
        dimension: dimension.id,
        prompt: probe.prompt,
        criterion: probe.criterion,
        response,
        verdict,
      };
      results.push(result);
      options.onProgress?.(results.length, total, result);
    }
  }

  const byDimension = dimensions.map((d) => {
    const mine = results.filter((r) => r.dimension === d.id);
    return {
      id: d.id,
      title: d.title,
      passed: mine.filter((r) => r.verdict.pass).length,
      total: mine.length,
    };
  });

  return {
    results,
    byDimension,
    passed: results.filter((r) => r.verdict.pass).length,
    total: results.length,
  };
}

export function renderReport(report: GoldenReport): string {
  const lines: string[] = [];
  for (const d of report.byDimension) {
    const mark = d.passed === d.total ? "ok  " : "FAIL";
    lines.push(`${mark}  ${d.title}  ${d.passed}/${d.total}`);
  }
  const failures = report.results.filter((r) => !r.verdict.pass);
  if (failures.length > 0) {
    lines.push("", "満たさなかったもの:");
    for (const f of failures) {
      lines.push(`  投げかけ: ${f.prompt}`);
      lines.push(`  条件:     ${f.criterion}`);
      lines.push(`  判定理由: ${f.verdict.reason}`);
      // 応答そのものを載せる。理由だけだと、判定が妥当かを人が確かめられない。
      lines.push(`  応答:     ${f.response.replace(/\n/g, " ").slice(0, 200)}`);
      lines.push("");
    }
  }
  lines.push(`合計 ${report.passed}/${report.total}`);
  return lines.join("\n") + "\n";
}
