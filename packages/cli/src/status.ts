// `aiko status` の中身。設計書 §4.4「状態確認」の項目に対応する。

import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, join } from "node:path";
import { FileSystemPersonaRepository } from "@agent-aiko/core";
import { UserContextProvider } from "@agent-aiko/user-context";
import { RuntimeProfileBinder } from "@agent-aiko/binder";
import { DEFAULT_INJECTION } from "@agent-aiko/adapter-claude-code";
import type { Environment } from "./environment.js";

export interface AdapterStatus {
  name: string;
  /** 実行ファイルが PATH にあるか。 */
  installed: boolean;
  /** 設計書 §8.5 で注入手段が確認できている＝Level 2 に到達しうる。 */
  level: 2 | 0;
}

export interface Status {
  version: string;
  persona: string;
  user: string;
  binding: "healthy" | "failed";
  bindingDetail?: string;
  adapters: AdapterStatus[];
}

/** PATH 上に実行ファイルがあるか。which(1) に依存しない。 */
async function onPath(command: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  const paths = (env["PATH"] ?? "").split(delimiter).filter(Boolean);
  for (const dir of paths) {
    try {
      await access(join(dir, command), constants.X_OK);
      return true;
    } catch {
      // 次を見る
    }
  }
  return false;
}

export async function collectStatus(
  env: Environment,
  version: string,
  processEnv: NodeJS.ProcessEnv = process.env,
): Promise<Status> {
  const repo = new FileSystemPersonaRepository({ aikoHome: env.aikoHome });
  const provider = new UserContextProvider();

  let persona = "読めません";
  let user = "読めません";
  let binding: Status["binding"] = "failed";
  let bindingDetail: string | undefined;

  let resolvedUser;
  try {
    resolvedUser = env.userProfilePath
      ? await provider.loadFromFile(env.userProfilePath)
      : provider.resolve({ schema_version: 1, user_id: "default" });
    user = resolvedUser.context.id;
  } catch (err) {
    bindingDetail = err instanceof Error ? err.message : String(err);
  }

  try {
    const snapshot = await repo.load({ id: env.personaId });
    persona = `${snapshot.id}@${snapshot.version}`;
  } catch (err) {
    bindingDetail ??= err instanceof Error ? err.message : String(err);
  }

  if (resolvedUser) {
    try {
      const binder = new RuntimeProfileBinder({ personaRepository: repo });
      await binder.bind(
        { persona: { id: env.personaId }, runtime: { id: "claude-code", injectionMethod: DEFAULT_INJECTION } },
        resolvedUser,
      );
      binding = "healthy";
      bindingDetail = undefined;
    } catch (err) {
      bindingDetail = err instanceof Error ? err.message : String(err);
    }
  }

  const [claude, codex] = await Promise.all([
    onPath("claude", processEnv),
    onPath("codex", processEnv),
  ]);

  return {
    version,
    persona,
    user,
    binding,
    ...(bindingDetail ? { bindingDetail } : {}),
    adapters: [
      { name: "Claude Code", installed: claude, level: 2 },
      { name: "Codex", installed: codex, level: 2 },
      // §8.3 / §8.5: 注入手段が未確認のため Level 2 を名乗らせない。
      { name: "Antigravity CLI", installed: await onPath("antigravity", processEnv), level: 0 },
    ],
  };
}
