# Tools — 実装スクリプト

このディレクトリには、スキルやメタエージェントが呼び出す実装スクリプトを置いています。
配布先組織は基本的にこのまま `Agent-team/tools/` 配下にコピーして使えます。

---

## 含まれるスクリプト

| ファイル | 用途 | 配置先 |
|---------|------|--------|
| `meta-check.sh` | SessionStart hook で 24h overdue を検出 | `Agent-team/agents/.claude/scripts/meta-check.sh` |
| `agent-call.sh` | claude --print 経由の 1 ターン委譲 | `Agent-team/tools/agent-call/agent-call.sh` |
| `peer-inbox.sh` | 複数ターミナル間の非同期メッセージ | `Agent-team/tools/peer-inbox/peer-inbox.sh` |

すべて Bash + Python3（標準ライブラリのみ）。追加依存なし。

### 各スクリプトの最小要件

| スクリプト | 必須コマンド | 最小要件 |
|-----------|------------|---------|
| meta-check.sh | bash, git, date, stat | macOS / Linux / WSL |
| agent-call.sh | bash, claude CLI, python3 (任意) | claude CLI >= 1.x |
| peer-inbox.sh | bash, python3 | macOS で OS 通知を有効化したい場合 osascript |

### 環境変数

#### agent-call.sh
- `WORKPLACE_ROOT`: 組織リポルート（未設定時は `git rev-parse` で自動検出）
- `AGENT_CALL_MODEL`: 委譲先モデル（既定: `claude-sonnet-4-6`）
- `AGENT_CALL_LOG`: メタログ書き込み（`0` で無効化、既定: `1`）
- `AGENT_CALL_CACHE`: agents 一覧キャッシュ（`0` で常時再スキャン、既定: `1`）

#### peer-inbox.sh
- `PEER_NAME`: 自分の名前（明示推奨。未設定時は cwd basename を agents/ と照合）
- `PEER_INBOX_ROOT`: inbox 物理パス（既定: `~/.peer-inbox/`）
- `WORKPLACE_ROOT`: agents/ 一覧取得用（未設定時は `git rev-parse`）

---

## 含まれていないスクリプト（各組織で構築）

### Codex（ChatGPT サブスクリプション連携）

理由：Node.js クライアント（`codex-client.js`）と App Server プロトコルの実装が必要で、
本パッケージの「Bash + Python のみ」原則から外れる。OpenAI Codex CLI 自体の更新サイクルにも依存する。

実装したい場合のリファレンス：

1. **OpenAI Codex CLI** をインストール：
   ```bash
   npm install -g @openai/codex
   codex login
   ```

2. **シンプルな ask ラッパー**を作る場合（最小実装の例）：
   ```bash
   #!/bin/bash
   # codex-ask-simple.sh
   # 注意: codex CLI の対話型を非対話で叩く方法は CLI のバージョンに依存します。
   # 公式が安定 API を提供している場合はそちらを使ってください。
   echo "$@" | codex chat
   ```

3. **App Server 経由の本格実装**（ストリーミング・モデル指定対応）が必要な場合：
   - codex CLI の `--app-server` モードと JSON-RPC over stdio を使う
   - Node.js クライアントで `start` → `getAuthStatus` → `ask` のフロー
   - 詳細は OpenAI Codex CLI のドキュメントを参照

本パッケージの `skills/codex/SKILL.md` には仕様（サブコマンド構成・環境変数・出力の取り扱い）が
記載されているので、それに沿って実装してください。

### Python 補助スクリプト

メタエージェントの定義（`meta-agents/*.md`）が言及している以下の Python スクリプトは
**各組織で実装**してください（`Agent-team/skills/` 配下）：

| スクリプト | 役割 | 最小実装の目安 |
|----------|------|--------------|
| `compress_logs.py` | `current.jsonl` を直近 N 件抽出して `_recent.jsonl` に書く | 30 行程度 |
| `append_dev_log.py` | メタエージェント週次サマリーを `dev-logs.md` に追記 | 50 行程度 |
| `sync_tasks.py` | `backlog.json` から `pending` を `active.json` に抽出 | 30 行程度 |

これらは各組織のリポジトリ規約・ファイル構造に依存するため、汎用版を提供せず仕様のみ示します。

---

## SessionStart hook の登録

`{{ORG_REPO_PATH}}/.claude/settings.json` または `~/.claude/settings.json` に以下を追記してください：

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "bash {{ORG_REPO_PATH}}/Agent-team/agents/.claude/scripts/meta-check.sh"
          }
        ]
      }
    ]
  }
}
```

これで Claude Code セッション開始のたびに `meta-check.sh` が走り、
24h 以上未起動のメタエージェントがあれば `Agent-team/logs/reviews/.pending/{role}` に marker を作ります。

その後、CLAUDE.md の「メタエージェント自動起動」指示に従って Claude が `/run-meta-pending` を実行します。

---

## .gitignore 推奨設定

以下を `{{ORG_REPO_PATH}}/.gitignore` に追加してください：

```
# Meta-agent runtime markers
Agent-team/logs/reviews/.pending/
Agent-team/logs/reviews/.last-run-*

# Per-agent input/output（schema は例外）
Agent-team/agents/*/input/*
!Agent-team/agents/*/input/schema.json
Agent-team/agents/*/output/*
!Agent-team/agents/*/output/schema.json
Agent-team/agents/*/done/

# agent-call cache
Agent-team/tools/agent-call/.cache/

# agent-call meta logs (本文は記録していないが念のためローカル限定)
Agent-team/logs/agent-call/

# peer-inbox は ~/.peer-inbox/ に置くため通常 gitignore 不要
# （リポ配下に置く運用にした場合は追加してください）

# Local workspace
local-workspace/
```

---

## 動作確認

導入後、以下で動作確認できます：

```bash
# 1. agent-call の状態確認
bash {{ORG_REPO_PATH}}/Agent-team/tools/agent-call/agent-call.sh status

# 2. agents 一覧
bash {{ORG_REPO_PATH}}/Agent-team/tools/agent-call/agent-call.sh list

# 3. peer-inbox の自分の名前確認
PEER_NAME=test bash {{ORG_REPO_PATH}}/Agent-team/tools/peer-inbox/peer-inbox.sh whoami

# 4. peer-inbox の自分宛て送信テスト
PEER_NAME=test bash {{ORG_REPO_PATH}}/Agent-team/tools/peer-inbox/peer-inbox.sh send test "hello self"
PEER_NAME=test bash {{ORG_REPO_PATH}}/Agent-team/tools/peer-inbox/peer-inbox.sh check

# 5. meta-check（pending マーカー作成テスト）
bash {{ORG_REPO_PATH}}/Agent-team/agents/.claude/scripts/meta-check.sh
ls {{ORG_REPO_PATH}}/Agent-team/logs/reviews/.pending/
```

---

## 配置スクリプト（参考）

`reference/tools/*.sh` を `{{ORG_REPO_PATH}}/Agent-team/tools/` 配下の正しい場所にコピーする例：

```bash
# 各スクリプトを正しいサブディレクトリへ
mkdir -p {{ORG_REPO_PATH}}/Agent-team/tools/agent-call
mkdir -p {{ORG_REPO_PATH}}/Agent-team/tools/peer-inbox
mkdir -p {{ORG_REPO_PATH}}/Agent-team/agents/.claude/scripts

cp reference/tools/agent-call.sh   {{ORG_REPO_PATH}}/Agent-team/tools/agent-call/agent-call.sh
cp reference/tools/peer-inbox.sh   {{ORG_REPO_PATH}}/Agent-team/tools/peer-inbox/peer-inbox.sh
cp reference/tools/meta-check.sh   {{ORG_REPO_PATH}}/Agent-team/agents/.claude/scripts/meta-check.sh

chmod +x {{ORG_REPO_PATH}}/Agent-team/tools/agent-call/agent-call.sh
chmod +x {{ORG_REPO_PATH}}/Agent-team/tools/peer-inbox/peer-inbox.sh
chmod +x {{ORG_REPO_PATH}}/Agent-team/agents/.claude/scripts/meta-check.sh
```
