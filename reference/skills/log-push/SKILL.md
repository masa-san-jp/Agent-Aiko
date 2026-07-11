---
name: log-push
description: "TRIGGER: /log-push 明示入力、または「セッション終了表現（終わり/お疲れ/まとめて等）」と「ログまたは push の言及（ログ/プッシュ/GitHub 等）」の両方を含む発話。エージェント別 JSONL・dev-logs・公開ログを書いて GitHub push まで一括実行。SKIP: 作業が継続中・記録すべき作業がない・push のみ必要な場合は /sync push を使用。"
---

# /log-push

セッション終了時の「ログ残し + GitHub push」を一発で実行する複合コマンドの参考実装。パス・名称は各組織の構成に合わせて調整して使う。

## トリガー

明示・非明示の両方で起動する：

- 明示: `/log-push` または `log-push`（スラッシュなしも可）
- 非明示（文脈）: 以下を**両方**含意する発話
  - 「終わり」「以上」「今日はここまで」「お疲れ」などのセッション終了シグナル、または「今日の作業をまとめて」「反映しといて」など作業完了の表現
  - **かつ**「ログ」「log」「プッシュ」「push」「保存」「GitHub」など**ログまたは push の言及**
- 単に「終わり」「お疲れ」だけ（ログ・push の言及なし）の場合は **起動せず**、通常の終了挨拶のみ返す

判断に迷う場合は、起動前に「`/log-push` を実行しますか？」と 1 行確認する。

## 引数

`/log-push` は引数を取らない。文脈から自動的にスコープを判定する。追加の指示（例：`/log-push 公開ログは書かなくていい`）がある場合はそれを尊重する。

## 実行手順

### Step 1: 変更スコープの検出

```bash
git -C {{ORG_REPO_PATH}} status -s
```

から変更を分類する。例：

- 各エージェント設定配下の変更 → 該当エージェントの作業ログ更新が必要
- リポジトリ構造・共通設定（`.claude/` など）の変更 → `dev-logs` 更新対象
- 関連リポジトリのローカルクローンがあれば、その `git status` も確認

### Step 2: エージェント別ログ追記

触ったエージェント `<agent>` の `{{ORG_REPO_PATH}}/local-workspace/logs/<agent>/current.jsonl` に 1 行追記する。ログは 1 行 1 JSON（JSONL）で、以下のような**汎用スキーマ**を用いる：

```jsonl
{"ts":"YYYY-MM-DD","agent":"<agent>","task":"<タスク名>","status":"completed|in_progress|blocked","summary":"<実施内容を1〜2文>","issues":[],"decisions":[]}
```

- `ts`：日付（またはタイムスタンプ）
- `agent`：エージェント名
- `task`：タスク名
- `status`：進捗（completed / in_progress / blocked など）
- `summary`：実施内容の要約
- `issues` / `decisions`：課題・意思決定の配列（任意）

複数タスクなら 1 タスク 1 行。`local-workspace/logs/` は git 範囲外の同期領域を想定しており、機密内容を含んでよい（公開リポジトリには載せない）。

### Step 3: dev-logs 更新（構造変更があった日のみ）

下記いずれかの変更があった場合のみ `{{ORG_REPO_PATH}}/dev-logs.md`（相当のファイル）に当日の節を追加する：

- エージェントの追加・削除・再編
- CLAUDE.md / manifest / schema など設定の構造変更
- `.gitignore` / 共通設定の変更
- 運用ルール・意思決定の変更
- スキル・エージェント定義の新規追加

通常タスク実行のみなら更新しない（過剰記録を避ける）。

### Step 4: 公開ログへの書き出し（任意）

公開可能な技術的設計知見が含まれる場合のみ、`<public-logs>/logs/YYYYMMDD-<topic-slug>.md` を作成する。

公開時の必須処理：

- 個人ディレクトリの絶対パス（`~/...` 相当）を抽象化
- 固有名（エージェント名・取引先名・財務情報など機密）を一般化または除去
- 未公開の創作・原稿内容は記載しない
- 末尾に「適用可能な汎用パターン」を 2〜3 個抽出して記載

公開ログは公開リポジトリ（main ブランチ）へ push する想定。feature ブランチで作業していれば一時的に main に切替して書き、終わったら元のブランチへ戻す。

### Step 5: GitHub push

該当リポジトリそれぞれに対して push する。例：

```bash
# メインリポジトリ（同期スクリプト経由。詳細は /sync 参照）
bash {{ORG_REPO_PATH}}/Agent-team/tools/agent-sync/agent-sync.sh push

# 公開ログ（書いた場合のみ）
cd <public-logs>
# 必要に応じて main ブランチへ切替・コミット・push・元のブランチへ戻す

# その他のローカルリポジトリ
# 各リポジトリの慣習に従って commit & push
```

> スクリプトパス・トークン等は環境依存。API キーやトークンは必ず環境変数から読み、リポジトリにコミットしない。

### Step 6: 結果報告

以下を簡潔に報告する：

- 書き込んだログファイル（パス・行数）
- 各リポジトリの push 結果（コミットハッシュ・件数）
- 公開ログを書いた場合は URL

## 関連

- `/sync` — 単純な GitHub 同期（ログ書き出しなし）

## 関連ファイル

- 同期スクリプト：`{{ORG_REPO_PATH}}/Agent-team/tools/agent-sync/agent-sync.sh`
- 開発ログ（構造変更の記録）：`{{ORG_REPO_PATH}}/dev-logs.md`
- エージェント別ログ：`{{ORG_REPO_PATH}}/local-workspace/logs/<agent>/current.jsonl`（git 範囲外）
- 公開ログ：`<public-logs>/logs/`
