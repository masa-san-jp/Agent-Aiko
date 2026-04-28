# /dev-log — 開発ログ記録スキル

`dev-docs/dev-log.jsonl` への追記と、`dev-docs/` へのドキュメント作成を担います。

---

## モード1: dev-log.jsonl 追記

セッション終了時や作業の節目に実行します。

### 手順

1. 今日の日付を確認（`date +%Y-%m-%d`）
2. 会話の文脈からタスク名・ステータス・サマリーを特定（不明な場合はユーザーに確認）
3. 以下のフォーマットで1行末尾に追記:

```json
{"ts":"YYYY-MM-DD","project":"Agent-Aiko","task":"<タスク名>","status":"completed|in_progress|blocked","summary":"実施内容を1〜2文で","issues":[],"decisions":[]}
```

4. 追記内容をユーザーに確認表示する

### 必須ルール

- `ts` は **今日の日付**（`YYYY-MM-DD`）— 省略・過去日付・未来日付は不可
- `summary` は1〜2文で完結させる
- `issues` / `decisions` は省略不可（空配列 `[]` でよい）
- タスクが複数あれば **1タスク1行** で追記する

---

## モード2: dev-docs/ へのドキュメント作成

議事録・設計メモ・調査結果などを `dev-docs/` に新規作成するときに実行します。

### ファイル命名規則（必須）

```
YYYY-MM-DD-<slug>.md
```

- `YYYY-MM-DD` は **作成日**（今日の日付）
- `<slug>` はケバブケース（英数字・ハイフンのみ）
- 例: `2026-04-29-claude-rule-separation.md`

**日付プレフィックスは省略不可。** 省略されたファイルは受け付けない。

### 手順

1. 今日の日付を確認（`date +%Y-%m-%d`）
2. ファイル名を `YYYY-MM-DD-<slug>.md` 形式で決定する
3. ファイルを `dev-docs/` 直下に作成する
4. `dev-docs/README.md` のファイル一覧テーブルに追記する
5. `dev-log.jsonl` にも1行追記する（モード1のフォーマットで）

### ドキュメント更新時のリネーム

既存ファイルを大幅に更新した場合は、日付を更新する:

```sh
git mv dev-docs/2026-04-27-design.md dev-docs/2026-05-01-design.md
```

---

## 共通: 完了後の操作

追記・作成後は `dev-docs/` 内で commit & push してください:

```sh
cd /path/to/agent-aiko/dev-docs
git add .
git commit -m "<変更内容>"
git push origin main
```
