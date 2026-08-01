// `aiko status` の中身。設計書 §4.4「状態確認」の項目に対応する。

import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, join } from "node:path";
import { createRuntimeSdk } from "@agent-aiko/runtime-sdk";
import { DEFAULT_INJECTION } from "@agent-aiko/adapter-claude-code";
import { openEnvironment } from "./resolve.js";
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
  /** 人格の中身の hash。ランタイムに依らないので、Claude Code と Codex で一致する
   *  （§20.7 の受入はこれで見る）。 */
  configurationHash?: string;
  /** この起動の hash。注入手段まで含むので経路ごとに変わる（§14.1）。 */
  profileHash?: string;
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
  const opened = await openEnvironment(env);

  let persona = "読めません";
  let binding: Status["binding"] = "failed";
  let bindingDetail: string | undefined = opened.userError;
  const user = opened.userId;

  const health = await opened.sdk.health({ requestId: "cli-status", personaId: env.personaId });
  if (health.persona) {
    persona = `${health.persona.id}@${health.persona.version}`;
  } else {
    bindingDetail ??= health.reason;
  }

  let configurationHash: string | undefined;
  let profileHash: string | undefined;
  try {
    const bundle = await opened.sdk.prepareLaunch({
      requestId: "cli-status-bind",
      personaRef: { personaId: env.personaId },
      userRef: { userId: opened.userId },
      runtime: { id: "claude-code", version: "1" },
      injectionCapability: { systemLevel: [DEFAULT_INJECTION] },
      requestedConsistencyLevel: 2,
    });
    binding = "healthy";
    bindingDetail = undefined;
    configurationHash = bundle.profile.configuration_hash;
    profileHash = bundle.profile.profile_hash;
  } catch (err) {
    bindingDetail = err instanceof Error ? err.message : String(err);
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
    ...(configurationHash ? { configurationHash } : {}),
    ...(profileHash ? { profileHash } : {}),
    adapters: [
      { name: "Claude Code", installed: claude, level: 2 },
      { name: "Codex", installed: codex, level: 2 },
      // §8.3 / §8.5: 注入手段が未確認のため Level 2 を名乗らせない。
      { name: "Antigravity CLI", installed: await onPath("antigravity", processEnv), level: 0 },
    ],
  };
}
