// update --check のテスト。ネットワークには出ない（Release 一覧の取得を差し替える）。
//
// 実際の GitHub を叩くと、リリースを増やすたびにテストの結果が変わる。ここで
// 確かめたいのは「取れた一覧をどう解釈するか」なので、入力は固定する。

import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../src/run.js";
import { compareVersions, checkForUpdate, type ReleaseInfo } from "../src/update.js";

const releases: ReleaseInfo[] = [
  { tag: "v0.2.0", prerelease: false, url: "https://example.invalid/v0.2.0" },
  { tag: "v0.3.0-beta.1", prerelease: true, url: "https://example.invalid/v0.3.0-beta.1" },
  { tag: "v0.1.0", prerelease: false, url: "https://example.invalid/v0.1.0" },
];

function capture(fetchReleases?: () => Promise<ReleaseInfo[]>) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: {
      out: (t: string) => out.push(t),
      err: (t: string) => err.push(t),
      env: { PATH: "" },
      ...(fetchReleases ? { fetchReleases } : {}),
    },
    out: () => out.join(""),
    err: () => err.join(""),
  };
}

test("版の比較: 数字が大きいほうが新しい", () => {
  assert.equal(compareVersions("v0.2.0", "v0.1.9"), 1);
  assert.equal(compareVersions("v1.0.0", "v1.0.1"), -1);
  assert.equal(compareVersions("v1.2.3", "v1.2.3"), 0);
});

test("版の比較: 試用版は同じ数字の正式版より古い", () => {
  assert.equal(compareVersions("v0.3.0-beta.1", "v0.3.0"), -1);
  assert.equal(compareVersions("v0.3.0", "v0.3.0-beta.1"), 1);
});

test("版の比較: 形が違うものは比較しない", () => {
  assert.equal(compareVersions("latest", "v1.0.0"), null);
});

test("stable では試用版を候補にしない", async () => {
  const r = await checkForUpdate("0.1.0", "stable", async () => releases);
  assert.equal(r.latest?.tag, "v0.2.0");
  assert.equal(r.updateAvailable, true);
});

test("beta では試用版も候補に入る", async () => {
  const r = await checkForUpdate("0.1.0", "beta", async () => releases);
  assert.equal(r.latest?.tag, "v0.3.0-beta.1");
});

test("最新を使っていれば updateAvailable は false", async () => {
  const r = await checkForUpdate("0.2.0", "stable", async () => releases);
  assert.equal(r.updateAvailable, false);
});

test("取得に失敗したとき「最新です」に丸めない", async () => {
  const r = await checkForUpdate("0.1.0", "stable", async () => {
    throw new Error("network down");
  });
  assert.equal(r.updateAvailable, undefined);
  assert.match(r.error ?? "", /network down/);
});

test("新しい版があるときは 10 を返し、適用できないことを伝える", async () => {
  const c = capture(async () => releases);
  const code = await run(["update", "--check"], "0.1.0", c.io);
  assert.equal(code, 10);
  assert.match(c.out(), /v0\.2\.0/);
  assert.match(c.out(), /いまは自動更新できません/);
});

test("最新なら 0 を返す", async () => {
  const c = capture(async () => releases);
  const code = await run(["update", "--check"], "0.2.0", c.io);
  assert.equal(code, 0);
  assert.match(c.out(), /最新です/);
});

test("確認できなかったときは 1 を返す", async () => {
  const c = capture(async () => {
    throw new Error("network down");
  });
  const code = await run(["update", "--check"], "0.1.0", c.io);
  assert.equal(code, 1);
  assert.match(c.out(), /確認できませんでした/);
});

test("最新なら update は何もせずに 0 を返す", async () => {
  // 取得も展開もせずに終わる。更新の要らないときに何かを書き換えない。
  const c = capture(async () => releases);
  const code = await run(["update"], "0.2.0", c.io);
  assert.equal(code, 0);
  assert.match(c.out(), /すでに最新です/);
});

test("知らない channel は 2 を返す", async () => {
  const c = capture(async () => releases);
  const code = await run(["update", "--check", "--channel", "nightly"], "0.1.0", c.io);
  assert.equal(code, 2);
  assert.match(c.err(), /stable か beta/);
});
