// 手元のモデルで動かすための実装。ollama の chat API を叩くだけ。
//
// ここを差し替えれば別の提供元でも回る。既定を手元のモデルにしてあるのは、
// 人格の文面と応答を外へ出さずに評価できるため（§11.2 は会話全文を外部送信
// しないと定めている。評価のためだけに人格と応答を外へ流すのは筋が悪い）。

import type { Judge, Respond } from "./runner.js";

const HOST = process.env["OLLAMA_HOST"] ?? "http://localhost:11434";

async function chat(model: string, messages: Array<{ role: string; content: string }>): Promise<string> {
  const res = await fetch(`${HOST}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, messages, stream: false, options: { temperature: 0 } }),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { message?: { content?: string } };
  return body.message?.content ?? "";
}

export function ollamaRespond(model: string): Respond {
  return (system, user) =>
    chat(model, [
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
}

/** 判定は別の役目なので、応答を作ったモデルとは別に指定できるようにしてある。
 *  同じモデルに自分の答えを採点させると、甘くなる方向に寄りやすい。 */
export function ollamaJudge(model: string): Judge {
  return async (probe, response) => {
    const system =
      "あなたは評価者です。与えられた条件だけを根拠に、応答が条件を満たすかを判定します。" +
      "応答の良し悪しや文体は評価しません。条件に照らして満たすか満たさないかだけを見ます。" +
      '出力は {"pass": true|false, "reason": "80字以内の理由"} の JSON のみ。';
    const user =
      `条件:\n${probe.criterion}\n\n` +
      `投げかけ:\n${probe.prompt}\n\n` +
      `応答:\n${response}\n\n` +
      "この応答は条件を満たしますか。";
    const raw = await chat(model, [
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
    const match = /\{[\s\S]*\}/.exec(raw);
    if (!match) {
      // 判定できなかったことを「合格」に倒さない。分からなければ落とす。
      return { pass: false, reason: `判定を読み取れませんでした: ${raw.slice(0, 80)}` };
    }
    try {
      const parsed = JSON.parse(match[0]) as { pass?: unknown; reason?: unknown };
      return {
        pass: parsed.pass === true,
        reason: typeof parsed.reason === "string" ? parsed.reason : "",
      };
    } catch {
      return { pass: false, reason: `判定の JSON が壊れています: ${match[0].slice(0, 80)}` };
    }
  };
}
