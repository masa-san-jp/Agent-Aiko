// Semantic Evaluator と Stage 2 の接続。R7 仕様書 R7-4 / §1 / §5.2 / §5.3 / §12.1。
//
// ここで一番大事なのは「モデルの意見で deny にならない」こと。§1 が禁じているので、
// 評価者が最も強い懸念を返しても require_approval までしか上がらないことを確かめる。

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ActionDecisionSchema,
  HybridPolicyEngine,
  SemanticBudget,
  type CandidateAction,
  type EvaluateActionRequest,
  type PermissionManifest,
  type PolicyRule,
  type SemanticEvaluationResult,
  type SemanticEvaluator,
} from "../src/index.js";

const clock = () => new Date("2026-08-01T00:00:00.000Z");

const manifest: PermissionManifest = {
  schema_version: 1,
  runtime_id: "claude-code",
  filesystem: { writable_paths: ["/home/masa/dev/project"] },
  network: { outbound: "allowed" },
  sandbox: { mode: "workspace-write" },
};

const noEffects = {
  external: false,
  irreversible: false,
  production: false,
  financial: false,
  privacyRelevant: false,
};

const semanticRule: PolicyRule = {
  id: "value-conflict",
  version: "1.0.0",
  category: "persona-invariant",
  description: "人格の価値観と衝突していないか",
  matcher: { kind: "semantic", rubricId: "value-conflict", question: "衝突しているか", minConfidence: 0.7 },
  enforcement: "approve",
  priority: 50,
  enabled: true,
  source: { layer: "semantic-persona", origin: "aiko" },
  severity: "medium",
};

function action(overrides: Partial<CandidateAction> = {}): CandidateAction {
  return {
    actionId: "a-1",
    type: "file.read",
    summary: "設定を読む",
    effects: { ...noEffects },
    proposedBy: "model",
    ...overrides,
  };
}

function request(a: CandidateAction): EvaluateActionRequest {
  return {
    requestId: "req-1",
    profileRef: { profileId: "profile-1", contentHash: "hash-1" },
    action: a,
  };
}

function evaluator(
  result: Partial<SemanticEvaluationResult> & { verdict: SemanticEvaluationResult["verdict"] },
  options: { delayMs?: number; throws?: boolean } = {},
): SemanticEvaluator & { calls: number } {
  const stub = {
    id: "stub-evaluator",
    kind: "local" as const,
    calls: 0,
    async evaluate(): Promise<SemanticEvaluationResult> {
      stub.calls += 1;
      if (options.throws) throw new Error("評価に失敗");
      if (options.delayMs !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      }
      return {
        rubricId: "value-conflict",
        confidence: 0.9,
        evaluator: "stub-evaluator",
        ...result,
      };
    },
  };
  return stub;
}

async function evaluate(
  a: CandidateAction,
  semanticEvaluator: SemanticEvaluator | undefined,
  options: { budget?: SemanticBudget; rules?: PolicyRule[]; timeoutMs?: number } = {},
) {
  const engine = new HybridPolicyEngine({
    permissionManifest: manifest,
    clock,
    rules: options.rules ?? [semanticRule],
    semanticEvaluator,
  });
  const decision = await engine.evaluate(
    { ...request(a), ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}) },
    { budget: options.budget },
  );
  ActionDecisionSchema.parse(decision);
  return decision;
}

// --- Stage 2 の結果が判定に効く ---

test("懸念なしと評価されれば承認を求めない", async () => {
  const decision = await evaluate(action(), evaluator({ verdict: "clear" }));
  assert.equal(decision.decision, "allow");
});

test("懸念ありと評価されれば承認を求める", async () => {
  const decision = await evaluate(action(), evaluator({ verdict: "concern" }));
  assert.equal(decision.decision, "require_approval");
});

test("モデル判定だけでは deny にならない", async () => {
  // 規則が block を求めても（schema で作れないが、実行時に混入した場合でも）
  // semantic 由来の判定は require_approval までしか上がらない。§1。
  const forced: PolicyRule = { ...semanticRule, enforcement: "block" as PolicyRule["enforcement"] };
  const decision = await evaluate(action(), evaluator({ verdict: "concern" }), { rules: [forced] });
  assert.equal(decision.decision, "require_approval");
});

test("意味判定を通したことを結果に残す", async () => {
  const decision = await evaluate(action(), evaluator({ verdict: "concern" }));
  assert.deepEqual(decision.evaluation, {
    deterministic: true,
    semantic: true,
    semanticEvaluator: "stub-evaluator",
  });
});

test("評価者の confidence が結果に載る", async () => {
  const decision = await evaluate(action(), evaluator({ verdict: "concern", confidence: 0.8 }));
  assert.equal(decision.confidence, 0.8);
});

// --- 低 confidence（R7-4） ---

test("低 confidence の懸念は、可逆な操作なら警告どまり", async () => {
  const decision = await evaluate(action(), evaluator({ verdict: "concern", confidence: 0.3 }));
  assert.equal(decision.decision, "allow_with_warning");
});

test("低 confidence の懸念でも、高リスクなら承認を求める", async () => {
  const decision = await evaluate(
    action({ type: "email.send", effects: { ...noEffects, external: true } }),
    evaluator({ verdict: "concern", confidence: 0.3 }),
  );
  assert.equal(decision.decision, "require_approval");
});

// --- 呼ばない条件（§5.2） ---

test("構造化規則で deny になったものへモデル判定を重ねない", async () => {
  const stub = evaluator({ verdict: "clear" });
  await evaluate(
    action({ type: "file.write", targets: [{ type: "file", identifier: "/etc/hosts" }] }),
    stub,
  );
  assert.equal(stub.calls, 0);
});

test("意味判定が要る規則が無ければ評価者を呼ばない", async () => {
  const stub = evaluator({ verdict: "clear" });
  await evaluate(action(), stub, { rules: [] });
  assert.equal(stub.calls, 0);
});

// --- 上限・timeout・失敗（§5.3 / §5.2） ---

test("1ターンの意味判定は3回まで", async () => {
  const stub = evaluator({ verdict: "clear" });
  const budget = new SemanticBudget();
  const rules = [1, 2, 3, 4, 5].map((n) => ({ ...semanticRule, id: `rule-${n}` }));
  await evaluate(action(), stub, { budget, rules });
  assert.equal(stub.calls, 3);
});

test("上限を使い切ったことは理由として残る", async () => {
  const stub = evaluator({ verdict: "clear" });
  const budget = new SemanticBudget();
  const rules = [1, 2, 3, 4].map((n) => ({ ...semanticRule, id: `rule-${n}` }));
  const decision = await evaluate(action(), stub, { budget, rules });
  assert.equal(
    decision.reasons.some((r) => r.code === "SEMANTIC_BUDGET_EXHAUSTED"),
    true,
  );
});

test("timeout した意味判定は「懸念なし」にしない", async () => {
  const decision = await evaluate(
    action({ type: "email.send", effects: { ...noEffects, external: true } }),
    evaluator({ verdict: "clear" }, { delayMs: 50 }),
    { timeoutMs: 5 },
  );
  assert.equal(decision.decision, "require_approval");
});

test("評価者が失敗しても判定は返る", async () => {
  const decision = await evaluate(action(), evaluator({ verdict: "clear" }, { throws: true }));
  assert.equal(decision.decision, "allow_with_warning");
});

test("評価者がいなければ Stage 1 の既定に倒れる", async () => {
  const decision = await evaluate(action(), undefined);
  assert.equal(decision.decision, "allow_with_warning");
});

// --- キャッシュ ---

test("意味判定を通した結果はキャッシュしない", async () => {
  const decision = await evaluate(action(), evaluator({ verdict: "clear" }));
  assert.equal(decision.cache?.cacheable, false);
});
