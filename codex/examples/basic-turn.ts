// Phase 2 完了条件 (2) の最小デモ：
//   start → startThread → ask → 1 ターン応答 → turn/completed
//
// 実行には codex CLI のインストールと OAuth 認証が必要です。
//
//   tsx examples/basic-turn.ts
//
// 設計の正本: 2026-05-05-Agent-Aiko-Codex-design.md（masa-san-jp/Agent-Aiko-dev リポ） v0.3.1 §6.1

import { CodexClient } from "../src/index.js";

async function main(): Promise<void> {
  const client = new CodexClient({
    onLog: (line) => process.stderr.write(`[codex] ${line}\n`),
  });

  console.log("[1/5] starting codex app-server ...");
  await client.start();

  console.log("[2/5] reading account ...");
  const account = await client.getAccount();
  const status = [
    `authMode=${account.authMode ?? "<unauthenticated>"}`,
    account.email !== undefined ? `email=${account.email}` : null,
    account.planType !== undefined ? `planType=${account.planType}` : null,
  ].filter((s): s is string => s !== null).join(" ");
  console.log(`     ${status}`);
  if (account.authMode === null) {
    console.log("[smoke-test OK] startup → handshake → account/read are working.");
    console.log("To exercise the full ask() flow, run `codex login` first and rerun this example.");
    await client.stop();
    return;
  }

  console.log("[3/5] starting thread (ephemeral) ...");
  const { threadId } = await client.startThread({
    baseInstructions: [
      "あなたは検証用のアシスタントです。",
      "ユーザーの質問に 1 文で簡潔に答えてください。",
      "応答の冒頭に必ず 'Aiko-test:' を付けてください。",
    ].join("\n"),
    ephemeral: true,
  });
  console.log(`     threadId=${threadId}`);

  console.log("[4/5] asking a single question (streaming) ...");
  process.stdout.write("     > ");
  const result = await client.ask({
    threadId,
    text: "こんにちは。あなたが正しく動いているなら、その旨を一言で教えてください。",
    onStarted: (turnId) => process.stderr.write(`     [turn started: ${turnId}]\n     > `),
    onDelta: (chunk) => process.stdout.write(chunk),
  });
  process.stdout.write("\n");

  console.log(`[5/5] turn completed (turnId=${result.turnId}, length=${result.text.length})`);
  await client.stop();
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`ERROR: ${message}`);
  process.exit(1);
});
