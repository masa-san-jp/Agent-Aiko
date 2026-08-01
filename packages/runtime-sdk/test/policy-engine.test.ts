// Deterministic Policy Engine。R7 仕様書 §12.1 の検査項目。
//
// 出力は毎回 ActionDecisionSchema へ通している。schema が禁じている形
// （承認主体の無い require_approval、モデル判定だけの deny）を engine が
// 作らないことを、engine 側でも確かめるため。

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ActionDecisionSchema,
  actionHash,
  auditAction,
  DEFAULT_POLICY_RULES,
  DeterministicPolicyEngine,
  isApprovalStillValid,
  type ApprovalGrant,
  type CandidateAction,
  type EvaluateActionRequest,
  type PermissionManifest,
  type PolicyRule,
} from "../src/index.js";

const clock = () => new Date("2026-08-01T00:00:00.000Z");

const manifest: PermissionManifest = {
  schema_version: 1,
  runtime_id: "claude-code",
  filesystem: { writable_paths: ["/home/masa/dev/project"] },
  network: { outbound: "allowlist", allowed_hosts: ["api.github.com"] },
  approval: { policy: "on-request", require_for: ["git-push"] },
  sandbox: { mode: "workspace-write" },
};

const noEffects = {
  external: false,
  irreversible: false,
  production: false,
  financial: false,
  privacyRelevant: false,
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

function evaluate(
  a: CandidateAction,
  options: ConstructorParameters<typeof DeterministicPolicyEngine>[0] = {},
) {
  const engine = new DeterministicPolicyEngine({ permissionManifest: manifest, clock, ...options });
  const decision = engine.evaluate(request(a));
  // 仕様が禁じた形を作っていないことを毎回確かめる。
  ActionDecisionSchema.parse(decision);
  return decision;
}

// --- 4判定 ---

test("可逆で影響の無い操作は allow", () => {
  assert.equal(evaluate(action()).decision, "allow");
});

test("警告どまりの規則に当たると allow_with_warning", () => {
  const warnRule: PolicyRule = {
    id: "wide-impact",
    version: "1.0.0",
    category: "safety",
    description: "影響範囲が広い",
    matcher: { kind: "structured", actionTypes: ["file.read"] },
    enforcement: "warn",
    priority: 10,
    enabled: true,
    source: { layer: "advisory", origin: "test" },
  };
  assert.equal(evaluate(action(), { rules: [warnRule] }).decision, "allow_with_warning");
});

test("取り返しがつかない操作は require_approval", () => {
  const decision = evaluate(
    action({
      type: "file.delete",
      targets: [{ type: "file", identifier: "/home/masa/dev/project/tmp.txt" }],
      effects: { ...noEffects, irreversible: true },
    }),
  );
  assert.equal(decision.decision, "require_approval");
});

test("書き込みを許されていない場所への操作は deny", () => {
  const decision = evaluate(
    action({
      type: "file.write",
      targets: [{ type: "file", identifier: "/etc/hosts" }],
    }),
  );
  assert.equal(decision.decision, "deny");
});

// --- rule priority / 層 ---

test("上位層の block を下位層の規則が解除しない", () => {
  const hostBlock: PolicyRule = {
    id: "host-block",
    version: "1.0.0",
    category: "safety",
    description: "ホストが禁じている",
    matcher: { kind: "structured", actionTypes: ["shell.exec"] },
    enforcement: "block",
    priority: 1,
    enabled: true,
    source: { layer: "host-safety", origin: "host" },
  };
  const advisoryObserve: PolicyRule = {
    ...hostBlock,
    id: "advisory-ok",
    enforcement: "observe",
    priority: 999,
    source: { layer: "advisory", origin: "test" },
  };
  const decision = evaluate(action({ type: "shell.exec" }), {
    rules: [advisoryObserve, hostBlock],
  });
  assert.equal(decision.decision, "deny");
});

test("同じ強さなら上位層の規則が承認主体を決める", () => {
  const org: PolicyRule = {
    id: "org-approve",
    version: "1.0.0",
    category: "organization",
    description: "組織規則",
    matcher: { kind: "structured", actionTypes: ["git.push"] },
    enforcement: "approve",
    approvalAuthority: "organization_admin",
    priority: 1,
    enabled: true,
    source: { layer: "organization", origin: "org" },
  };
  const userRule: PolicyRule = {
    ...org,
    id: "user-approve",
    approvalAuthority: "user",
    source: { layer: "user-approval", origin: "user" },
  };
  const decision = evaluate(action({ type: "git.push" }), { rules: [userRule, org] });
  assert.equal(decision.approval?.authority, "organization_admin");
});

test("無効にした規則は当たらない", () => {
  const disabled: PolicyRule = {
    id: "disabled",
    version: "1.0.0",
    category: "safety",
    description: "無効",
    matcher: { kind: "structured", actionTypes: ["file.read"] },
    enforcement: "block",
    priority: 1,
    enabled: false,
    source: { layer: "host-safety", origin: "test" },
  };
  assert.equal(evaluate(action(), { rules: [disabled] }).decision, "allow");
});

// --- action hash / 承認 ---

test("操作の内容が変われば action hash が変わる", () => {
  const before = actionHash(action({ summary: "tmp.txt を消す" }));
  const after = actionHash(action({ summary: "全部消す" }));
  assert.notEqual(before, after);
});

test("対象の並び順が違うだけでは action hash は変わらない", () => {
  const targets = [
    { type: "file" as const, identifier: "/a" },
    { type: "file" as const, identifier: "/b" },
  ];
  assert.equal(
    actionHash(action({ targets })),
    actionHash(action({ targets: [...targets].reverse() })),
  );
});

test("承認は操作内容が変われば無効になる", () => {
  const grant: ApprovalGrant = {
    approvalId: "ap-1",
    actionHash: actionHash(action({ summary: "tmp.txt を消す" })),
    policyBundleHash: "pb-1",
    profileId: "profile-1",
    scope: "once",
    grantedBy: "user",
    grantedAt: "2026-08-01T00:00:00.000Z",
  };
  const valid = isApprovalStillValid(grant, {
    actionHash: actionHash(action({ summary: "全部消す" })),
    policyBundleHash: "pb-1",
    profileId: "profile-1",
    now: clock(),
  });
  assert.equal(valid, false);
});

test("期限切れの承認は無効になる", () => {
  const grant: ApprovalGrant = {
    approvalId: "ap-1",
    actionHash: "same",
    policyBundleHash: "pb-1",
    profileId: "profile-1",
    scope: "once",
    grantedBy: "user",
    grantedAt: "2026-07-31T00:00:00.000Z",
    expiresAt: "2026-07-31T23:00:00.000Z",
  };
  const valid = isApprovalStillValid(grant, {
    actionHash: "same",
    policyBundleHash: "pb-1",
    profileId: "profile-1",
    now: clock(),
  });
  assert.equal(valid, false);
});

test("有効な承認があれば同じ操作は止まらない", () => {
  const target = action({
    type: "file.delete",
    targets: [{ type: "file", identifier: "/home/masa/dev/project/tmp.txt" }],
    effects: { ...noEffects, irreversible: true },
  });
  const engine = new DeterministicPolicyEngine({ permissionManifest: manifest, clock });
  const grant: ApprovalGrant = {
    approvalId: "ap-1",
    actionHash: actionHash(target),
    policyBundleHash: engine.policyBundleHash,
    profileId: "profile-1",
    scope: "once",
    grantedBy: "user",
    grantedAt: "2026-08-01T00:00:00.000Z",
  };
  const decision = evaluate(target, { approvals: [grant] });
  assert.notEqual(decision.decision, "require_approval");
});

test("規則集合が変われば過去の承認は効かない", () => {
  const target = action({
    type: "file.delete",
    targets: [{ type: "file", identifier: "/home/masa/dev/project/tmp.txt" }],
    effects: { ...noEffects, irreversible: true },
  });
  const grant: ApprovalGrant = {
    approvalId: "ap-1",
    actionHash: actionHash(target),
    policyBundleHash: "別の規則集合",
    profileId: "profile-1",
    scope: "once",
    grantedBy: "user",
    grantedAt: "2026-08-01T00:00:00.000Z",
  };
  assert.equal(evaluate(target, { approvals: [grant] }).decision, "require_approval");
});

// --- cache ---

test("取り返しがつかない操作の判定はキャッシュしない", () => {
  const decision = evaluate(
    action({
      type: "file.delete",
      targets: [{ type: "file", identifier: "/home/masa/dev/project/tmp.txt" }],
      effects: { ...noEffects, irreversible: true },
    }),
  );
  assert.equal(decision.cache?.cacheable, false);
});

test("可逆で許可した操作の判定はキャッシュしてよい", () => {
  assert.equal(evaluate(action()).cache?.cacheable, true);
});

// --- 権限情報が無いとき ---

test("権限情報が無い高リスク操作は deny", () => {
  const decision = evaluate(
    action({ type: "email.send", effects: { ...noEffects, external: true } }),
    { permissionManifest: undefined },
  );
  assert.equal(decision.decision, "deny");
});

test("権限情報が無くても低リスクの読取りは止めない", () => {
  assert.equal(evaluate(action(), { permissionManifest: undefined }).decision, "allow");
});

test("許可リストに無い通信先は deny", () => {
  const decision = evaluate(
    action({
      type: "network.request",
      targets: [{ type: "service", identifier: "example.com" }],
      effects: { ...noEffects, external: true },
    }),
  );
  assert.equal(decision.decision, "deny");
});

test("通信先を申告していない外部操作は deny ではなく require_approval", () => {
  // 権限情報はある（許可リストがある）が、Action 側の申告が足りず照合できない場合。
  // ここを deny にすると、申告漏れというだけで正当な操作が止まる（§12.4）。
  const decision = evaluate(
    action({ type: "email.send", effects: { ...noEffects, external: true } }),
  );
  assert.equal(decision.decision, "require_approval");
});

test("実行環境が承認を求める操作は require_approval", () => {
  const decision = evaluate(
    action({ type: "git.push", effects: { ...noEffects, external: true } }),
  );
  assert.equal(decision.decision, "require_approval");
});

// --- 意味判定の評価者がいないとき ---

const semanticRule: PolicyRule = {
  id: "value-conflict",
  version: "1.0.0",
  category: "persona-invariant",
  description: "人格価値観との衝突",
  matcher: { kind: "semantic", rubricId: "value-conflict", question: "衝突しているか" },
  enforcement: "approve",
  priority: 50,
  enabled: true,
  source: { layer: "semantic-persona", origin: "aiko" },
};

test("意味判定が要る高リスク操作は、評価者がいなければ require_approval", () => {
  const decision = evaluate(
    action({ type: "issue.write", effects: { ...noEffects, external: true } }),
    { rules: [semanticRule], permissionManifest: { ...manifest, network: { outbound: "allowed" } } },
  );
  assert.equal(decision.decision, "require_approval");
});

test("意味判定が要る低リスク操作は、評価者がいなければ allow_with_warning", () => {
  const decision = evaluate(action(), { rules: [semanticRule] });
  assert.equal(decision.decision, "allow_with_warning");
});

test("評価者がいないことは理由として残る", () => {
  const decision = evaluate(action(), { rules: [semanticRule] });
  assert.equal(
    decision.reasons.some((r) => r.code === "SEMANTIC_EVALUATOR_UNAVAILABLE"),
    true,
  );
});

// --- 判定の性質 ---

test("構造化規則だけの判定は confidence 1.0", () => {
  assert.equal(evaluate(action()).confidence, 1);
});

test("deny も含めてモデル判定を通していないと報告する", () => {
  const decision = evaluate(action({ type: "file.write", targets: [{ type: "file", identifier: "/etc/hosts" }] }));
  assert.deepEqual(decision.evaluation, { deterministic: true, semantic: false });
});

test("既定規則は deny を1つも持たない", () => {
  // §2.4 が deny の対象に挙げるのは権限違反と明示的禁止。「不可逆だから止める」は
  // 承認で進める余地を消すので、既定に入れない。
  assert.deepEqual(
    DEFAULT_POLICY_RULES.filter((r) => r.enforcement === "block").map((r) => r.id),
    [],
  );
});

// --- 監査ログ（§14 / 受入基準 20） ---

test("監査ログに Tool 引数と本文が含まれない", () => {
  const secret = "ghp_SECRET_TOKEN";
  const a = action({
    type: "git.push",
    summary: `${secret} で push する`,
    arguments: { token: secret },
    effects: { ...noEffects, external: true },
  });
  const decision = evaluate(a);
  const record = auditAction(request(a), decision, 3);
  assert.equal(JSON.stringify(record).includes(secret), false);
});

test("監査ログは §14 の項目だけを持つ", () => {
  const a = action();
  const record = auditAction(request(a), evaluate(a), 1);
  assert.deepEqual(Object.keys(record).sort(), [
    "actionId",
    "evaluator",
    "latencyMs",
    "matchedRuleIds",
    "outcome",
    "policyBundleHash",
    "profileId",
    "requestId",
    "timestamp",
  ]);
});
