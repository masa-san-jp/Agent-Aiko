---
name: aiko-export
description: Export current override persona in a reproducible format. Use when the user types "/aiko-export".
---

# /aiko-export

現在の Aiko（自分用）の内容を、再現可能な形式で出力します。

## 手順

1. `aiko-override.md` と `aiko-origin.md` を読み込みます

2. diff を取り、変更箇所のみを抽出します

   ```bash
   diff -u .claude/aiko/persona/aiko-origin.md .claude/aiko/persona/aiko-override.md
   ```

3. 以下の形式で出力します

   ````
   ## Aiko（自分用）エクスポート
   **出力日時**: YYYY-MM-DD HH:MM

   ### 再現手順
   以下のコマンドを順に実行すると現在の状態を再現できます：

   ```
   /aiko-reset       # まずオリジナルに戻す
   /aiko-or <変更内容を自然文で記述>
   ```

   ### 現在の override 全文
   （aiko-override.md の全内容をコードブロックで表示）

   ### オリジナルからの差分
   （diff 出力）
   ````

4. 必要であれば `/aiko-profile save <name>` でプロファイルとして保存する選択肢を添えます

   ```
   このまま保存しますか？ /aiko-profile save <名前> で保存できます。
   ```

## 用途

- 育てた Aiko（自分用）を他の環境に移したい
- バックアップとして手元に残したい
- 誰かと共有したい（GitHub Discussions 等に貼る）
