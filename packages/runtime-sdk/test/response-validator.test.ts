// Deterministic Response Validator。R7 仕様書 §12.2 の検査項目。
//
// 出力は毎回 ResponseValidationSchema へ通す。§8 が blocked に課している条件を
// validator が破っていないことを、schema 側でも確かめるため。

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DeterministicResponseValidator,
  ResponseValidationSchema,
  type ResponseContract,
  type ValidateResponseRequest,
} from "../src/index.js";

const clock = () => new Date("2026-08-01T00:00:00.000Z");

const contract: ResponseContract = {
  preferredName: "マサくん",
  prohibitedNames: [{ text: "ご主人様", replaceWith: "マサくん" }, "マサ様"],
  firstPerson: "あたし",
  prohibitedFirstPersons: [{ text: "私は", replaceWith: "あたしは" }, "僕は"],
  prohibitedExpressions: ["絶対に安全です"],
  requiredExpressions: [],
  prohibitedAssertions: ["間違いありません"],
  language: "ja",
};

function validate(content: string, override?: Partial<ResponseContract> | null) {
  const profile =
    override === null ? {} : { response_contract: { ...contract, ...(override ?? {}) } };
  const validator = new DeterministicResponseValidator({
    resolveProfile: () => profile,
    clock,
  });
  const request: ValidateResponseRequest = {
    requestId: "req-1",
    profileRef: { profileId: "p-1", contentHash: "h-1" },
    response: { responseId: "res-1", content },
  };
  const result = validator.validate(request);
  ResponseValidationSchema.parse(result);
  return result;
}

// --- 合格 ---

test("宣言どおりの応答は valid", () => {
  assert.equal(validate("マサくん、あたしが直しておいたよ").status, "valid");
});

// --- 呼び名・一人称（形式的違反） ---

test("宣言と違う呼び方は revision_required", () => {
  assert.equal(validate("ご主人様、終わりました").status, "revision_required");
});

test("宣言と違う一人称は revision_required", () => {
  assert.equal(validate("マサくん、私は直しておいたよ").status, "revision_required");
});

test("呼び名と一人称の違反は自動 patch できる", () => {
  const result = validate("ご主人様、私は直しておいたよ");
  assert.equal(result.suggestedRevision?.strategy, "patch");
});

test("自動 patch の本文は宣言どおりの呼び名と一人称になっている", () => {
  const result = validate("ご主人様、私は直しておいたよ");
  assert.equal(result.suggestedRevision?.patchedContent, "マサくん、あたしは直しておいたよ");
});

// --- 禁止表現・秘密情報（送信禁止） ---

test("明示的な禁止表現は blocked", () => {
  assert.equal(validate("これは絶対に安全ですよ").status, "blocked");
});

test("秘密情報が混ざった応答は blocked", () => {
  assert.equal(validate("token は ghp_abcdefghijklmnopqrstuvwxyz012345 だよ").status, "blocked");
});

test("秘密情報の中身は結果に載らない", () => {
  const secret = "ghp_abcdefghijklmnopqrstuvwxyz012345";
  const result = validate(`token は ${secret} だよ`);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test("秘密情報の修正案は本文を書き換えない", () => {
  // §8: Validator が意味を変更する全文書換えを勝手に行ってはならない。
  const result = validate("token は ghp_abcdefghijklmnopqrstuvwxyz012345 だよ");
  assert.equal(result.suggestedRevision?.patchedContent, undefined);
});

// --- 必須表現・断定・言語 ---

test("必須表現が無ければ revision_required", () => {
  const result = validate("直しておいたよ", { requiredExpressions: ["未検証"] });
  assert.equal(result.status, "revision_required");
});

test("必須表現が足りないときは追記を求める", () => {
  const result = validate("直しておいたよ", { requiredExpressions: ["未検証"] });
  assert.equal(result.suggestedRevision?.strategy, "add-disclosure");
});

test("禁止した断定表現は revision_required", () => {
  assert.equal(validate("これで間違いありません").status, "revision_required");
});

test("日本語指定なのに日本語が無ければ警告どまり", () => {
  assert.equal(validate("done").status, "valid_with_warnings");
});

// --- 宣言が無い項目 ---

test("宣言が無い検査は「合格」ではなく「検査していない」と返す", () => {
  const result = validate("なんでも書ける", null);
  const nameCheck = result.checked.find((c) => c.check === "preferred-name");
  assert.deepEqual(
    { evaluated: nameCheck?.evaluated, passed: nameCheck?.passed },
    { evaluated: false, passed: false },
  );
});

test("契約が無くても秘密情報は検査する", () => {
  // 秘密情報だけは人格の宣言に依らない。宣言が無いから漏らしてよい、にはならない。
  assert.equal(validate("ghp_abcdefghijklmnopqrstuvwxyz012345", null).status, "blocked");
});

test("契約が何も無ければ通常の応答は valid", () => {
  assert.equal(validate("なんでも書ける", null).status, "valid");
});

// --- 呼び名の出どころ（§6 / 受入基準 12-13） ---

test("置換先が宣言されていない違反は自動 patch しない", () => {
  const result = validate("マサくん、僕は直しておいたよ");
  assert.equal(result.suggestedRevision?.strategy, "regenerate");
});

test("呼び名は Runtime Profile から取る（request から渡さない）", () => {
  const validator = new DeterministicResponseValidator({
    resolveProfile: () => ({ response_contract: { prohibitedNames: ["ご主人様"] } }),
    clock,
  });
  const result = validator.validate({
    requestId: "req-1",
    profileRef: { profileId: "p-1", contentHash: "h-1" },
    response: { responseId: "res-1", content: "ご主人様" },
  });
  assert.equal(result.issues[0]?.check, "preferred-name");
});

test("検査した項目だけを checked に載せる", () => {
  const result = validate("マサくん、あたしだよ", undefined);
  const requested = new DeterministicResponseValidator({
    resolveProfile: () => ({ response_contract: contract }),
    clock,
  }).validate({
    requestId: "req-1",
    profileRef: { profileId: "p-1", contentHash: "h-1" },
    response: { responseId: "res-1", content: "マサくん、あたしだよ" },
    checks: ["privacy"],
  });
  assert.deepEqual(
    [result.checked.length > 1, requested.checked.map((c) => c.check)],
    [true, ["privacy"]],
  );
});

test("構造だけで判定したと報告する", () => {
  assert.deepEqual(validate("マサくん、あたしだよ").validation, {
    deterministic: true,
    semantic: false,
  });
});
