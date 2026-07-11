---
name: run-meta-pending
description: "TRIGGER: ユーザーが /run-meta-pending を入力した場合、またはセッション開始時に Agent-team/logs/reviews/.pending/ に marker ファイルが 1 つ以上存在する場合。対応するメタエージェントを並列起動し marker を消化する。SKIP: .pending/ ディレクトリが空・marker が存在しない場合は即時終了。手動で任意起動したい場合は /meta を使用."
---

# /run-meta-pending

`{{ORG_REPO_PATH}}/Agent-team/logs/reviews/.pending/` 配下のマーカーを検知し、対応するサブエージェントを **Agent ツール**で起動する。SessionStart hook（`tools/meta-check.sh`）が overdue のロールを検出して marker を作成、このスキルがそれを消化する 2 段構成の実装側。

## 起動タイミング

- 明示: ユーザーが `/run-meta-pending` を入力したとき
- 自動: セッション開始直後、`{{ORG_REPO_PATH}}/Agent-team/logs/reviews/.pending/` に **以下のロール名 marker が 1 つでも存在する場合**に自動実行

| マーカー | 起動するサブエージェント（subagent_type） |
|----------|---------------------------------------|
| `.pending/reviewer` | `reviewer` |
| `.pending/scout` | `scout` |
| `.pending/lab` | `lab` |
| `.pending/janitor` | `janitor` |

## 実行手順

### Step 1: pending マーカーを列挙

```bash
ls {{ORG_REPO_PATH}}/Agent-team/logs/reviews/.pending/ 2>/dev/null
```

存在しなければ何もせず終了。

### Step 2: サブエージェントを **並列起動**

複数 marker があれば Agent ツールで並列に起動する。各サブエージェントの実行内容は `.claude/agents/{role}.md` 定義に従う。

### Step 3: 各エージェント完了ごとに後始末

完了したロールについて：

```bash
date +%s > {{ORG_REPO_PATH}}/Agent-team/logs/reviews/.last-run-{role}
rm -f {{ORG_REPO_PATH}}/Agent-team/logs/reviews/.pending/{role}
```

### Step 4: ユーザー報告

最小限の 1 行：

```
reviewer / lab を起動して完了。
```

詳細出力は `Agent-team/logs/reviews/YYYY-Www-{role}.jsonl` に蓄積されるので、ユーザーに転載しない。

## 関連ファイル

- 検知スクリプト：`{{ORG_REPO_PATH}}/Agent-team/agents/.claude/scripts/meta-check.sh`
- マーカー保管：`{{ORG_REPO_PATH}}/Agent-team/logs/reviews/.pending/`（gitignore）
- 最終起動時刻：`{{ORG_REPO_PATH}}/Agent-team/logs/reviews/.last-run-{role}`（gitignore）
- サブエージェント定義：`{{ORG_REPO_PATH}}/Agent-team/.claude/agents/{role}.md`
- 手動起動コマンド：`/meta` （`.claude/skills/meta/SKILL.md`）

## `/meta` との関係

| | `/run-meta-pending` | `/meta` |
|---|---|---|
| トリガー | 自動（pending あり）or 明示 | ユーザー主導 |
| 対象 | pending marker のあるロール | 引数で指定（reviewer/scout/lab/janitor/all） |
| 後始末 | 自動（marker 削除・last-run 更新） | 自動（同左） |
| 用途 | overdue 解消 | 任意タイミングでの起動 |
