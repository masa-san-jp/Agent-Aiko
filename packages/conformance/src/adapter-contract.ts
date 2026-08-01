// Adapter 共通の契約テスト。SDK 設計書 §20.2。
//
// Adapter ごとに別々のテストを書くと、**どれか1つだけ確かめ忘れる**。
// 契約は1箇所に置いて、Adapter の側は「自分をどう動かすか」だけを渡す。
//
// §20.2 が挙げる5項目のうち4つをここで見る。残り1つ（Injection Receipt）は
// verifyInjection が R1 の範囲外で未実装のため、**確かめていないことを検査として
// 明示する**（黙って落とすと、確かめた項目と区別が付かない）。

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface AdapterProbe {
  /** どの Adapter か。テスト名に出る。 */
  name: string;
  /** package ディレクトリ名。宣言した依存を見るのに使う。 */
  packageDir: string;
  /** 到達すべき一貫性レベル（§2.1）。 */
  expectedLevel: 0 | 1 | 2;
  /** 使うと申告している注入手段。 */
  expectedInjectionMethod: string;
  /** 正常系。人格を合成して、ホストへ渡す文字列と Profile を返す。 */
  prepare: () => Promise<{ profile: RuntimeProfileLike; injectedText: string }>;
  /** 異常系。人格が解決できない状態で呼ぶ。 */
  prepareWithBrokenPersona: () => Promise<unknown>;
}

/** Adapter が返す Profile のうち、契約が見る部分だけ。 */
export interface RuntimeProfileLike {
  instructions: string;
  profile_hash: string;
  runtime: { consistency_level: 0 | 1 | 2; injection_method: string };
}

export interface RunAdapterContractOptions {
  probe: AdapterProbe;
  /** packages/ の場所。宣言依存を読むのに使う。 */
  packagesDir: string;
}

export function runRuntimeAdapterContract(options: RunAdapterContractOptions): void {
  const { probe, packagesDir } = options;

  test(`[${probe.name}] SDK 以外から人格を読まない（§17.3）`, () => {
    const manifest = JSON.parse(
      readFileSync(join(packagesDir, probe.packageDir, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    const internal = Object.keys(manifest.dependencies ?? {}).filter((n) =>
      n.startsWith("@agent-aiko/"),
    );
    // 人格を読む口（core / binder / user-context）を持っていたら、通らない経路が
    // 存在しうる。使っていないかどうかではなく、**持っていないこと**を見る。
    assert.deepEqual(internal, ["@agent-aiko/runtime-sdk"]);
  });

  test(`[${probe.name}] 到達レベルと注入手段を正しく報告する（§20.2）`, async () => {
    const { profile } = await probe.prepare();
    assert.equal(profile.runtime.consistency_level, probe.expectedLevel);
    assert.equal(profile.runtime.injection_method, probe.expectedInjectionMethod);
  });

  test(`[${probe.name}] ホストへ渡す本文を書き換えない（§20.2）`, async () => {
    const { profile, injectedText } = await probe.prepare();
    // Adapter が本文に一言足すだけで、注入した内容と hash が指すものがずれる。
    // 「同じはず」ではなく、**同じであること**を見る。
    assert.equal(injectedText, profile.instructions);
  });

  test(`[${probe.name}] fail-closed を迂回しない（§17.3・§3.4）`, async () => {
    // 人格を解決できないとき、部分的な結果を返してはいけない。返すと呼び出し側が
    // 「とりあえず起動」できてしまう。
    await assert.rejects(
      () => probe.prepareWithBrokenPersona() as Promise<unknown>,
      (err: unknown) => {
        assert.ok(err instanceof Error, "例外で止めていない");
        return true;
      },
    );
  });

  test(`[${probe.name}] Injection Receipt は未実装（§20.2 の未確認項目）`, () => {
    // §20.2 は Injection Receipt を返すことも求めているが、それを検証する
    // verifyInjection は R1 の範囲外で未実装。**確かめていない項目を、
    // 確かめた項目に混ぜない。** R7 以降でここを本物の検査に置き換える。
    assert.ok(true, "verifyInjection 実装後に、この検査を本物に差し替える");
  });
}
