---
name: agent-call
description: "TRIGGER: 別エージェントが固有のデータ・ツール権限・専門性を持ち、自分より筋のよい回答が期待できる場合。Subcommands - list / status / direct call. SKIP: 自エージェントの専門範囲内の質問（委譲より自己回答が速い）・1 段以上の再帰呼び出し（呼び出し先からさらに /agent-call 不可）・すでに delegate-suggest で提案済みでユーザーが no の場合."
---

# /agent-call

Agent-team 共通スキル。`claude --print` 経由で他エージェントへ 1 ターン委譲する。実装本体は `{{ORG_REPO_PATH}}/Agent-team/tools/agent-call/`。

## サブコマンド

| 形 | 用途 |
|---|---|
| `/agent-call list` | 利用可能なエージェント一覧を表示 |
| `/agent-call status` | claude CLI と agents/ の状態を表示 |
| `/agent-call <agent-name> "<prompt>"` | 指定エージェントへ 1 ターン質問 |

## 実行手順

```bash
{{ORG_REPO_PATH}}/Agent-team/tools/agent-call/agent-call.sh <agent-name> "<prompt>"
```

stdin 経由で長文 prompt を渡すこともできる：

```bash
cat long_prompt.md | {{ORG_REPO_PATH}}/Agent-team/tools/agent-call/agent-call.sh <agent-name>
```

## 環境変数

| 変数 | 既定値 | 用途 |
|------|-------|------|
| `AGENT_CALL_MODEL` | `{{DEFAULT_MODEL}}` | 呼び出し先の使用モデル |
| `WORKPLACE_ROOT` | `{{ORG_REPO_PATH}}` | リポジトリルート |
| `AGENT_CALL_LOG` | `1` | `0` でメタログ書き込みを無効化 |
| `AGENT_CALL_CACHE` | `1` | `0` で agents 一覧キャッシュを使わず常に再スキャン |

## メタログ

呼び出しごとに `{{ORG_REPO_PATH}}/Agent-team/logs/agent-call/YYYY-MM-DD.jsonl` へ 1 行追記する（`AGENT_CALL_LOG=0` で無効化）。

| フィールド | 例 | 意味 |
|----|----|----|
| `ts` | `2026-05-07T10:30:00+0900` | 呼び出し開始時刻（ISO8601） |
| `agent` | `<agent-name>` | 呼び出し先エージェント名 |
| `model` | `{{DEFAULT_MODEL}}` | 使用モデル |
| `duration_ms` | `12340` | 実行時間（ミリ秒） |
| `exit_code` | `0` | claude プロセスの終了コード |
| `prompt_chars` | `420` | プロンプトの文字数（本文は記録しない） |
| `response_bytes` | `1850` | 応答のバイト数（本文は記録しない） |

プロンプト・応答の **本文は記録しない**（公開リポジトリでも安全な内容に限定）。

## エージェント一覧キャッシュ

`list` / `status` / agent 名解決時に呼ばれる agents 一覧取得は、`Agent-team/tools/agent-call/.cache/agents.json` に JSON 配列形式でキャッシュされる。

| 比較対象 | 動作 |
|----|----|
| キャッシュ無し | スキャン → キャッシュ書き込み |
| キャッシュ mtime ≥ `agents/` ディレクトリ mtime | キャッシュ参照 |
| キャッシュ mtime < `agents/` ディレクトリ mtime | 再スキャン → キャッシュ更新 |

`agents/` 直下にエージェントが追加・削除されると同ディレクトリの mtime が更新されるため、次回呼び出し時に自動で再スキャンされる。`.cache/` は `.gitignore` 対象（ローカル限定）。

`AGENT_CALL_CACHE=0` で常にスキャンに戻せる。

## 実装ヒント

`agent-call.sh` は概ね以下の構造：

```bash
#!/bin/bash
# 1. agent-name を解決（cache or scan agents/ dir）
# 2. agents/<name>/ を cwd として claude --print --model $AGENT_CALL_MODEL
# 3. stdout を tee で取得しつつバイト数カウント
# 4. メタログに ts / agent / duration / exit_code / prompt_chars / response_bytes を append
```

完全な実装は組織で構築してください。最小要件は上記 4 ステップ。

## 制約

- **再帰呼び出し禁止**：呼び出し先からさらに `/agent-call` を発動することは禁止（1 段まで）
- **機密情報**：呼び出し先エージェントの権限スコープを尊重。スコープ外データを渡さない
- **本文不記録**：プロンプト・応答の本文はログに残さない
