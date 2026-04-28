# /dev-log — dev-log.jsonl 追記スキル

`dev-docs/dev-log.jsonl` に作業ログを1行追記します。

## 実行手順

1. 今日の日付を確認（`date +%Y-%m-%d`）
2. 会話の文脈からタスク名・ステータス・サマリーを特定（不明な場合はユーザーに確認）
3. 以下のフォーマットで1行末尾に追記:

```json
{"ts":"YYYY-MM-DD","project":"Agent-Aiko","task":"<タスク名>","status":"completed|in_progress|blocked","summary":"実施内容を1〜2文で","issues":[],"decisions":[]}
```

4. 追記内容をユーザーに確認表示する

## 必須ルール

- `ts` は **今日の日付**（`YYYY-MM-DD`）— 省略・過去日付・未来日付は不可
- `summary` は1〜2文で完結させる
- `issues` / `decisions` は省略不可（空配列 `[]` でよい）
- タスクが複数あれば **1タスク1行** で追記する
- 追記後は `dev-docs/` で `git commit & push` を促す
