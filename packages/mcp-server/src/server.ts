#!/usr/bin/env node
// stdio エントリ。設計書 §7.1（初期標準は stdio）。
//
// stdout は MCP のフレームが流れる経路なので、ここへ人間向けの文字列を書いては
// いけない。診断は stderr へ出す。

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FileSystemPersonaRepository, UserContextProvider, resolveUserProfilePath } from "@agent-aiko/core";
import { createAikoServer } from "./aiko-server.js";

const personaId = process.env["AIKO_PERSONA_ID"] ?? "aiko";
const aikoHome = process.env["AIKO_HOME"];
// AIKO_USER_PROFILE が無くても、aiko configure が置いた既定のファイルを拾う。
// 置き場の決め方は core に集約してある（ここで独自に組み立てると configure と食い違う）。
const userProfilePath = resolveUserProfilePath(
  aikoHome ?? join(homedir(), ".aiko"),
  process.env["AIKO_USER_PROFILE"],
  existsSync,
);
// 既定は ~/.aiko。別の場所を指せるようにしておくと、実バイナリのまま検証できる。

async function main(): Promise<void> {
  const provider = new UserContextProvider();
  // User Profile を解決できないのは §6.5 の fail-closed 条件。既定値で埋めて
  // 起動すると、誰のものか分からない関係情報で人格が立ち上がる。
  const user = userProfilePath
    ? await provider.loadFromFile(userProfilePath)
    : provider.resolve({ schema_version: 1, user_id: "default" });

  const server = createAikoServer({
    personaRepository: new FileSystemPersonaRepository(aikoHome ? { aikoHome } : {}),
    user,
    personaId,
  });

  await server.connect(new StdioServerTransport());
}

main().catch((err: unknown) => {
  process.stderr.write(
    `aiko-mcp: 起動できませんでした: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exitCode = 1;
});
