---
name: delegate-suggest
description: "TRIGGER: 質問領域が自エージェントの purpose から乖離している／別 agent が固有のデータ・ツール権限を持つ／ユーザーが「誰に振るべき？」と問う場合。ユーザーへ委譲を提案し、承認を得てから /agent-call で実行。判断は常にユーザーが下す。SKIP: 自専門範囲内の軽微な質問・委譲より自己回答が速い場合・再帰呼び出し禁止（呼び出し先からさらに呼べない）."
---

# /delegate-suggest

Agent-team 共通スキル。**自分の専門外**または**他エージェントの方が筋のよい質問**に気づいたとき、能動的にユーザーへ委譲を提案する。実行は `/agent-call` に委ねる。

## 提案トリガー

以下のいずれかを検知したら、回答を始める前にユーザーへ提案する：

- 質問領域が自分の `purpose`（spec.json）と乖離している
- 別 agent が固有のデータ・スキル・ツール権限を持っている（例：scout の WebFetch ホワイトリスト、特定エージェントのデータアクセス権）
- 自分が答えても二次資料の引用に留まり、別 agent なら一次資料を持っている
- ユーザーが明示的に「誰に振るのが筋？」と尋ねた

## 振り分け表（spec.json ベース）

各組織の `spec.json` に定義されたエージェント一覧から、以下のような表を作成してください：

| agent | 振るべき相談 |
|----|----|
| `<engineering-like>` | コード設計・実装・技術判断 |
| `<design-like>` | UX・UI・プロトタイプ |
| `<finance-like>` | 予算・ROI・財務指標 |
| `<ops-like>` | リソース調達・サプライチェーン |
| `<research-like>` | 業界トレンド・技術調査 |
| reviewer | 横断レビュー・標準化（メタ） |
| scout | 社外 BP 観測・WebFetch（メタ） |
| lab | スキル横展開・新スキル切り出し（メタ） |
| janitor | リポクリーニング・整理提案（メタ） |

## 提案フォーマット

```
[delegate-suggest] この質問は <agent-name> の方が筋がよさそうです。
  理由: <1-2 行>
  実行案: /agent-call <agent-name> "<推奨プロンプト>"
進めますか？ (yes / no / 自分で答える)
```

## 実行手順

1. 上記トリガーで委譲が筋いいと判断したら、**回答前に**提案フォーマットを表示
2. ユーザーが `yes` なら `/agent-call <agent>` を実行
3. ユーザーが `no` または「自分で答える」なら自分で回答
4. 応答を受け取ったら **「`<agent-name>` エージェントによる応答」と明示**してユーザーに渡す
5. 自分の見解と混ぜない

## 制約

- **判断は常にユーザー**：自動で委譲しない。提案して許可を得る
- **再帰呼び出し禁止**：呼び出し先がさらに `/delegate-suggest` を発動して別 agent を呼ぶことは禁止（1 段まで）
- **専門領域から大きく外れない依頼**は委譲しない：自分で答えた方が早い軽微な質問はそのまま答える
- **レイテンシ・コスト**：1 回の委譲で 5〜30 秒消費。乱発しない
- **メタログ**：`/agent-call` 経由なので `{{ORG_REPO_PATH}}/Agent-team/logs/agent-call/YYYY-MM-DD.jsonl` に自動記録される

## 関連

- 実行スキル：`agents/.claude/skills/agent-call/SKILL.md`
- 実装本体：`{{ORG_REPO_PATH}}/Agent-team/tools/agent-call/agent-call.sh`
- agent 一覧の正本：`{{ORG_REPO_PATH}}/Agent-team/spec.json`
