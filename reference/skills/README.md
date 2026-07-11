# Skills — 多エージェント運用基盤スキル

このディレクトリには、複数エージェント・複数ターミナル間の協調を実現するスキル群が含まれます。
各スキルは `<name>/SKILL.md` 形式で、Claude Code が自然文から起動を判断します。

---

## スキル一覧

すべて任意採用の参考スキルです。各スキルは自然文または `/<name>` で起動します。組織の規模・
既存資産に応じて必要なものだけ採用してください。

### 委譲・マルチエージェント協調

| スキル | 用途 | TRIGGER 例 |
|--------|------|-----------|
| `agent-call` | 別エージェントへの 1 ターン委譲 | `/agent-call <name> <prompt>` |
| `delegate-suggest` | 自分の専門外を検知して委譲提案 | 「<peer> に振った方が…」 |
| `peer-inbox` | 別ターミナルの Claude Code への非同期メッセージ | 「<peer> に完了通知」「受信箱見て」 |
| `codex` | ChatGPT サブスクリプション経由の第二意見 | `/codex ask <prompt>` |
| `role` | capability manifest ベースのロール解決・切替 | `/role <name>` |

### メタエージェント運用

| スキル | 用途 | TRIGGER 例 |
|--------|------|-----------|
| `meta` | メタエージェントの手動起動 | `/meta reviewer` |
| `run-meta-pending` | 自動起動の pending marker を消化 | セッション開始時自動 |
| `routine` | 記録された定期実行タスクを手動で確認・実行 | `/routine status` |

### セッション・ライフサイクル

| スキル | 用途 | TRIGGER 例 |
|--------|------|-----------|
| `startup` | エージェント起動の標準シーケンス | 各 agent CLAUDE.md から呼ばれる |
| `teardown` | エージェント終了の標準シーケンス | 各 agent CLAUDE.md から呼ばれる |
| `log-push` | per-agent ログ・開発ログを書いて push まで一括実行 | `/log-push`「ログ書いてプッシュ」 |
| `sync` | リポジトリと GitHub の双方向同期 | `/sync push` |
| `agent-map` | リポジトリ構成の生きた文書（MAP）を再生成 | `/agent-map`「どこに何がある」 |

### 思考・作業フロー

| スキル | 用途 | TRIGGER 例 |
|--------|------|-----------|
| `strategic-breakdown` | 上位目的→役割→方策の 9 段ブレイクダウン | 施策・企画着手時 |
| `pr-review-merge` | PR 作成後の標準フロー（待機→確認→修正→マージ） | 「PR 上げて」 |
| `pre-send-check-3point` | 送信物を送る直前の 3 点セルフチェック | 送信副作用を持つ操作の直前 |
| `task` | 単一 JSON を正本にした残タスク管理 | `/task list`「残タスクは？」 |
| `dir-entry` | 作業ディレクトリに AI 用 INDEX と人間用 README を生成 | `/dir-entry <path>` |

### コンテンツ抽出

| スキル | 用途 | TRIGGER 例 |
|--------|------|-----------|
| `extract-text` | PDF / Google Docs・Sheets・Slides をテキスト抽出へ振り分け | `/extract-text <file>` |
| `gslides-read` | スピーカーノート込みで Slides を Markdown 化 | `/gslides-read <url>` |

### プレビュー・共有

| スキル | 用途 | TRIGGER 例 |
|--------|------|-----------|
| `live-preview` | HTML 成果物を tailnet 内ライブ URL で別端末から確認 | `/live-preview`「スマホで見れる URL」 |
| `tailnet-expose` | ローカルのファイル/ポートを tailnet 内 URL で公開 | `/tailnet-expose`「このポートを外から」 |

---

## 設計上のルール

### 委譲の階層制限

```
ユーザー
  ↓
メイン Claude Code セッション
  ↓ (agent-call で 1 段委譲)
業務エージェント A
  ↓ ❌ ここから先の委譲は禁止
```

`agent-call` は **1 段まで**。委譲先からさらに `agent-call` することは禁止。
これにより、無限再帰やコスト爆発を防ぎます。

### コンテキスト分離

- `agent-call`: 完全に別 subprocess。会話履歴は引き継がれない
- `peer-inbox`: 完全に別ターミナル。ファイルベースのメッセージ受け渡しのみ
- `codex`: OpenAI 側に送られる。**機密情報を含めない**

### コスト管理

すべての委譲・起動はメタログに記録：

```
{{ORG_REPO_PATH}}/Agent-team/logs/agent-call/YYYY-MM-DD.jsonl
```

プロンプト本文・応答本文は記録しません（サイズと文字数のみ）。

---

## 実装の場所

各スキルは Bash スクリプトを呼び出す薄いラッパーです。実装本体：

- `agent-call`: `Agent-team/tools/agent-call/agent-call.sh`
- `peer-inbox`: `Agent-team/tools/peer-inbox/peer-inbox.sh`
- `codex`: `Agent-team/tools/codex/setup.sh` + `codex-ask`
- `meta-check`: `Agent-team/agents/.claude/scripts/meta-check.sh`

これらの Bash 実装は `tools/` ディレクトリ（このパッケージ内）に最小限を置いています。
完全な実装は別途各組織で組み立ててください（仕様は SKILL.md に記載済み）。

---

## カスタマイズ

各 SKILL.md 内の以下を組織値に置換してください：

- `{{ORG_REPO_PATH}}` → `/path/to/your/org/repo`
- `{{ORG_REPO_NAME}}` → `MyOrg-Repo`
- `{{TEAM_AGENTS}}` → `engineering, design, qa, ...`
- `{{DEFAULT_MODEL}}` → `claude-sonnet-4-6`
