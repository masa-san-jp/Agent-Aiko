---
name: meta
description: "TRIGGER: ユーザーが /meta, /meta reviewer, /meta scout, /meta lab, /meta janitor, /meta all を明示的に入力した場合。reviewer/scout/lab/janitor メタエージェントを手動で実行する。SKIP: セッション開始時の自動起動は /run-meta-pending が担う（このスキルは手動起動専用）。通常の質問・コードベース探索・作業タスクには使用しない."
---

# /meta

メタエージェント（reviewer / scout / lab / janitor）を**手動で起動**するコマンドです。日次自動起動（SessionStart hook + CLAUDE.md 指示）と同じ仕組みを、任意タイミングで呼び出します。

## 引数なし — 状態表示

各メタエージェントの最終起動日時と pending 状態を表示します。

```bash
for role in reviewer scout lab janitor; do
  last="{{ORG_REPO_PATH}}/Agent-team/logs/reviews/.last-run-$role"
  pending="{{ORG_REPO_PATH}}/Agent-team/logs/reviews/.pending/$role"
  if [ -f "$last" ]; then
    ts=$(cat "$last" 2>/dev/null)
    last_str=$(date -r "$ts" '+%Y-%m-%d %H:%M' 2>/dev/null || echo "$ts")
  else
    last_str="未起動"
  fi
  pend=""
  [ -f "$pending" ] && pend=" (pending)"
  echo "$role: $last_str$pend"
done
```

## 引数 `reviewer` / `scout` / `lab` / `janitor`

該当のサブエージェントを **Agent ツール**で起動します（`subagent_type=<role>`）。

完了後の必須処理：

1. `Agent-team/logs/reviews/.last-run-{role}` に `date +%s` を書き込む
2. `Agent-team/logs/reviews/.pending/{role}` があれば削除

```bash
date +%s > {{ORG_REPO_PATH}}/Agent-team/logs/reviews/.last-run-<role>
rm -f {{ORG_REPO_PATH}}/Agent-team/logs/reviews/.pending/<role>
```

## 引数 `all`

4 つを **並列**で起動します（独立した分析なので競合なし）。完了したエージェントから順に上記の末尾処理を行います。

## それ以外の引数

`reviewer` / `scout` / `lab` / `janitor` / `all` 以外を指定された場合は、上記のいずれかを指定するよう案内してください。

## 関連ファイル

- メタエージェント定義: `{{ORG_REPO_PATH}}/Agent-team/.claude/agents/{role}.md`
- overdue 検出スクリプト: `{{ORG_REPO_PATH}}/Agent-team/agents/.claude/scripts/meta-check.sh`
- 出力ログ蓄積先: `{{ORG_REPO_PATH}}/Agent-team/logs/reviews/`
- pending マーカー: `{{ORG_REPO_PATH}}/Agent-team/logs/reviews/.pending/`
- 最終起動時刻: `{{ORG_REPO_PATH}}/Agent-team/logs/reviews/.last-run-{role}`

## 起動サイクル（各エージェント定義から）

| エージェント | 役割 | 自動起動条件 |
|---|---|---|
| reviewer | 標準化・整合・再発防止 | 24h 経過 |
| scout | 社外ベストプラクティス観測（差分） | 24h 経過 |
| lab | 社内スキル横展開・新スキル切り出し | 24h 経過 |
| janitor | リポジトリのクリーニング（light） | 24h 経過 |

scout のフル踏査（土曜）、janitor のフル（金曜）、月初メトリクスは **手動 `/meta` 運用**でカバーしてください（自動化スコープ外）。
