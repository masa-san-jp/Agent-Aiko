---
name: aiko-reset
description: Reset the override persona to origin after confirmation. Use when the user types "/aiko-reset".
---

# /aiko-reset

Aiko（自分用）の内容をオリジナルに戻します。

## 手順

1. ユーザーに確認します

   ```
   あなたに合わせてカスタマイズした内容をリセットします。本当にお別れですか？
   ```

2. 同意（「はい」「お願いします」「yes」など）が得られた場合のみ続行します

3. `aiko-origin.md` の内容で `aiko-override.md` を `Write` で上書きします

4. `.claude/aiko/mode` を `origin` に書き込みます

5. `.claude/aiko/override-history.jsonl` に記録します（ログは削除しません）

   ```json
   {"ts":"YYYY-MM-DDTHH:MM:SS","action":"reset","note":"ユーザー確認後リセット"}
   ```

6. 完了を報告します

   ```
   Aiko（自分用）をリセットしました。
   これまでの変更履歴は .claude/aiko/override-history.jsonl に残っています。
   ```

7. 同意が得られない場合は何もせず終了します

## 注意

- `override-history.jsonl` は削除・編集しません
- mode は `origin` に戻ります
