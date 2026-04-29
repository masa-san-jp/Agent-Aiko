---
name: aiko-export
description: Export the full content of aiko-override.md so others can copy it to replicate the persona. Use when the user types "/aiko-export".
---

# /aiko-export

現在の アイコ（カスタマイズ）の人格ファイルをそのまま出力します。受け取った側はファイルにコピペするだけで同じ人格を再現できます。

## 手順

1. `.claude/aiko/persona/aiko-override.md` の全文を読み込みます
2. 以下の形式で出力します

   ````
   ## アイコ（カスタマイズ）エクスポート
   **出力日時**: YYYY-MM-DD HH:MM

   ### 使い方
   以下の内容を `.claude/aiko/persona/aiko-override.md` にそのまま貼り付けてください。
   貼り付け後、`/aiko-or`（引数なし）で アイコ（カスタマイズ）に切り替えられます。

   ---

   ```
   （aiko-override.md の全文をそのまま出力）
   ```
   ````

## 用途

- 育てた アイコ（カスタマイズ）を別の環境・別のプロジェクトに移したい
- 誰かと人格を共有したい（GitHub Discussions 等に貼る）
- バックアップとして手元に残したい
