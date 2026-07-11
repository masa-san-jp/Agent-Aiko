---
name: codex
description: "TRIGGER: 不可逆判断の第二意見・Claude+ChatGPT 並列調査・定型コード生成委譲・ユーザーが /codex を明示入力した場合。Subcommands: setup / ask / status. SKIP: 機密データ・社内情報を含むプロンプト（OpenAI に送信されるため絶対不可）・大量並列バッチ用途・深いアーキテクチャ設計・セキュリティ審査はClaude自身で行う."
---

# /codex

Agent-team 共通スキル。`codex app-server` 経由で ChatGPT サブスクリプションに問い合わせる。実装本体は `{{ORG_REPO_PATH}}/Agent-team/tools/codex/`。

## サブコマンド

| 形 | 用途 |
|---|---|
| `/codex setup` | 初回セットアップ（Codex CLI インストール＋ OAuth ログイン） |
| `/codex ask <prompt>` | 1 ターン質問。応答テキストを返す |
| `/codex status` | 認証状態とアカウント情報を表示 |
| `/codex` | 引数なしの場合は status と同等 |

## 実行手順

### setup

```bash
bash {{ORG_REPO_PATH}}/Agent-team/tools/codex/setup.sh
```

冪等。既にログイン済みならスキップ。失敗時は表示メッセージに従う。

### ask

```bash
{{ORG_REPO_PATH}}/Agent-team/tools/codex/codex-ask "<prompt>"
```

- ストリーミング出力したい場合：`CODEX_STREAM=1 {{ORG_REPO_PATH}}/Agent-team/tools/codex/codex-ask "<prompt>"`
- モデル指定：`CODEX_MODEL=<slug> {{ORG_REPO_PATH}}/Agent-team/tools/codex/codex-ask "<prompt>"`
- デバッグ：`CODEX_DEBUG=1` で App Server の stderr を表示
- 失敗時の終了コード：`1`=実行時エラー / `2`=引数不足 / `3`=未認証（setup を案内）

**前提**：Codex CLI 0.128.0+ が必要。古い場合は `npm update -g @openai/codex`。

## 出力の取り扱い（重要）

- ChatGPT の応答は **「ChatGPT による応答」と明示** したうえでユーザー or 上位エージェントに報告
- Claude 自身の見解と混在させない（出典明示の原則）
- 機密情報・社内データはプロンプトに含めない（OpenAI に送信されるため）

## いつ使うか

### クイックルーティング判断表

| タスク性質 | 推奨 | 理由 |
|-----------|------|------|
| 不可逆判断の第二意見 | Codex (`/codex ask`) | モデルの多様性で死角を補完 |
| 技術トレンド並列調査 | Codex (`/codex ask`) | Claude+ChatGPT 両視点の合成 |
| 定型コード生成・複数言語実装 | Codex (`/codex ask`) | 仕様→生成→Claude レビューの分業 |
| アーキテクチャ・設計判断 | Claude（自分） | 自己検証ループ、コンテキスト保持 |
| セキュリティ審査・競合状態分析 | Claude（自分） | 深い脆弱性推論は Claude が有利 |
| ドキュメント生成 | Claude（自分） | コンテキスト連続性が必要 |
| 機密データ・社内情報含む | Claude（自分） | **Codex 絶対不可**（OpenAI に送信） |

判断基準の詳細は workflow-templates/ の `codex_*` パターンスキル参照（このパッケージには含まれない、各組織で必要に応じて追加）。

## 制約

- **機密情報送信禁止**：社内固有名詞・人名・契約情報・案件名はプロンプトに含めない
- **出典明示**：ChatGPT 応答は必ず「ChatGPT による応答」と明示
- **混在禁止**：Claude の見解と ChatGPT の応答を混ぜない
