// コマンドの振り分け。入出力を引数で受け取り、プロセスを直接触らないので
// テストから実バイナリと同じ経路を通せる。

import { runChecks, worstLevel, type CheckResult } from "./checks.js";
import { resolveEnvironment } from "./environment.js";
import { renderChecks, renderStatus } from "./render.js";
import { collectStatus } from "./status.js";
import { checkForUpdate, renderCheck, type Channel, type FetchReleases } from "./update.js";
import { configure, renderConfigured, type Ask } from "./configure.js";
import { defaultUserProfilePath } from "@agent-aiko/runtime-sdk";
import { applyUpdate, listBackups, rollback } from "./apply-update.js";
import { downloadVerifiedRelease, DownloadError, type FetchBytes } from "./download.js";
import {
  planUninstall,
  renderManifestMissing,
  renderUninstall,
  uninstall,
} from "./uninstall.js";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";

export interface RunIO {
  out: (text: string) => void;
  err: (text: string) => void;
  env?: NodeJS.ProcessEnv;
  /** テストから Release 一覧の取得を差し替えるための口。 */
  fetchReleases?: FetchReleases;
  /** 対話の問い合わせ。未指定なら configure は使えない（非対話環境）。 */
  ask?: Ask;
  /** テストから配布物の取得を差し替えるための口。 */
  fetchBytes?: FetchBytes;
  /** テストから取得先を差し替えるための口。 */
  releaseBaseUrl?: string;
}

/** 設計書 §4.4 に挙がっているが、まだ実装していないもの。 */
const DEFERRED: Record<string, string> = {
  install: "インストーラは scripts/install.sh が担当しています",
};

const USAGE = `使い方: aiko <コマンド>

  status                いま何が読めていて何が起動できるかを表示する
  doctor                構成を点検する
  doctor --fix          点検で見つかったもののうち、直し方が分かっているものを直す
  configure             呼び名などを設定して User Profile を作る
  update --check        新しい版が出ていないかを見る（何も書き換えない）
  update --check --channel beta   試用版も対象に含める
  update                新しい版を取得して照合してから入れる（利用者の設定は触らない）
  rollback              直前の版へ戻す（利用者の設定は触らない）
  uninstall             導入時に置いたものだけを消す（利用者の設定は残す）
  uninstall --yes       確認せずに消す
  help                  この使い方を表示する

未実装（設計書 §4.4 にはあるもの）:
  install

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

  if (command === "configure") {
    if (!io.ask) {
      // 対話できない場所で黙って既定値を書き込むと、誰のものか分からない
      // Profile が静かにできる。作らずに理由を返す。
      io.err("configure は対話できる環境でだけ使えます\n");
      return 2;
    }
    const target = env.userProfilePath ?? defaultUserProfilePath(env.aikoHome);
    const { profile, path } = await configure(target, io.ask);
    io.out(renderConfigured(profile, path));
    return 0;
  }

  if (command === "uninstall") {
    const plan = await planUninstall(env.aikoHome);
    if (plan.manifestMissing) {
      // 何が配布物のものか分からない状態で消すのは、消してよいものを
      // 消し損ねるより悪い。何もせずに理由を返す。
      io.err(renderManifestMissing(env.aikoHome));
      return 1;
    }
    if (!rest.includes("--yes")) {
      if (!io.ask) {
        io.err("削除は確認が要ります。対話できない環境では --yes を付けてください\n");
        return 2;
      }
      io.out(`${plan.removable.length} 件を削除します（${plan.kept.length} 件は残します）\n`);
      const answer = await io.ask("削除していいですか？ [y/N]");
      if (!/^y(es)?$/i.test(answer)) {
        io.out("やめました\n");
        return 0;
      }
    }
    const result = await uninstall(env.aikoHome);
    io.out(renderUninstall(result, env.aikoHome));
    return 0;
  }

  if (command === "rollback") {
    const result = await rollback({
      aikoHome: env.aikoHome,
      backupRoot: joinPath(env.aikoHome, "backups"),
    });
    if (result === undefined) {
      io.err("戻せる版がありません（まだ aiko update をしていません）\n");
      return 1;
    }
    io.out(`${result.restoredFrom} から ${result.restored.length} 件を戻しました\n`);
    io.out("利用者の設定（呼び名・自分で書いた人格と規則）は触っていません\n");
    return 0;
  }

  if (command === "update") {
    if (!rest.includes("--check")) {
      const i = rest.indexOf("--channel");
      const requested = i >= 0 ? rest[i + 1] : "stable";
      if (requested !== "stable" && requested !== "beta") {
        io.err(`--channel は stable か beta です: ${String(requested)}\n`);
        return 2;
      }
      const found = await checkForUpdate(version, requested, io.fetchReleases);
      if (!found.latest) {
        io.err(`${requested} に配布物がありません${found.error ? `: ${found.error}` : ""}\n`);
        return 1;
      }
      if (found.updateAvailable !== true) {
        io.out(`すでに最新です（${version}）\n`);
        return 0;
      }
      const work = await mkdtemp(joinPath(tmpdir(), "aiko-update-"));
      try {
        const extracted = await downloadVerifiedRelease({
          tag: found.latest.tag,
          destDir: work,
          ...(io.releaseBaseUrl ? { baseUrl: io.releaseBaseUrl } : {}),
          ...(io.fetchBytes ? { fetchBytes: io.fetchBytes } : {}),
        });
        const result = await applyUpdate({
          aikoHome: env.aikoHome,
          templateAikoDir: joinPath(extracted, "claude-code", "template", ".claude", "aiko"),
          version: found.latest.tag,
          backupRoot: joinPath(env.aikoHome, "backups"),
          now: new Date(),
        });
        io.out(`${found.latest.tag} を入れました（${result.updated.length} 件）\n`);
        io.out(`利用者の設定 ${result.preserved.length} 件はそのままです\n`);
        io.out(`戻すときは aiko rollback（退避: ${result.backupDir}）\n`);
        return 0;
      } catch (err) {
        // 照合に失敗したことと、取得に失敗したことを混ぜない。
        if (err instanceof DownloadError) {
          io.err(`${err.message}\n`);
          return 1;
        }
        throw err;
      }
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
