#!/usr/bin/env node
// `aiko-codex-instructions` — Codex の thread/start に渡す baseInstructions を出す。
//
// Codex の対話シェル本体は既存の `codex/` が持っている。この CLI は、そこへ渡す
// 人格文字列を Core から作って標準出力へ流すだけにする。既存のシェルを置き換え
// ないので、段階的に接続できる（§8.2「既存 Codex Runtime を段階統合」）。
//
// 人格を合成できなければ何も出力せずに終える。空でない出力があること自体が
// 「人格を合成できた」の合図になるようにする。

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { FileSystemPersonaRepository, UserContextProvider, resolveUserProfilePath } from "@agent-aiko/core";
import { prepareThread, AdapterError } from "./adapter.js";

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

  const prepared = await prepareThread({
    personaRepository: new FileSystemPersonaRepository(aikoHome ? { aikoHome } : {}),
    user,
    ...(process.env["AIKO_PERSONA_ID"] ? { personaId: process.env["AIKO_PERSONA_ID"] } : {}),
  });

  // 何版の人格を出したかは stderr。stdout は baseInstructions 専用にする。
  process.stderr.write(
    `aiko-codex: persona ${prepared.profile.persona.id}@${prepared.profile.persona.version} ` +
      `profile ${prepared.profile.profile_id}\n`,
  );
  process.stdout.write(prepared.baseInstructions);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`aiko-codex: ${message}\n`);
  process.exitCode = err instanceof AdapterError ? 2 : 1;
});
