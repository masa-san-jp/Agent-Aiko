// `aiko doctor` の中身。設計書 §4.4。
//
// 各項目は「見て報告する」だけで、直すのは fix() を明示的に呼んだときだけ。
// 診断が勝手に書き換えると、何が壊れていたのかが分からなくなる。

import { chmod, stat } from "node:fs/promises";
import { FileSystemPersonaRepository } from "@agent-aiko/core";
import { UserContextProvider, UserProfileError } from "@agent-aiko/user-context";
import { RuntimeProfileBinder, BindingError } from "@agent-aiko/binder";
// 検査する注入手段は Adapter の既定と同じものを使う。ここを自前で書くと、
// Adapter が既定を変えたときに doctor だけ古い経路を検査し続ける。
import { DEFAULT_INJECTION } from "@agent-aiko/adapter-claude-code";
import type { Environment } from "./environment.js";

export type Level = "ok" | "warn" | "fail";

export interface CheckResult {
  id: string;
  title: string;
  level: Level;
  detail: string;
  /** 直し方が分かっているもの。--fix で実行される。 */
  fix?: () => Promise<void>;
}

/** 設計書 §11.3 の期待値。 */
const EXPECTED_HOME_MODE = 0o700;
const EXPECTED_PROFILE_MODE = 0o600;

function octal(mode: number): string {
  return "0" + (mode & 0o777).toString(8);
}

async function checkHome(env: Environment): Promise<CheckResult[]> {
  let info;
  try {
    info = await stat(env.aikoHome);
  } catch {
    return [
      {
        id: "home-exists",
        title: "~/.aiko がある",
        level: "fail",
        detail: `${env.aikoHome} が見つかりません。インストーラを実行してください`,
      },
    ];
  }
  if (!info.isDirectory()) {
    return [
      {
        id: "home-exists",
        title: "~/.aiko がある",
        level: "fail",
        detail: `${env.aikoHome} がディレクトリではありません`,
      },
    ];
  }

  const mode = info.mode & 0o777;
  const results: CheckResult[] = [
    { id: "home-exists", title: "~/.aiko がある", level: "ok", detail: env.aikoHome },
  ];
  if (mode !== EXPECTED_HOME_MODE) {
    results.push({
      id: "home-mode",
      title: "~/.aiko の権限が 0700",
      // 設計書は 0700 を指定しているが、緩いだけでは Aiko は動く。動作不能では
      // ないので fail ではなく warn。ただし同じ端末の他ユーザーから読めるため
      // 放置してよいものでもない。
      level: "warn",
      detail: `${octal(mode)} です（期待 0700）。同じ端末の他のユーザーから読めます`,
      fix: async () => {
        await chmod(env.aikoHome, EXPECTED_HOME_MODE);
      },
    });
  } else {
    results.push({
      id: "home-mode",
      title: "~/.aiko の権限が 0700",
      level: "ok",
      detail: "0700",
    });
  }
  return results;
}

async function checkPersona(env: Environment): Promise<CheckResult> {
  const repo = new FileSystemPersonaRepository({ aikoHome: env.aikoHome });
  try {
    const persona = await repo.load({ id: env.personaId });
    if (persona.invariants.trim().length === 0) {
      return {
        id: "persona",
        title: "人格を読める",
        level: "fail",
        detail: "不変条項が空です。この状態では起動しません（§6.5）",
      };
    }
    return {
      id: "persona",
      title: "人格を読める",
      level: "ok",
      detail: `${persona.id}@${persona.version}`,
    };
  } catch (err) {
    return {
      id: "persona",
      title: "人格を読める",
      level: "fail",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkUserProfile(env: Environment): Promise<CheckResult[]> {
  const provider = new UserContextProvider();
  if (!env.userProfilePath) {
    return [
      {
        id: "user-profile",
        title: "User Profile を読める",
        level: "warn",
        detail: "AIKO_USER_PROFILE が未設定のため既定（user_id: default）で動いています",
      },
    ];
  }

  const results: CheckResult[] = [];
  try {
    const user = await provider.loadFromFile(env.userProfilePath);
    results.push({
      id: "user-profile",
      title: "User Profile を読める",
      level: "ok",
      detail: `${env.userProfilePath}（呼び名: ${user.context.preferredName ?? "未設定"}）`,
    });
  } catch (err) {
    results.push({
      id: "user-profile",
      title: "User Profile を読める",
      level: "fail",
      detail: err instanceof UserProfileError ? err.message : String(err),
    });
    return results;
  }

  try {
    const info = await stat(env.userProfilePath);
    const mode = info.mode & 0o777;
    results.push(
      mode === EXPECTED_PROFILE_MODE
        ? { id: "user-profile-mode", title: "User Profile の権限が 0600", level: "ok", detail: "0600" }
        : {
            id: "user-profile-mode",
            title: "User Profile の権限が 0600",
            level: "warn",
            detail: `${octal(mode)} です（期待 0600）。呼び名や関係性が他のユーザーから読めます`,
            fix: async () => {
              await chmod(env.userProfilePath as string, EXPECTED_PROFILE_MODE);
            },
          },
    );
  } catch {
    // 直前に読めているので、ここに来るのは競合など例外的な場合だけ。
  }
  return results;
}

async function checkBinding(env: Environment): Promise<CheckResult> {
  const repo = new FileSystemPersonaRepository({ aikoHome: env.aikoHome });
  const binder = new RuntimeProfileBinder({ personaRepository: repo });
  const provider = new UserContextProvider();
  try {
    const user = env.userProfilePath
      ? await provider.loadFromFile(env.userProfilePath)
      : provider.resolve({ schema_version: 1, user_id: "default" });
    const profile = await binder.bind(
      { persona: { id: env.personaId }, runtime: { id: "claude-code", injectionMethod: DEFAULT_INJECTION } },
      user,
    );
    return {
      id: "binding",
      title: "Runtime Profile を合成できる",
      level: "ok",
      detail: `profile_hash ${profile.profile_hash.slice(0, 12)}…`,
    };
  } catch (err) {
    return {
      id: "binding",
      title: "Runtime Profile を合成できる",
      level: "fail",
      detail:
        err instanceof BindingError || err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runChecks(env: Environment): Promise<CheckResult[]> {
  const [home, persona, user, binding] = await Promise.all([
    checkHome(env),
    checkPersona(env),
    checkUserProfile(env),
    checkBinding(env),
  ]);
  return [...home, persona, ...user, binding];
}

export function worstLevel(results: readonly CheckResult[]): Level {
  if (results.some((r) => r.level === "fail")) return "fail";
  if (results.some((r) => r.level === "warn")) return "warn";
  return "ok";
}
