---
name: routine
description: "TRIGGER: ユーザーが /routine, /routine status, /routine meta [role|all], /routine ops [mode], /routine chat を入力した場合。リポジトリに記録された定期実行タスクを手動で確認・実行する。SKIP: 単発の通常タスク管理は別のタスクスキル、メタエージェントだけを直接起動する場合は /meta を使う。"
---

# /routine

リポジトリに記録された定期実行タスクを手動で確認・実行する入口の参考実装。パス・名称は各組織の構成に合わせて調整して使う。ここでは 3 系統を例示する：

1. `meta` — 自己点検メタエージェント（`/meta` と同じ仕組み）
2. `ops` — データ収集パイプライン（収集 → 正規化 → 分析 → 書き出し）の手動起動。**あくまで一例**であり、自分の定期ジョブに置き換えてよい
3. `chat` — 外部トリガー（例：定期実行の外部スケジューラ）で動くパイプラインの状態確認のみ

## 引数

| コマンド | 何をするか | 外部への影響 |
|---|---|---|
| `/routine` | 定期実行タスクの状態を見る。`/routine status` と同じ | 読み取りのみ |
| `/routine status` | メタエージェントの最終実行時刻とパイプラインの進捗を表示する | 読み取りのみ |
| `/routine meta reviewer` | ルール・schema・ログ・data_flow の整合性レビューを手動実行する | ログと last-run を更新 |
| `/routine meta scout` | リポ外ベストプラクティス観測を手動実行する | ログと last-run を更新 |
| `/routine meta lab` | スキル横展開・新スキル候補の点検を手動実行する | ログと last-run を更新 |
| `/routine meta janitor` | リポジトリ整理候補を点検する。削除は提案止まり | ログと last-run を更新 |
| `/routine meta all` | reviewer / scout / lab / janitor をまとめて実行する | ログと last-run を更新 |
| `/routine ops status` | データ収集パイプラインの各層の状態を見る | 読み取りのみ |
| `/routine ops collect` | 各データソースからログを収集する | ローカル data/state を更新 |
| `/routine ops preprocess` | 収集済みログを統一スキーマへ正規化する | ローカル data/state を更新 |
| `/routine ops analyze` | LLM API でタスク候補・繰り返しパターン等を分析する | API 利用、ローカル分析結果を更新 |
| `/routine ops write` | 分析結果を出力先（表計算等）に書き込む | 外部ストアを更新 |
| `/routine ops all` | collect -> preprocess -> analyze -> write を通しで実行する | API 利用、外部書き込みあり |
| `/routine chat` | 外部トリガー系パイプラインの設計と残作業を確認する | 読み取りのみ |

引数なしの `/routine` は `/routine status` と同じ。

## `/routine status`

メタエージェントとパイプラインの状態を確認する。

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

cd "{{ORG_REPO_PATH}}/Agent-team/tools/<pipeline>"
python3 run.py status
```

必要に応じて `<tasks-file>`（例：`tasks.json`）のうち定期実行由来（例：`source:"ops-pipeline"`、タイトル/notes に「定期」を含む等）の項目も確認する。

## `/routine meta [role|all]`

メタエージェントを手動起動する。`role` は `reviewer` / `scout` / `lab` / `janitor` / `all`。

手順は `/meta` と同じ。完了後は必ず以下を行う：

```bash
date +%s > "{{ORG_REPO_PATH}}/Agent-team/logs/reviews/.last-run-<role>"
rm -f "{{ORG_REPO_PATH}}/Agent-team/logs/reviews/.pending/<role>"
```

## `/routine ops [mode]`

データ収集パイプラインを手動実行する。引数なしは `status`。（このパイプラインは一例。自分の定期ジョブ実装に差し替えてよい）

| mode | 実行内容 |
|---|---|
| `status` | 各層の状態表示 |
| `collect` | 各データソースの収集 |
| `preprocess` | 収集データの正規化 |
| `analyze` | LLM API による分析 |
| `write` | 出力先への書き込み |
| `all` | collect -> preprocess -> analyze -> write |

```bash
cd "{{ORG_REPO_PATH}}/Agent-team/tools/<pipeline>"
python3 run.py <mode>
```

注意：

- `analyze` / `all` は LLM API キー（`<api-key>`。**必ず環境変数から読み、コミットしない**）が必要。
- `write` / `all` は外部ストアに書き込む。
- 実行前に `{{ORG_REPO_PATH}}/Agent-team/tools/<pipeline>/config.json` が現在の環境に合っているか確認する。

## `/routine chat`

外部トリガー（例：別スケジューラ）で動くパイプラインの設計と残作業を確認する。

この系統は外部側のトリガーで動くため、エージェントから直接定期実行しない。確認対象は自分の設計ドキュメントとタスク一覧の該当項目に読み替える。

## 関連

- `/meta` — メタエージェントの手動起動（`meta` 系統の実体）

## 関連ファイル（自環境に合わせて配置）

- メタ起動スキル：`{{ORG_REPO_PATH}}/Agent-team/skills/meta/SKILL.md`
- パイプライン実装：`{{ORG_REPO_PATH}}/Agent-team/tools/<pipeline>/run.py`
- パイプライン README：`{{ORG_REPO_PATH}}/Agent-team/tools/<pipeline>/README.md`
- タスク一覧：`<tasks-file>`
- メタエージェントのログ・last-run：`{{ORG_REPO_PATH}}/Agent-team/logs/reviews/`
