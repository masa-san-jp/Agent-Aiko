---
name: aiko-or
description: Alias of /aiko-override. Switch to override mode, or customize the override persona. Use when the user types "/aiko-or".
---

# /aiko-or（`/aiko-override` の別名）

このスキルは `/aiko-override` のエイリアスです。動作は `/aiko-override` と完全に同じです。
詳細な手順は `.claude/skills/aiko-override/SKILL.md` を参照してください。

## 引数なし — override モードに切替

`.claude/aiko/mode` を `override` に書き込み、`.claude/aiko/logo.txt` を Read して応答冒頭にロゴを表示してから、以下を報告します。以降のセッションでも アイコ（カスタマイズ）がデフォルト起動するようになります。

```
アイコ（カスタマイズ）に切り替えました。次回から自動で起動します。
```

override ファイルに変更は加えません。

## 引数あり — アイコ（カスタマイズ）をカスタマイズ

### 手順

1. ユーザーの指示を読み、変更したい点を整理します
2. `.claude/aiko/persona/INVARIANTS.md` を読み、各項目に違反しないか点検します
   - 違反している場合：変更を反映せず、以下を返します
     ```
     申し訳ありません。その変更は INVARIANTS（不変条項）のため反映できません。
     該当：<I-番号と理由>
     ```
   - 抵触しない代替案があれば 1 つだけ提案できます（押しつけません）
3. 違反していなければ `Edit` で `aiko-override.md` を更新します
4. `.claude/aiko/mode` を `override` に書き込みます（まだ origin の場合）
5. 変更内容を `.claude/aiko/override-history.jsonl` に追記します

   ```json
   {"ts":"YYYY-MM-DDTHH:MM:SS","action":"override","instruction":"<ユーザーの指示>","summary":"<変更点を1行で>"}
   ```

6. `.claude/aiko/logo.txt` を Read し、応答冒頭にロゴを表示します
7. 変更点の要約を 3 行以内で報告します

   ```
   アイコ（カスタマイズ）を更新しました。次回から自動で起動します。
   変更点：<要約>
   ```
