---
name: aiko-reset
description: Reset the active (or specified) persona to origin after confirmation. Use when the user types "/aiko-reset" or "/aiko-reset <name>".
---

# /aiko-reset

人格の内容をオリジナルに戻します。

## 引数なし — 現在アクティブな人格をリセット

1. `.claude/aiko/active-persona` を読みます（空・不在の場合は空として扱います）

2. ユーザーに確認します

   ```
   あなたに合わせてカスタマイズした内容をリセットします。本当にお別れですか？
   ```

3. 同意（「はい」「お願いします」「yes」など）が得られた場合のみ続行します

4. **`active-persona` が空の場合：**
   - `aiko-origin.md` の内容で `aiko-override.md` を `Write` で上書きします
   - `.claude/aiko/mode` を `origin` に書き込みます

5. **`active-persona` = `<name>` の場合：**
   - `aiko-origin.md` の内容で `overrides/<name>.md` を `Write` で上書きします
   - `mode` と `active-persona` は変更しません（引き続き `<name>` がアクティブ）

6. `.claude/aiko/override-history.jsonl` に記録します（ログは削除しません）

   ```json
   {"ts":"YYYY-MM-DDTHH:MM:SS","action":"reset","target":"aiko-override.md または overrides/<name>.md","note":"ユーザー確認後リセット"}
   ```

7. `.claude/aiko/logo.txt` を Read し、応答冒頭にロゴを表示してから完了を報告します

   ```
   アイコ（カスタマイズ）をリセットしました。
   これまでの変更履歴は .claude/aiko/override-history.jsonl に残っています。
   ```

8. 同意が得られない場合は何もせず終了します

## 引数あり（`/aiko-reset <name>`）— 指定した名前付き人格をリセット

1. `overrides/<name>.md` が存在するか確認します
   - 存在しない場合：
     ```
     エラー：人格「<name>」が見つかりません。/aiko-personas で一覧を確認できます。
     ```

2. ユーザーに確認します

   ```
   「<name>」の内容をリセットします。本当によろしいですか？
   ```

3. 同意が得られた場合のみ `aiko-origin.md` の内容で `overrides/<name>.md` を `Write` で上書きします

4. 履歴に記録して完了を報告します

## 注意

- `override-history.jsonl` は削除・編集しません
- 引数なし + `active-persona` 空の場合のみ `mode` を `origin` に戻します
