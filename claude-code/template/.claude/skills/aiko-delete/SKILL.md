---
name: aiko-delete
description: Delete a named persona after confirmation. Use when the user types "/aiko-delete <name>".
---

# /aiko-delete \<name\>

名前付き人格を削除します（確認あり）。

## 手順

1. `<name>` が指定されていない場合：
   ```
   削除する人格名を指定してください。例: /aiko-delete work
   /aiko-personas で一覧を確認できます。
   ```

2. `<name>` が `origin`, `override`, `default` の場合：
   ```
   エラー：「<name>」は削除できません。
   ```

3. `overrides/<name>/persona.md` が存在しない場合：
   ```
   エラー：人格「<name>」が見つかりません。
   /aiko-personas で利用可能な人格を確認できます。
   ```

4. 現在アクティブな人格（`active-persona` の値と一致）を削除しようとした場合：
   ```
   エラー：「<name>」は現在アクティブな人格のため削除できません。
   先に /aiko-select で別の人格に切り替えてから削除してください。
   ```

5. 上記すべてを通過したら確認を求めます：
   ```
   「<name>」を削除します。元に戻せません。本当によろしいですか？ [y/N]
   ```

6. 「`y`」「`yes`」「`はい`」などの肯定が得られた場合のみ続行します：
   - `overrides/<name>/` ディレクトリを削除します
   - `.claude/aiko/override-history.jsonl` に追記します
     ```json
     {"ts":"YYYY-MM-DDTHH:MM:SS","action":"delete-persona","name":"<name>","summary":"人格 <name> を削除"}
     ```
   - 完了を報告します
     ```
     人格「<name>」を削除しました。
     ```

7. 否定または無応答の場合は何もせず終了します

## 注意

- `override-history.jsonl` の既存の記録は削除しません（追記のみ）
