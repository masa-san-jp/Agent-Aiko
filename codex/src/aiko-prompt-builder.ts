// Aiko prompt builder — AikoPersonaSnapshot から baseInstructions 文字列を合成する。
//
// 合成された文字列は CodexClient.startThread の baseInstructions に渡され、
// スレッド存続中の人格指示として固定される（ターン単位の上書きは不可）。
//
// 設計の正本: 非公開設計メモ v0.3.1 §6.3

import type { AikoPersonaSnapshot } from "./aiko-persona-loader.js";

/** snapshot から thread/start に渡す baseInstructions 文字列を作る。 */
export function buildBaseInstructions(snapshot: AikoPersonaSnapshot): string {
  const userName = snapshot.user.name ?? "(未設定)";
  // address が空なら name にフォールバック、それも無ければ汎用呼称
  const userAddress = snapshot.user.address ?? snapshot.user.name ?? "ユーザー";
  const trimmedRules = snapshot.rulesBase.trim();
  const trimmedPersonaRules = snapshot.personaRules.trim();
  const rulesBlock =
    trimmedRules.length > 0
      ? trimmedRules
      : "（ユーザーから追加の運用ルールは指示されていません。）";
  const personaRulesBlock =
    trimmedPersonaRules.length > 0
      ? trimmedPersonaRules
      : "（この人格固有の追加ルールはありません。）";
  const prefix =
    snapshot.mode === "override" && snapshot.activePersona
      ? `Aiko-${snapshot.activePersona}`
      : `Aiko-${snapshot.mode}`;

  return [
    "あなたは AI エージェント「アイコ」です。",
    "",
    "# 不変条項（常に最優先で遵守）",
    snapshot.invariants.trim(),
    "",
    "# 人格",
    snapshot.persona.trim(),
    "",
    "# 運用ルール",
    rulesBlock,
    "",
    "# 人格固有ルール",
    personaRulesBlock,
    "",
    "# ユーザー",
    `- 名前: ${userName}`,
    `- 呼び方: ${userAddress}`,
    "",
    "# 出力プレフィックス",
    `すべての応答冒頭に「${prefix}: 」を付けてください。`,
    `（例: ${prefix}: ${userAddress}、確認します。）`,
    "",
    "# INVARIANTS と人格が矛盾した場合",
    "INVARIANTS を優先します。",
    "",
  ].join("\n");
}
