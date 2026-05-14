#!/usr/bin/env node
// Aiko shell — `aiko` コマンドのエントリ。対話 REPL を提供する。
//
// 設計の正本: Agent-Lab/Agent-team/agents/aiko/dev-docs/2026-05-05-Agent-Aiko-Codex-design.md v0.3.1 §6.5 / §6.7

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { AikoCommandRouter, parseSlashCommand } from "./aiko-command-router.js";
import { AikoRuntime } from "./aiko-runtime.js";
import { CLIENT_VERSION } from "./codex-client/codex-client.js";

/** Ctrl+C 2 連打で即時終了する判定の窓（ms）。 */
const DOUBLE_INTERRUPT_WINDOW_MS = 2000;

async function main(): Promise<number> {
  const runtime = new AikoRuntime({
    onLog: (line) => process.stderr.write(`[aiko] ${line}\n`),
  });

  process.stdout.write(`Agent-Aiko (Codex) v${CLIENT_VERSION}\n`);
  process.stdout.write("starting...\n");

  try {
    await runtime.start();
  } catch (err) {
    process.stderr.write(`\nstartup failed: ${(err as Error).message}\n`);
    if ((err as Error).message.includes("ENOENT")) {
      process.stderr.write(
        "hint: ~/.aiko/ が見つかりません。`bash claude-code/scripts/install.sh` でセットアップしてから再実行してください。\n"
      );
    } else if ((err as Error).message.includes("ECONNREFUSED") || (err as Error).message.includes("codex")) {
      process.stderr.write(
        "hint: codex CLI が動いているか、`codex login` 済みかを確認してください。\n"
      );
    }
    // 子プロセス（codex app-server）が部分起動した可能性があるため best-effort で停止
    await runtime.stop().catch(() => undefined);
    return 1;
  }

  process.stdout.write(`mode: ${runtime.mode} | thread: ${runtime.threadId}\n`);
  process.stdout.write(
    "「/exit」で終了。Ctrl+C は 1 度で応答中断、2 度で即時終了。\n" +
      "スラッシュコマンド: /aiko-mode /aiko-origin /aiko-override /aiko-reset /aiko-export /aiko-diff\n\n"
  );

  const rl = createInterface({ input, output, terminal: true });
  rl.setPrompt("> ");

  const router = new AikoCommandRouter({
    runtime,
    confirm: async (message: string) => {
      const ans = await rl.question(`${message} `);
      return /^y(es)?$/i.test(ans.trim());
    },
  });

  let activeAbort: AbortController | null = null;
  let lastInterruptAt = 0;

  process.on("SIGINT", () => {
    const now = Date.now();
    if (now - lastInterruptAt < DOUBLE_INTERRUPT_WINDOW_MS) {
      process.stdout.write("\n[double Ctrl+C — exiting]\n");
      cleanup().then(() => process.exit(130));
      return;
    }
    lastInterruptAt = now;
    if (activeAbort !== null) {
      activeAbort.abort();
      process.stdout.write("\n[interrupting...]\n");
    } else {
      // 入力待ちで Ctrl+C 1 回 → 警告表示してプロンプト再開
      // （即時終了は 2 秒以内の 2 連打、もしくは /exit）
      process.stdout.write("\n[Ctrl+C — type /exit or press Ctrl+C again within 2s to exit]\n");
      rl.prompt();
    }
  });

  let cleanedUp = false;
  async function cleanup(): Promise<void> {
    if (cleanedUp) return;
    cleanedUp = true;
    rl.close();
    try {
      await runtime.stop();
    } catch {
      // best-effort
    }
  }

  rl.prompt();
  for await (const lineRaw of rl) {
    const line = lineRaw.trim();
    if (line.length === 0) {
      rl.prompt();
      continue;
    }
    if (line === "/exit" || line === "/quit") {
      process.stdout.write("お疲れ様でした。また一緒に仕事ができるのを楽しみにしています。\n");
      break;
    }

    // スラッシュコマンドのディスパッチ
    const parsed = parseSlashCommand(line);
    if (parsed !== null && router.isKnown(parsed.name)) {
      try {
        const result = await router.execute(parsed.name, parsed.args);
        process.stdout.write(`${result.output}\n`);
        if (result.needsRestart === true) {
          await runtime.restartThread();
          process.stdout.write(`mode: ${runtime.mode} | thread: ${runtime.threadId}\n`);
        }
      } catch (err) {
        process.stderr.write(`\nERROR: ${(err as Error).message}\n`);
      }
      rl.prompt();
      continue;
    }
    if (parsed !== null && !router.isKnown(parsed.name)) {
      process.stderr.write(
        `unknown command: /${parsed.name}（/aiko-mode /aiko-origin /aiko-override /aiko-reset /aiko-export /aiko-diff /exit のいずれかをご利用ください）\n`
      );
      rl.prompt();
      continue;
    }

    activeAbort = new AbortController();
    try {
      await runtime.ask({
        text: line,
        onStarted: () => undefined,
        onDelta: (chunk) => process.stdout.write(chunk),
        abortSignal: activeAbort.signal,
      });
      process.stdout.write("\n");
    } catch (err) {
      if (activeAbort.signal.aborted) {
        process.stdout.write(`\nAiko-${runtime.mode}: 承知しました。中断しました。\n`);
      } else {
        process.stderr.write(`\nERROR: ${(err as Error).message}\n`);
      }
    } finally {
      activeAbort = null;
    }
    rl.prompt();
  }

  await cleanup();
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`fatal: ${message}\n`);
    process.exit(1);
  });
