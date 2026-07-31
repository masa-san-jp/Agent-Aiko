// コマンドの振り分け。入出力を引数で受け取り、プロセスを直接触らないので
// テストから実バイナリと同じ経路を通せる。

import { runChecks, worstLevel, type CheckResult } from "./checks.js";
import { resolveEnvironment } from "./environment.js";
import { renderChecks, renderStatus } from "./render.js";
import { collectStatus } from "./status.js";
import { checkForUpdate, renderCheck, type Channel, type FetchReleases } from "./update.js";

export interface RunIO {
  out: (text: string) => void;
  err: (text: string) => void;
  env?: NodeJS.ProcessEnv;
  /** テストから Release 一覧の取得を差し替えるための口。 */
  fetchReleases?: FetchReleases;
}

/** 設計書 §4.4 に挙がっているが、まだ実装していないもの。 */
const DEFERRED: Record<string, string> = {
  install: "インストーラは scripts/install.sh が担当しています",
  uninstall: "配布（設計書 §15 Phase 5）で実装します",
  rollback: "配布（設計書 §15 Phase 5）で実装します",
  configure: "User Profile の対話設定は未実装です。AIKO_USER_PROFILE で場所を指定してください",
};

const USAGE = `使い方: aiko <コマンド>

  status                いま何が読めていて何が起動できるかを表示する
  doctor                構成を点検する
  doctor --fix          点検で見つかったもののうち、直し方が分かっているものを直す
  update --check        新しい版が出ていないかを見る（何も書き換えない）
  update --check --channel beta   試用版も対象に含める
  help                  この使い方を表示する

未実装（設計書 §4.4 にはあるもの）:
  install / uninstall / rollback / configure
  update（--check なしの実際の更新。インストーラ側の切り替えが先）

終了コード:
  0   問題なし / 最新
  1   起動できない状態、または確認に失敗
  2   コマンドの使い方が違う
  10  新しい版がある（update --check のみ）
`;

export async function run(argv: readonly string[], version: string, io: RunIO): Promise<number> {
  const [command = "help", ...rest] = argv;

  if (command === "help" || command === "--help" || command === "-h") {
    io.out(USAGE);
    return 0;
  }
  if (command === "--version" || command === "-v" || command === "version") {
    io.out(`${version}\n`);
    return 0;
  }

  const env = resolveEnvironment(io.env);

  if (command === "status") {
    const status = await collectStatus(env, version, io.env);
    io.out(renderStatus(status));
    // 起動できない構成を exit 0 で返すと、スクリプトから見て正常と区別できない。
    return status.binding === "healthy" ? 0 : 1;
  }

  if (command === "doctor") {
    const wantFix = rest.includes("--fix");
    const results = await runChecks(env);
    const fixed: string[] = [];
    if (wantFix) {
      for (const result of results) {
        if (!result.fix) continue;
        try {
          await result.fix();
          fixed.push(result.id);
        } catch (err) {
          io.err(`直せませんでした（${result.id}）: ${err instanceof Error ? err.message : String(err)}\n`);
        }
      }
    }
    const after: CheckResult[] = wantFix ? await runChecks(env) : results;
    io.out(renderChecks(after, fixed));
    return worstLevel(after) === "fail" ? 1 : 0;
  }

  if (command === "update") {
    if (!rest.includes("--check")) {
      // 確認だけできて適用はできない、を黙って成功にしない。
      io.err(
        "aiko update はまだ適用まで行えません。`aiko update --check` で新しい版の有無だけ見られます\n",
      );
      return 2;
    }
    const i = rest.indexOf("--channel");
    const requested = i >= 0 ? rest[i + 1] : "stable";
    if (requested !== "stable" && requested !== "beta") {
      io.err(`--channel は stable か beta です: ${String(requested)}\n`);
      return 2;
    }
    const channel: Channel = requested;
    const result = await checkForUpdate(version, channel, io.fetchReleases);
    io.out(renderCheck(result, channel));
    if (result.error && result.updateAvailable === undefined) return 1;
    return result.updateAvailable ? 10 : 0;
  }

  const deferred = DEFERRED[command];
  if (deferred) {
    io.err(`aiko ${command} はまだありません。${deferred}\n`);
    return 2;
  }

  io.err(`知らないコマンドです: ${command}\n\n${USAGE}`);
  return 2;
}
