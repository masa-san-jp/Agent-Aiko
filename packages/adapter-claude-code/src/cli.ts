#!/usr/bin/env node
// `aiko-claude` — 人格を注入した状態で Claude Code を起動する。設計書 §8.1 / §4.3。
//
// 利用者は普段どおり起動するだけ、が §4.3 の目標。ここはその入口で、
// Binding → 指示文の書き出し → claude の起動、を一続きで行う。
//
// 追加の引数はそのまま claude へ渡す。Adapter が使う人格の引数だけを足す。

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
// 実体の生成（Repository / Provider）は入口の仕事。SDK 設計書 §1 が禁じているのは
// 「人格を適用する通常処理」での直接呼び出しで、依存の組み立てはここで行う。
import { FileSystemPersonaRepository } from "@agent-aiko/core";
import { UserContextProvider, resolveUserProfilePath } from "@agent-aiko/user-context";
import { prepareLaunch, resolveStateDir, AdapterError } from "./adapter.js";

async function main(): Promise<void> {
  const provider = new UserContextProvider();
const aikoHome = process.env["AIKO_HOME"];
  // AIKO_USER_PROFILE が無くても、aiko configure が置いた既定のファイルを拾う。
  // 置き場の決め方は core に集約してある（ここで独自に組み立てると configure と食い違う）。
  const userProfilePath = resolveUserProfilePath(
    aikoHome ?? join(homedir(), ".aiko"),
    process.env["AIKO_USER_PROFILE"],
    existsSync,
  );
  const user = userProfilePath
    ? await provider.loadFromFile(userProfilePath)
    : provider.resolve({ schema_version: 1, user_id: "default" });

  // 既定は呼び出しごとの mkdtemp。固定名（/tmp/aiko-claude-code）は、
  // 先にディレクトリを作った別ユーザーに指示文を差し替えられる。
  // AIKO_STATE_DIR を渡したときは、そのディレクトリの持ち主と権限を確かめてから使う。
  const stateDir = await resolveStateDir(process.env);

  const prepared = await prepareLaunch({
    personaRepository: new FileSystemPersonaRepository(aikoHome ? { aikoHome } : {}),
    user,
    ...(process.env["AIKO_PERSONA_ID"] ? { personaId: process.env["AIKO_PERSONA_ID"] } : {}),
    ...(process.env["AIKO_APPEND"] === "1" ? { mode: "append" as const } : {}),
    stateDir,
  });

  // 何版の人格で起動したかを stderr に残す。stdout は claude のものなので触らない。
  process.stderr.write(
    `aiko-claude: persona ${prepared.profile.persona.id}@${prepared.profile.persona.version} ` +
      `profile ${prepared.profile.profile_id}\n`,
  );

  const claude = process.env["AIKO_CLAUDE_BIN"] ?? "claude";
  const child = spawn(claude, [...prepared.args, ...process.argv.slice(2)], {
    stdio: "inherit",
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 0;
  });
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`aiko-claude: ${message}\n`);
  // 人格を合成できないまま素の claude を起動しない（§3.4）。
  process.exitCode = err instanceof AdapterError ? 2 : 1;
});
