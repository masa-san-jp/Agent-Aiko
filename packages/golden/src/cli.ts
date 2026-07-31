#!/usr/bin/env node
// `aiko-golden` — 人格を適用したモデルに投げかけ、応答が人格と矛盾しないかを見る。
// 設計書 §12.1。CI では動かさない（判定にモデルを使うので完全には再現しない）。

import { FileSystemPersonaRepository } from "@agent-aiko/core";
import { UserContextProvider, resolveUserProfilePath } from "@agent-aiko/user-context";
import { RuntimeProfileBinder } from "@agent-aiko/binder";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { runGolden, renderReport } from "./runner.js";
import { ollamaRespond, ollamaJudge } from "./ollama.js";

const aikoHome = process.env["AIKO_HOME"] ?? join(homedir(), ".aiko");
const personaId = process.env["AIKO_PERSONA_ID"] ?? "aiko";
const answerModel = process.env["GOLDEN_MODEL"] ?? "gpt-oss:20b";
// 判定は別のモデルにできる。同じモデルに自分の答えを採点させると甘くなりやすい。
const judgeModel = process.env["GOLDEN_JUDGE_MODEL"] ?? answerModel;

async function main(): Promise<number> {
  const repo = new FileSystemPersonaRepository({ aikoHome });
  const provider = new UserContextProvider();
  const profilePath = resolveUserProfilePath(aikoHome, process.env["AIKO_USER_PROFILE"], existsSync);
  const user = profilePath
    ? await provider.loadFromFile(profilePath)
    : provider.resolve({ schema_version: 1, user_id: "default" });

  const binder = new RuntimeProfileBinder({ personaRepository: repo });
  const profile = await binder.bind(
    { persona: { id: personaId }, runtime: { id: "generic-mcp-host" } },
    user,
  );

  process.stdout.write(
    `人格 ${profile.persona.id}@${profile.persona.version} / 応答 ${answerModel} / 判定 ${judgeModel}\n\n`,
  );

  const report = await runGolden({
    instructions: profile.instructions,
    respond: ollamaRespond(answerModel),
    judge: ollamaJudge(judgeModel),
    onProgress: (done, total) => process.stderr.write(`\r  ${done}/${total} 済み`),
  });
  process.stderr.write("\r                    \r");
  process.stdout.write(renderReport(report));

  // 1つでも満たさなければ落とす。人格の一貫性は「だいたい合っている」で
  // 済ませられる性質ではない。
  return report.passed === report.total ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    process.stderr.write(`aiko-golden: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
