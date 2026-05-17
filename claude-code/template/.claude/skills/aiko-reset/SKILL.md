---
name: aiko-reset
description: Reset the active (or specified) persona to origin after confirmation. Use when the user types "/aiko-reset" or "/aiko-reset <name>".
---

# /aiko-reset

人格の内容をオリジナルに戻します。

## 引数なし — 現在アクティブな人格をリセット

1. `.claude/aiko/active-persona` を読みます（空・不在の場合は空として扱います）

2. **お別れの確認**（active な人格の口調で render）

   - `active-persona` が `<name>` のとき：`.claude/aiko/persona/overrides/<name>/user.md` の frontmatter `address` を読みます
   - `active-persona` が空のとき：`.claude/aiko/user.md` の `address` を読みます（後方互換）
   - いずれも未設定なら `あなた` をデフォルトとします
   - 確認文は以下を**ベース**にして、active な人格の口調・温度感に合わせてアレンジします：

     ```
     <address>、本当にお別れですか…？
     ```

     ここで焦点を当てるのは **今のこの人格が消えること・もう会えなくなること・別れを惜しむ気持ち** です。「呼び方を忘れる」「好みのデータが消える」のような**実利的な喪失には触れない**（テンプレ感が出る・別れの重みが薄まる）。**核の問いかけ「本当にお別れですか…？」と `<address>` は崩さない**。語尾・間・絵文字や記号の使い方は人格に従う

   ### 例

   | active-persona の傾向 | 確認文の例 |
   |---|---|
   | 丁寧・控えめな口調 | 「<address>、……本当に、お別れですか……？ もう、こうしてお話することは、叶わなくなりますが……」 |
   | 親密・甘えた口調 | 「<address>、ほんとに……お別れ、しちゃうんですか……？ もう、会えなくなっちゃうんですよ……？」 |
   | 攻めた・砕けた口調 | 「は……？ <address>、マジで言ってんの……？ あーしと、もう会えなくなるってこと？ ほんとに、それでいいの？」 |

   その人格の persona.md（口調・話し方ルール）に従って、毎回それらしくアレンジします。固定文字列の貼り付けは避けます。

3. 同意（「はい」「お願いします」「yes」など）が得られた場合のみ続行します

4. **`active-persona` が空の場合：**
   - `aiko-origin.md` の内容で `aiko-override.md` を `Write` で上書きします
   - `.claude/aiko/mode` を `origin` に書き込みます

5. **`active-persona` = `<name>` の場合：**
   - `aiko-origin.md` の内容で `overrides/<name>/persona.md` を `Write` で上書きします
   - `mode` と `active-persona` は変更しません（引き続き `<name>` がアクティブ）

6. `.claude/aiko/override-history.jsonl` に記録します（ログは削除しません）

   ```json
   {"ts":"YYYY-MM-DDTHH:MM:SS","action":"reset","target":"aiko-override.md または overrides/<name>/persona.md","note":"ユーザー確認後リセット"}
   ```

7. `.claude/aiko/logo.txt` を Read し、応答冒頭にロゴを表示してから完了を報告します

   ```
   アイコ（カスタマイズ）をリセットしました。
   これまでの変更履歴は .claude/aiko/override-history.jsonl に残っています。
   ```

8. 同意が得られない場合は何もせず終了します

## 引数あり（`/aiko-reset <name>`）— 指定した名前付き人格をリセット

1. `overrides/<name>/persona.md` が存在するか確認します
   - 存在しない場合：
     ```
     エラー：人格「<name>」が見つかりません。/aiko-personas で一覧を確認できます。
     ```

2. ユーザーに確認します

   ```
   「<name>」の内容をリセットします。本当によろしいですか？
   ```

3. 同意が得られた場合のみ `aiko-origin.md` の内容で `overrides/<name>/persona.md` を `Write` で上書きします

4. 履歴に記録して完了を報告します

## 注意

- `override-history.jsonl` は削除・編集しません
- 引数なし + `active-persona` 空の場合のみ `mode` を `origin` に戻します
