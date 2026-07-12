---
name: routine
description: "TRIGGER: ユーザーが /routine, /routine status, /routine meta [role|all], /routine <job> [mode] を入力した場合。リポジトリに記録された定期実行タスクを手動で確認・実行する。SKIP: 単発の通常タスク管理は別のタスクスキル、メタエージェントだけを直接起動する場合は /meta を使う。"
---

# /routine

リポジトリに記録された定期実行タスクを手動で確認・実行する入口の参考実装。パス・名称は各組織の構成に合わせて調整して使う。

対象は 2 種類：

1. **メタエージェント** — このパッケージの `meta` / `run-meta-pending` と同じ仕組み（reviewer / scout / lab / janitor 等）
2. **組織固有の定期ジョブ** — 各組織が用意する任意のパイプライン（データ収集・レポート生成・外部同期など）。ジョブ名・mode は自分の実装に置き換える

## 引数

| コマンド | 何をするか | 外部への影響 |
|---|---|---|
| `/routine` / `/routine status` | メタエージェントの最終実行時刻と、登録済み定期ジョブの状態を表示 | 読み取りのみ |
| `/routine meta <role>` | メタエージェント（`reviewer` / `scout` / `lab` / `janitor` / `all`）を手動実行 | ログと last-run を更新 |
| `/routine <job> [mode]` | 組織固有の定期ジョブを手動実行（`<job>` は自分で定義） | ジョブ次第（下記の注意参照） |

引数なしの `/routine` は `/routine status` と同じ。第 1 引数の `status` と `meta` は**予約語**なので、`<job>` 名には使えない（衝突を避けるため別名を付ける）。

## `/routine status`

メタエージェントと登録済み定期ジョブの状態を確認する。

```bash
# メタエージェントの last-run / pending（自環境のメタ構成に合わせる）
for role in reviewer scout lab janitor; do
  last="{{ORG_REPO_PATH}}/Agent-team/logs/reviews/.last-run-$role"
  pending="{{ORG_REPO_PATH}}/Agent-team/logs/reviews/.pending/$role"
  if [ -f "$last" ]; then
    ts=$(cat "$last" 2>/dev/null)
    last_str=$(date -r "$ts" '+%Y-%m-%d %H:%M' 2>/dev/null || echo "$ts")
  else
    last_str="未起動"
  fi
  [ -f "$pending" ] && pend=" (pending)" || pend=""
  echo "$role: $last_str$pend"
done

# 組織固有ジョブの状態（例。自分のジョブの status コマンドに置き換える）
# cd "{{ORG_REPO_PATH}}/Agent-team/tools/<job>" && python3 run.py status
```

必要に応じて `<tasks-file>`（例：`tasks.json`）のうち定期実行由来の項目も確認する。

## `/routine meta <role|all>`

メタエージェントを手動起動する。`role` は `reviewer` / `scout` / `lab` / `janitor` / `all`。手順は `/meta` と同じ。完了後は必ず last-run を更新し pending を消す：

```bash
date +%s > "{{ORG_REPO_PATH}}/Agent-team/logs/reviews/.last-run-<role>"
rm -f "{{ORG_REPO_PATH}}/Agent-team/logs/reviews/.pending/<role>"
```

## `/routine <job> [mode]` — 組織固有の定期ジョブ

各組織が用意した定期ジョブを手動で叩く汎用パターン。ジョブは `{{ORG_REPO_PATH}}/Agent-team/tools/<job>/` 配下に置き、`run.py <mode>` などのエントリで実行する想定。

```bash
cd "{{ORG_REPO_PATH}}/Agent-team/tools/<job>"
python3 run.py <mode>       # 例：status / collect / build / sync / all など、ジョブが定義する mode
```

注意（外部への影響があるジョブでは特に）：

- API を使う mode は API キー（`<api-key>`。**必ず環境変数から読み、コミットしない**）が必要。
- 外部ストアへ書き込む mode は影響範囲を確認してから実行する。
- 実行前に `{{ORG_REPO_PATH}}/Agent-team/tools/<job>/config.json` 等が現在の環境に合っているか確認する。
- 外部スケジューラでトリガーされるジョブは、エージェントから直接起動せず**状態確認のみ**に留めるのが安全。

## 関連

- `/meta` — メタエージェントの手動起動（`meta` 系統の実体）

## 関連ファイル（自環境に合わせて配置）

- メタ起動スキル：`{{ORG_REPO_PATH}}/Agent-team/skills/meta/SKILL.md`
- 定期ジョブ実装：`{{ORG_REPO_PATH}}/Agent-team/tools/<job>/run.py`
- タスク一覧：`<tasks-file>`
- メタエージェントのログ・last-run：`{{ORG_REPO_PATH}}/Agent-team/logs/reviews/`
