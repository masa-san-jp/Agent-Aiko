// §7.3 の Prompts。
//
// **これは正式 Adapter の代わりではない。** §7.3 は「正式Adapterは Prompt に依存せず、
// Compiler 出力を system/developer 級指示へ注入する」と明記している。Prompt が要る
// のは §8.4 の Generic MCP Host——system 級に注入する手段が無いホストで、そこでは
// 会話の先頭に人格を置く以外に手が無い。
//
// したがってここが返すのは「人格を適用した状態を作るための最初の発話」であって、
// 適用の保証ではない。保証できないことは §7.2 の Resource と同じ扱いにする。
//
// 設計書が定めているのは4つの名前だけで、引数は書かれていない。引数は §6 の
// Binding Request と §8.4 の位置づけから決めた。決めた箇所はこのファイルの
// コメントで明示する。

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface PromptDeps {
  /** 人格を合成した指示文を返す。合成できなければ例外。 */
  compileInstructions: () => Promise<{ instructions: string; personaVersion: string }>;
}

/** Prompt の戻り値。人格を最初の発話として置く。 */
function message(text: string) {
  return {
    messages: [
      {
        role: "user" as const,
        content: { type: "text" as const, text },
      },
    ],
  };
}

/** 合成できなかったときも、黙って空を返さず理由を本文にする。
 *  Prompt には fail closed の返し方が無い（返さない＝ホスト側では空の会話）ので、
 *  「人格を適用できていない」と読める文言を必ず残す。 */
function failure(reason: string) {
  return message(
    `Aiko の人格を適用できませんでした: ${reason}\n\n` +
      `この状態で Aiko として応答してはいけません。設定を確認してください（aiko doctor）。`,
  );
}

export function registerPrompts(server: McpServer, deps: PromptDeps): void {
  const withPersona = async (build: (instructions: string) => string) => {
    try {
      const { instructions } = await deps.compileInstructions();
      return message(build(instructions));
    } catch (err) {
      return failure(err instanceof Error ? err.message : String(err));
    }
  };

  server.registerPrompt(
    "aiko.activate",
    {
      title: "Aiko として応答を始める",
      description:
        "合成した人格を会話の先頭に置く。system 級の注入手段が無いホスト（§8.4）向け。正式 Adapter がある環境では不要",
    },
    async () => withPersona((instructions) => instructions),
  );

  server.registerPrompt(
    "aiko.activate_for_task",
    {
      title: "特定の作業のために Aiko として応答を始める",
      description: "人格に加えて、いま取り組む作業を添える",
      // 引数は設計書に無い。§6.1 の Binding Request が task_context を持つことに合わせた。
      argsSchema: { task: z.string() },
    },
    async ({ task }) =>
      withPersona(
        (instructions) => `${instructions}\n\n---\n\n## いま取り組むこと\n\n${task}`,
      ),
  );

  server.registerPrompt(
    "aiko.review_as_aiko",
    {
      title: "Aiko として対象をレビューする",
      description: "人格の判断基準で、渡された対象を見る",
      argsSchema: { subject: z.string() },
    },
    async ({ subject }) =>
      withPersona(
        (instructions) =>
          `${instructions}\n\n---\n\n## レビュー対象\n\n${subject}\n\n` +
          `上を、あなたの判断基準で見てください。良し悪しを述べるだけでなく、` +
          `どこが根拠でそう言えるのかを示してください。`,
      ),
  );

  server.registerPrompt(
    "aiko.handoff",
    {
      title: "別の環境へ引き継ぐ",
      description: "いまの人格と、引き継ぐ内容をまとめて次の環境へ渡す",
      argsSchema: { context: z.string() },
    },
    async ({ context }) =>
      withPersona(
        (instructions) =>
          `${instructions}\n\n---\n\n## 引き継ぎ\n\n${context}\n\n` +
          `ここまでの経緯を引き継いで続けてください。分からない点は、` +
          `推測で埋めずに確認してください。`,
      ),
  );
}
