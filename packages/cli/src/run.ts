// コマンドの振り分け。入出力を引数で受け取り、プロセスを直接触らないので
// テストから実バイナリと同じ経路を通せる。

import { runChecks, worstLevel, type CheckResult } from "./checks.js";
import { resolveEnvironment } from "./environment.js";
import { renderChecks, renderStatus } from "./render.js";
import { collectStatus } from "./status.js";
import { checkForUpdate, parseVersion, readInstalledVersion, renderCheck, type Channel, type FetchReleases } from "./update.js";
import { configure, renderConfigured, type Ask } from "./configure.js";
import {
  acceptPersonaProposals,
  acceptSpeechStyleProposal,
  acceptUserProposal,
  defaultUserProfilePath,
} from "@agent-aiko/runtime-sdk";
import { applyUpdate, listBackups, rollback } from "./apply-update.js";
import { downloadVerifiedRelease, DownloadError, type FetchBytes } from "./download.js";
import {
  planUninstall,
  renderManifestMissing,
  renderUninstall,
  uninstall,
} from "./uninstall.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";

export interface RunIO {
  out: (text: string) => void;
  err: (text: string) => void;
  env?: NodeJS.ProcessEnv;
  /** 表示するコマンド名。既存の aiko と配布用の名前を区別する。 */
  commandName?: "aiko" | "aiko-maintenance";
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
  accept                会話で提案された人格・切り替え・話し方・呼び名を反映する
  update --check        新しい版が出ていないかを見る（何も書き換えない）
  update --check --channel beta   試用版も対象に含める
  update                新しい版を取得して照合してから入れる（利用者の設定は触らない）
  update --yes          確認が必要な版の更新を承認する
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
  const commandName = io.commandName ?? "aiko";
  const usage = commandName === "aiko-maintenance"
    ? `使い方: aiko-maintenance <コマンド>\n\n  update --check  更新を確認する\n  update          配布物を更新する\n  update --yes    確認が必要な版の更新を承認する\n  rollback        配布物を直前の状態に戻す\n  uninstall       導入時の配布物を削除する\n  help            この使い方を表示する\n`
    : USAGE;

  if (command === "help" || command === "--help" || command === "-h") {
    io.out(usage);
    return 0;
  }
  if (command === "--version" || command === "-v" || command === "version") {
    io.out(`${version}\n`);
    return 0;
  }

  if (commandName === "aiko-maintenance" && !["update", "rollback", "uninstall"].includes(command)) {
    io.err(`この保守コマンドでは ${command} は使えません。\n${usage}`);
    return 2;
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

  if (command === "accept") {
    if (rest.length > 0) {
      io.err(`accept に引数はありません\n\n${usage}`);
      return 2;
    }
    try {
      const personas = await acceptPersonaProposals(env.aikoHome);
      const userAccepted = await acceptUserProposal(env.aikoHome);
      const speechStyle = await acceptSpeechStyleProposal(env.aikoHome);
      if (personas.saved.length === 0 && personas.switched === undefined && !userAccepted && speechStyle === undefined) {
        io.out("受け入れる提案はありません\n");
        return 0;
      }
      if (personas.saved.length > 0) {
        io.out(`人格を保存しました: ${personas.saved.join(", ")}\n`);
      }
      if (personas.switched !== undefined) {
        io.out(`人格を切り替えました: ${personas.switched}\n`);
      }
      if (speechStyle !== undefined) {
        io.out(`話し方を切り替えました: ${speechStyle}\n`);
      }
      if (userAccepted) {
        io.out("呼び名を user.md に反映しました\n");
      }
      return 0;
    } catch (err) {
      io.err(`${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
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
      io.err(`戻せる版がありません（まだ ${commandName} update をしていません）\n`);
      return 1;
    }
    io.out(`${result.restoredFrom} から ${result.restored.length} 件を戻しました\n`);
    io.out("利用者の設定（呼び名・自分で書いた人格と規則）は触っていません\n");
    return 0;
  }

  if (command === "update") {
    const i = rest.indexOf("--channel");
    const requested = i >= 0 ? rest[i + 1] : "stable";
    if (requested !== "stable" && requested !== "beta") {
      io.err(`--channel は stable か beta です: ${String(requested)}\n`);
      return 2;
    }
    let installedVersion: string | undefined;
    try {
      installedVersion = await readInstalledVersion(env.aikoHome);
    } catch (err) {
      io.err(`導入済みの版を確認できません: ${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
    if (!installedVersion) {
      io.err("導入済みの版を確認できません。公開版インストーラで再導入してから更新してください。\n");
      return 1;
    }
    if (!rest.includes("--check")) {
      const found = await checkForUpdate(installedVersion, requested, io.fetchReleases);
      if (!found.latest) {
        io.err(`${requested} に配布物がありません${found.error ? `: ${found.error}` : ""}\n`);
        return 1;
      }
      if (found.updateAvailable === undefined) {
        io.err(`版を比較できません: ${found.error ?? "不明なエラー"}\n`);
        return 1;
      }
      if (!found.updateAvailable) {
        io.out(`すでに最新です（${installedVersion}）\n`);
        return 0;
      }
      const current = parseVersion(installedVersion);
      const target = parseVersion(found.latest.tag);
      if (!current || !target) {
        io.err("版を比較できないため更新しません。\n");
        return 1;
      }
      if (current.core[0] !== target.core[0] || current.core[1] !== target.core[1]) {
        io.out(`更新先: ${installedVersion} → ${found.latest.tag}\n`);
        if (!rest.includes("--yes")) {
          if (!io.ask) {
            io.err("この版への更新は確認が必要です。対話できない環境では内容を確認して --yes を付けてください。\n");
            return 2;
          }
          const answer = await io.ask("この版に更新していいですか？ [y/N]");
          if (!/^y(es)?$/i.test(answer.trim())) {
            io.out("更新をやめました。\n");
            return 0;
          }
        }
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
          previousVersion: installedVersion,
          backupRoot: joinPath(env.aikoHome, "backups"),
          now: new Date(),
        });
        io.out(`${found.latest.tag} を入れました（${result.updated.length} 件）\n`);
        io.out(`利用者の設定 ${result.preserved.length} 件はそのままです\n`);
        io.out(`戻すときは ${commandName} rollback（退避: ${result.backupDir}）\n`);
        return 0;
      } catch (err) {
        // 照合に失敗したことと、取得に失敗したことを混ぜない。
        if (err instanceof DownloadError) {
          io.err(`${err.message}\n`);
          return 1;
        }
        throw err;
      } finally {
        await rm(work, { recursive: true, force: true });
      }
    }
    const channel: Channel = requested;
    const result = await checkForUpdate(installedVersion, channel, io.fetchReleases);
    io.out(renderCheck(result, channel, commandName));
    if (result.error && result.updateAvailable === undefined) return 1;
    return result.updateAvailable ? 10 : 0;
  }

  const deferred = DEFERRED[command];
  if (deferred) {
    io.err(`${commandName} ${command} はまだありません。${deferred}\n`);
    return 2;
  }

  io.err(`知らないコマンドです: ${command}\n\n${usage}`);
  return 2;
}
