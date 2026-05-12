---
name: aiko-export
description: Export the full content of the active (or specified) persona. Use when the user types "/aiko-export" or "/aiko-export <name>".
---

# /aiko-export

人格ファイルをそのまま出力します。受け取った側はファイルにコピペするだけで同じ人格を再現できます。

## 引数なし — 現在アクティブな人格をエクスポート

1. `.claude/aiko/active-persona` を読みます（空・不在の場合は空として扱います）
2. 対象ファイルを決定します
   - `active-persona` が空 → `aiko-override.md`
   - `active-persona` = `<name>` → `overrides/<name>.md`
3. 対象ファイルの全文を読み込みます
4. 以下の形式で出力します

   ````
   ## アイコ（カスタマイズ）エクスポート
   **出力日時**: YYYY-MM-DD HH:MM
   **人格**: <ファイルパス>

   ### 使い方
   以下の内容を対象ファイルにそのまま貼り付けてください。

   ---

   ```
   （人格ファイルの全文をそのまま出力）
   ```
   ````

## 引数あり（`/aiko-export <name>`）— 指定した名前付き人格をエクスポート

1. `overrides/<name>.md` が存在するか確認します
   - 存在しない場合：
     ```
     エラー：人格「<name>」が見つかりません。/aiko-personas で一覧を確認できます。
     ```
2. `overrides/<name>.md` の全文を出力します（引数なし時と同じ形式）

## 用途

- 育てた アイコ（カスタマイズ）を別の環境・別のプロジェクトに移したい
- 誰かと人格を共有したい（GitHub Discussions 等に貼る）
- バックアップとして手元に残したい
