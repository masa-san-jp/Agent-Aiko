// 互換性方針のテスト。設計書 §10.3.1 の表がそのまま通ることを確かめる。

import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptableVersions, checkSchemaVersion } from "../src/schema-compatibility.js";

test("設計書 §10.3.1 の表: 現行2なら 2 と 1 を受理し 0 以下を拒否", () => {
  assert.equal(checkSchemaVersion(2, 2).accepted, true);
  assert.equal(checkSchemaVersion(1, 2).accepted, true);
  assert.equal(checkSchemaVersion(0, 2).accepted, false);
  assert.equal(checkSchemaVersion(-1, 2).accepted, false);
});

test("設計書 §10.3.1 の表: 現行3なら 3 と 2 を受理し 1 以下を拒否", () => {
  assert.equal(checkSchemaVersion(3, 3).accepted, true);
  assert.equal(checkSchemaVersion(2, 3).accepted, true);
  assert.equal(checkSchemaVersion(1, 3).accepted, false);
});

test("現行より新しい版は読めないものとして拒否する", () => {
  const verdict = checkSchemaVersion(4, 3);
  assert.equal(verdict.accepted, false);
  assert.match(verdict.reason ?? "", /新しい/);
  // 直し方が更新であることまで伝える（読めない事実だけを返さない）
  assert.match(verdict.reason ?? "", /aiko update/);
});

test("古すぎる版には移行の手段を示す", () => {
  const verdict = checkSchemaVersion(1, 3);
  assert.equal(verdict.accepted, false);
  assert.match(verdict.reason ?? "", /古すぎる/);
  assert.match(verdict.reason ?? "", /aiko migrate/);
});

test("拒否のときは受理できる版を必ず添える", () => {
  const verdict = checkSchemaVersion(1, 3);
  assert.deepEqual(verdict.acceptable, [2, 3]);
  assert.match(verdict.reason ?? "", /2 \/ 3/);
});

test("整数でない版は拒否する", () => {
  assert.equal(checkSchemaVersion(1.5, 2).accepted, false);
  assert.equal(checkSchemaVersion(Number.NaN, 2).accepted, false);
});

test("現行が1のときは1だけを受理する（0 番は存在しない）", () => {
  assert.deepEqual(acceptableVersions(1), [1]);
  assert.equal(checkSchemaVersion(1, 1).accepted, true);
  assert.equal(checkSchemaVersion(0, 1).accepted, false);
});

test("受理できる版は常に2つ以内（無期限に増やさない）", () => {
  for (const current of [1, 2, 3, 10, 100]) {
    assert.ok(acceptableVersions(current).length <= 2, `current=${current}`);
  }
});

test("current が不正なら判定自体を拒む", () => {
  assert.throws(() => checkSchemaVersion(1, 0), RangeError);
  assert.throws(() => checkSchemaVersion(1, 1.5), RangeError);
});
