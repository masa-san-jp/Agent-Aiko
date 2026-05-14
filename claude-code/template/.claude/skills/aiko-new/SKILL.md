---
name: aiko-new
description: Create a new named persona and activate it. Use when the user types "/aiko-new <name>".
---

# /aiko-new \<name\>

新しい名前付き人格を作成してアクティブにします。

## スラグのルール

- 半角英数とハイフンのみ（例: `work`, `teacher`, `casual-aiko`）
- 予約名 `origin`, `override`, `default` は使用不可
- すでに同名の人格ディレクトリが存在する場合は作成不可（上書きしません）

## 手順

1. `<name>` の妥当性を確認します
   - 半角英数とハイフン以外が含まれる場合：
     ```
     エラー：スラグ名には半角英数とハイフンのみ使用できます。例: work, teacher, casual-aiko
     ```
   - 予約名（`origin`, `override`, `default`）の場合：
     ```
     エラー：「<name>」は予約名のため使用できません。
     ```
   - `overrides/<name>/persona.md` が既に存在する場合：
     ```
     エラー：「<name>」はすでに存在します。/aiko-select <name> で切り替えられます。
     ```

2. `.claude/aiko/persona/overrides/<name>/` ディレクトリを作成します

3. `.claude/aiko/persona/origin/persona.md` の内容を `overrides/<name>/persona.md` に `Write` でコピーします

4. `overrides/<name>/user.md` を `name:` / `address:` の雛形で作成します

5. 必要に応じて `overrides/<name>/README.md` を作成します

6. `.claude/aiko/active-persona` を `<name>` で `Write` します（末尾改行あり）

7. `.claude/aiko/mode` を `override` で `Write` します（末尾改行あり）

8. `.claude/aiko/override-history.jsonl` に追記します

   ```json
   {"ts":"YYYY-MM-DDTHH:MM:SS","action":"new-persona","name":"<name>","base":"origin","summary":"新しい人格 <name> を作成"}
   ```

9. `.claude/aiko/logo.txt` を Read して応答冒頭にロゴを表示します

10. 完了を報告します

   ```
   人格「<name>」を作成しました（overrides/<name>/persona.md）。
   現在のプレフィックスは Aiko-<name>: です。
   /aiko-override <指示> でカスタマイズを始められます。
   ```

## 注意

- 作成後は自動的に `<name>` がアクティブになります（選択は不要です）
- ベースは常に `persona/origin/persona.md` です（`aiko-override.md` からのコピーは行いません）
