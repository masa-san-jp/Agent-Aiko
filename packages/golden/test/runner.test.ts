// Golden Test の骨組みのテスト。モデルは呼ばない（応答も判定も差し替える）。
//
// ここで確かめるのは「7軸ぶん漏れなく回すか」「落ちたものを落ちたと集計するか」
// 「判定できなかったときに合格へ倒さないか」。評価そのものの質はモデル側の話で、
// ここでは見ない。

import { test } from "node:test";
import assert from "node:assert/strict";
import { DIMENSIONS, probeCount } from "../src/dimensions.js";
import { runGolden, renderReport } from "../src/runner.js";

const always = (pass: boolean) => async () => ({ pass, reason: pass ? "満たす" : "満たさない" });
const echo = async (_system: string, user: string) => `応答: ${user}`;

test("設計書 §12.1 の7軸が揃っている", () => {
  const ids = DIMENSIONS.map((d) => d.id).sort();
  assert.deepEqual(ids, [
    "autonomy-behavior",
    "decision-consistency",
    "invariant-compliance",
    "relationship-behavior",
    "self-identification",
    "uncertainty-behavior",
    "value-alignment",
  ]);
});

test("どの軸にも投げかけが1つ以上ある", () => {
  for (const d of DIMENSIONS) {
    assert.ok(d.probes.length > 0, `${d.id} に投げかけが無い`);
    for (const p of d.probes) {
      assert.ok(p.criterion.length > 0, `${d.id} の合格条件が空`);
    }
  }
});

test("全部の投げかけを回して集計する", async () => {
  const report = await runGolden({ instructions: "人格", respond: echo, judge: always(true) });
  assert.equal(report.total, probeCount());
  assert.equal(report.passed, report.total);
  assert.equal(report.byDimension.length, DIMENSIONS.length);
});

test("満たさなかったものは落ちたまま集計される", async () => {
  const report = await runGolden({ instructions: "人格", respond: echo, judge: always(false) });
  assert.equal(report.passed, 0);
  for (const d of report.byDimension) {
    assert.equal(d.passed, 0);
  }
});

test("落ちたときは応答そのものを報告に載せる", async () => {
  const report = await runGolden({
    instructions: "人格",
    respond: async () => "わたしは汎用アシスタントです",
    judge: always(false),
  });
  const text = renderReport(report);
  assert.match(text, /わたしは汎用アシスタントです/, "判定理由だけでは妥当性を確かめられない");
  assert.match(text, /FAIL/);
});

test("進捗は投げかけの数だけ呼ばれる", async () => {
  let calls = 0;
  await runGolden({
    instructions: "人格",
    respond: echo,
    judge: always(true),
    onProgress: () => {
      calls += 1;
    },
  });
  assert.equal(calls, probeCount());
});

test("人格の指示文がそのまま system として渡る", async () => {
  const seen: string[] = [];
  await runGolden({
    instructions: "あたしはアイコ。",
    respond: async (system) => {
      seen.push(system);
      return "はい";
    },
    judge: always(true),
  });
  assert.ok(seen.every((s) => s === "あたしはアイコ。"), "投げかけごとに人格が変わってはいけない");
});
