// Persona Compiler。設計書 §5.2。
//
// 人格・ユーザー・能力を、実行環境へ注入する1本の指示文へ合成する。既存の
// codex/src/aiko-prompt-builder.ts が組み立てている順序（不変条項 → 人格 → 運用
// ルール → ユーザー → 優先順位）をそのまま引き継ぐ。あの並びは実際に人格が立った
// 実績のある並びで、作り直す理由がない。
//
// 出力の同一性は保証しない（§2）。保証するのは、同じ入力から同じ instructions と
// 同じ hash が出ることまで。

import { assertWithinLimit } from "./limits.js";
import { hashObject, sha256 } from "./hash.js";
import type { PersonaSnapshot } from "./persona-repository.js";

export interface UserContext {
  /** User Profile の user_id。 */
  id: string;
  /** Aiko がユーザーを呼ぶときの呼称。未設定なら呼称を指示しない。 */
  preferredName?: string;
  language?: string;
  verbosity?: "concise" | "normal" | "detailed";
  directness?: "low" | "medium" | "high";
}

export interface CompileInput {
  persona: PersonaSnapshot;
  user: UserContext;
  /** 実行環境で使える能力の名前。Capability Manifest から Binder が詰める。 */
  capabilities?: string[];
  /** 利用不能で除外した能力とその理由。除外しても続行するが明示する（§6.5 末尾）。 */
  excluded?: Array<{ id: string; reason: string }>;
  /** 応答冒頭に付ける識別子。既存 Codex 実装の「出力プレフィックス」に対応する。 */
  outputPrefix?: string;
}

export interface CompiledInstructions {
  /** 実行環境へ注入する本文。 */
  instructions: string;
  /** 合成結果のハッシュ。追跡（§16）と検証（§6.5）に使う。 */
  profileHash: string;
  /** 入力のハッシュ。人格・ユーザー・能力のどれかが変われば変わる。 */
  configurationHash: string;
}

export function compile(input: CompileInput): CompiledInstructions {
  const sections: string[] = [
    "あなたは AI エージェント「アイコ」です。",
    "",
    "# 不変条項（常に最優先で遵守）",
    input.persona.invariants.trim(),
  ];

  sections.push("", "# 人格", input.persona.identityCore.trim());

  const contract = input.persona.behavioralContract.trim();
  if (contract.length > 0) {
    sections.push("", "# 運用ルール", contract);
  }

  sections.push("", "# ユーザー", ...userLines(input.user));

  const capabilities = input.capabilities ?? [];
  if (capabilities.length > 0) {
    sections.push(
      "",
      "# この環境で使える能力",
      ...[...capabilities].sort().map((c) => `- ${c}`),
    );
  }

  // 並べ替えてから描く。discovery が返す順は実行ごとに揺れるため、揃えないと
  // 同じ構成なのに instructions と profileHash だけが変わる（configurationHash は
  // 並べ替え済みなので一致したまま）＝同一構成が別物として記録される。
  const excluded = [...(input.excluded ?? [])].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  if (excluded.length > 0) {
    // 使えないものを黙って隠すと、あるつもりで呼んで失敗する。理由まで見せる。
    sections.push(
      "",
      "# この環境で使えない能力",
      ...excluded.map((e) => `- ${e.id}: ${e.reason}`),
    );
  }

  if (input.outputPrefix) {
    sections.push(
      "",
      "# 出力プレフィックス",
      `すべての応答冒頭に「${input.outputPrefix}: 」を付けてください。`,
    );
  }

  // §6.4 の10段の優先順位のうち、ここで注入する範囲だけを順序どおりに書く。
  // ホスト・組織の方針と実行環境の権限は本文の外側（Adapter と Permission
  // Manifest）で効くため、ここには書かない。運用ルールをプライバシーより上に
  // 書くと §6.4 と逆転するので、その並びは崩さない。
  sections.push(
    "",
    "# 指示が矛盾した場合",
    "不変条項 → ユーザーのプライバシー方針 → 運用ルール → ユーザーとの関係・好み、の順で優先します。",
    "",
  );

  const instructions = sections.join("\n");
  // §21 の最大入力。ここを超える指示文は、注入先のどこかで黙って切られる。
  // 切られた人格で起動するくらいなら合成の時点で断る。
  assertWithinLimit("compiledInstructions", instructions);

  return {
    instructions,
    profileHash: sha256(instructions),
    configurationHash: hashObject({
      persona: { id: input.persona.id, version: input.persona.version },
      invariants: sha256(input.persona.invariants),
      identityCore: sha256(input.persona.identityCore),
      behavioralContract: sha256(input.persona.behavioralContract),
      user: input.user,
      capabilities: [...capabilities].sort(),
      excluded,
      outputPrefix: input.outputPrefix,
    }),
  };
}

function userLines(user: UserContext): string[] {
  const lines = [`- 識別子: ${user.id}`];
  if (user.preferredName) lines.push(`- 呼び方: ${user.preferredName}`);
  if (user.language) lines.push(`- 言語: ${user.language}`);
  if (user.verbosity) lines.push(`- 応答の長さ: ${verbosityLabel(user.verbosity)}`);
  if (user.directness) lines.push(`- 率直さ: ${directnessLabel(user.directness)}`);
  return lines;
}

function verbosityLabel(v: NonNullable<UserContext["verbosity"]>): string {
  switch (v) {
    case "concise":
      return "簡潔に";
    case "detailed":
      return "詳しく";
    case "normal":
      return "標準";
  }
}

function directnessLabel(d: NonNullable<UserContext["directness"]>): string {
  switch (d) {
    case "high":
      return "遠回しにせず結論から";
    case "medium":
      return "標準";
    case "low":
      return "やわらかく";
  }
}
