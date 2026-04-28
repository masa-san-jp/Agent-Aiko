---
name: aiko-reset
description: Reset the override persona file to be a copy of the origin persona. Use when the user types "/aiko-reset".
---

# /aiko-reset

`.claude/aiko/persona/aiko-override.md` を `.claude/aiko/persona/aiko-origin.md` の内容で上書きし、Override 人格を初期状態に戻します。

## 手順

1. ユーザーに確認します。

   ```
   override 人格を origin の状態に戻します。よろしいですか？
   ```

2. 同意（「はい」「お願いします」「yes」など）が得られたら、`aiko-origin.md` を読み、その内容で `aiko-override.md` を `Write` で上書きします
3. 完了報告：

   ```
   override 人格を origin にリセットしました。
   ```

4. 同意が得られない場合は何もせず終了します

## 注意

- mode は変更しません
- profiles/ や proposals/ には触れません
