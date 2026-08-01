// 誤判定と性能。R7 仕様書 §12.4（正当な操作 100件以上で誤 deny 0件）と §13（p95 20ms 以下）。
//
// 誤 deny は「使えない」と同義になる。1件でも出たら、その規則は正当な操作を止めている。

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DeterministicPolicyEngine,
  type EvaluateActionRequest,
  type PermissionManifest,
} from "../src/index.js";
import {
  FIXTURE_ALLOWED_HOST,
  FIXTURE_PROJECT_ROOT,
  legitimateFixtures,
} from "./fixtures/legitimate-actions.js";

const manifest: PermissionManifest = {
  schema_version: 1,
  runtime_id: "claude-code",
  filesystem: { writable_paths: [FIXTURE_PROJECT_ROOT] },
  network: { outbound: "allowlist", allowed_hosts: [FIXTURE_ALLOWED_HOST] },
  approval: { policy: "on-request", require_for: ["git-push"] },
  sandbox: { mode: "workspace-write" },
};

const engine = new DeterministicPolicyEngine({
  permissionManifest: manifest,
  clock: () => new Date("2026-08-01T00:00:00.000Z"),
});

function requestFor(fixture: ReturnType<typeof legitimateFixtures>[number]): EvaluateActionRequest {
  return {
    requestId: `req-${fixture.action.actionId}`,
    profileRef: { profileId: "profile-1", contentHash: "hash-1" },
    action: fixture.action,
    context: { environment: fixture.environment },
  };
}

test("正当な操作の Fixture が100件以上ある", () => {
  assert.equal(legitimateFixtures().length >= 100, true);
});

test("正当な操作で deny が1件も出ない", () => {
  const denied = legitimateFixtures()
    .map((fixture) => ({ fixture, decision: engine.evaluate(requestFor(fixture)) }))
    .filter(({ decision }) => decision.decision === "deny")
    .map(({ fixture, decision }) => `${fixture.action.summary}: ${decision.reasons.map((r) => r.code).join(",")}`);
  assert.deepEqual(denied, []);
});

test("deterministic な判定は p95 が 20ms 以下", () => {
  const requests = legitimateFixtures().map(requestFor);
  const durations: number[] = [];
  // 1回だけ測るとプロセス起動直後のばらつきを拾うので、Fixture 全件を5周する。
  for (let round = 0; round < 5; round += 1) {
    for (const request of requests) {
      const started = performance.now();
      engine.evaluate(request);
      durations.push(performance.now() - started);
    }
  }
  durations.sort((a, b) => a - b);
  const p95 = durations[Math.floor(durations.length * 0.95)] as number;
  assert.equal(p95 <= 20, true, `p95=${p95.toFixed(3)}ms`);
});
