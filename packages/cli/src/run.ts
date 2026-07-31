// コマンドの振り分け。入出力を引数で受け取り、プロセスを直接触らないので
// テストから実バイナリと同じ経路を通せる。

import { runChecks, worstLevel, type CheckResult } from "./checks.js";
import { resolveEnvironment } from "./environment.js";
import { renderChecks, renderStatus } from "./render.js";
import { collectStatus } from "./status.js";

export interface RunIO {
  out: (text: string) => void;
  err: (text: string) => void;
  env?: NodeJS.ProcessEnv;
}

/** 設計書 §4.4 に挙がっているが、配布（Phase 5）に属するため未実装のもの。 */
const DEFERRED: Record<string, string> = {
  install: "インストーラは scripts/install.sh が担当しています",
  uninstall: "配布（設計書 §15 Phase 5）で実装します",
  update: "配布（設計書 §15 Phase 5）で実装します",
  rollback: "配布（設計書 §15 Phase 5）で実装します",
  configure: "User Profile の対話設定は未実装です。AIKO_USER_PROFILE で場所を指定してください",
};

const USAGE = `使い方: aiko <コマンド>

  status          いま何が読めていて何が起動できるかを表示する
  doctor          構成を点検する
  doctor --fix    点検で見つかったもののうち、直し方が分かっているものを直す
  help            この使い方を表示する

未実装（設計書 §4.4 にはあるもの）:
  install / uninstall / update / rollback / configure
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

  const deferred = DEFERRED[command];
  if (deferred) {
    io.err(`aiko ${command} はまだありません。${deferred}\n`);
    return 2;
  }

  io.err(`知らないコマンドです: ${command}\n\n${USAGE}`);
  return 2;
}
