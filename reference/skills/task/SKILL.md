---
name: task
description: "TRIGGER: ユーザーが /task list, /task add, /task update <id>, /task close <id> を入力した場合、または「残タスク」「次やること」「TODO」「やり残し」「保留」を尋ねられた／自分が新規残タスクを認識した場合。プロジェクト直下の tasks.json を正本として読み書きする。SKIP: tasks.json が存在しないリポジトリ、外部チケットシステム（GitHub Issues／Linear 等）で管理されている領域、または単発の一時的なメモ（保存不要なもの）."
---

# /task

残タスク管理スキル。プロジェクトの残タスク正本である `tasks.json`（配置先は自分の構成に合わせる。以下 `<TASKS_JSON>` と表記）を読み書きする。

詳細な運用ルールはタスクディレクトリの `README.md` に置く想定。

## 基本原則

- `<TASKS_JSON>` が**唯一の正本**。他のメモ・ドキュメント・ロール設定に別途タスク一覧を作らない
- 読みも書きも必ずこのスキルを経由する（直接編集してもよいが、ID 規則と重複チェックを破らないこと）

## サブコマンド

### `/task list [filters]`

`<TASKS_JSON>` から残タスクを読み出す。

**引数なし**：`status` が `open` または `in_progress` のタスクを priority 昇順 → created 降順で表示。

**フィルタ例**：

- `/task list status:open` — open のみ
- `/task list status:in_progress` — 着手中のみ
- `/task list source:<source-name>` — 特定 source
- `/task list source:<sourceA>,<sourceB>` — 複数 source
- `/task list agent:owner` — assignee 指定
- `/task list priority:<=2` — priority 2 以下（高優先のみ）
- 複数フィルタは AND 結合

**出力形式**：

```
T-2026W20-<source>-001 [open] (P2) [owner] タスクのタイトル
  source: <source-name>
  created: 2026-05-17
  notes: ...（1 行サマリ）
```

### `/task add`

新規タスクを追記。インタラクティブに以下を確認：

- **title**（必須）：簡潔なタイトル
- **source**（必須）：既存 source から選ぶか新規作成（source 名はプロジェクトで定義する分類ラベル）
- **agent**（必須）：assignee（`owner` がデフォルト）
- **priority**（任意）：1-5、デフォルト 3
- **notes**（任意）：背景・経緯
- **review_ref**（任意）：関連レビュー ID または外部ドキュメントパス

**ID 採番**：`T-<ISO-week>-<source>-<NNN>` を自動生成

- ISO-week：当日の ISO 週番号（例：2026-05-17 → 2026W20）
- NNN：同一週・同一 source の最大 NNN + 1（ゼロ埋め 3 桁）

**created**：当日の `YYYY-MM-DD`
**status**：`open` で開始

### `/task update <id>`

既存タスクの `status`／`notes`／`priority`／`agent` を更新する。

- `notes` への追記は **`[YYYY-MM-DD] 内容`** プレフィクスで時系列を保つ（既存 notes に append）
- `status` を `done` に変える場合は `/task close` を使う（completed 日付の自動付与のため）

### `/task close <id>`

`status` を `done` に遷移、`completed` に当日日付を入れ、必要なら notes に完了経緯を追記する。

`status: close-as-skipped` にしたい場合は `/task update <id>` で明示的に指定。

## 実装ノート

- `<TASKS_JSON>` は手書きしやすい JSON。Python の `json.load`／`json.dump`（`ensure_ascii=False, indent=2`）で読み書きする想定
- 同時編集ロックは特に持たない（単一ユーザー前提。マルチユーザーなら排他制御を足す）
- diff を見やすく保つため、フィールドの順序は schema 順（id → title → agent → priority → status → source → review_ref → created → notes → completed）

## 関連ファイル

- 正本：`<TASKS_JSON>`（プロジェクト直下のタスク JSON）
- ルール本体：タスクディレクトリの `README.md`
- ルール目次：プロジェクトのルール索引ドキュメント（あれば）
