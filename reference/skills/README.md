# Skills — 多エージェント運用基盤スキル

このディレクトリには、複数エージェント・複数ターミナル間の協調を実現するスキル群が含まれます。
各スキルは `<name>/SKILL.md` 形式で、Claude Code が自然文から起動を判断します。

---

## スキル一覧

| スキル | 用途 | TRIGGER 例 |
|--------|------|-----------|
| `agent-call` | 別エージェントへの 1 ターン委譲 | `/agent-call <name> <prompt>` |
| `delegate-suggest` | 自分の専門外を検知して委譲提案 | 「<peer> に振った方が…」 |
| `peer-inbox` | 別ターミナルの Claude Code への非同期メッセージ | 「<peer> に完了通知」「受信箱見て」 |
| `codex` | ChatGPT サブスクリプション経由の第二意見 | `/codex ask <prompt>` |
| `meta` | メタエージェントの手動起動 | `/meta reviewer` |
| `run-meta-pending` | 自動起動の pending marker を消化 | セッション開始時自動 |
| `startup` | エージェント起動の標準シーケンス | 各 agent CLAUDE.md から呼ばれる |
| `teardown` | エージェント終了の標準シーケンス | 各 agent CLAUDE.md から呼ばれる |

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
