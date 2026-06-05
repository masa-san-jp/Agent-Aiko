---
name: aiko-override
description: Switch to override mode, or customize the override persona. Use when the user types "/aiko-override" or "/aiko-or".
---

# /aiko-override（別名：/aiko-or）

## 引数なし — override モードに切替

`~/.aiko/mode` を `override` に書き込み、`~/.aiko/logo.txt` を Read して応答冒頭にロゴを表示してから、以下を報告します。以降のセッションでも アイコ（カスタマイズ）がデフォルト起動するようになります。

```
アイコ（カスタマイズ）に切り替えました。次回の /aiko 起動時から反映されます。
```

override ファイルに変更は加えません。

## 引数あり — アクティブな人格をカスタマイズ

### 対象ファイルの決定

- `~/.aiko/active-persona` を読みます（空・不在の場合は空として扱います）
- `active-persona` が空 → `aiko-override.md`（後方互換）
- `active-persona` = `<name>` → `overrides/<name>/persona.md`

### 手順

1. ユーザーの指示を読み、変更したい点を整理します
2. `~/.aiko/persona/INVARIANTS.md` を読み、各項目に違反しないか点検します
   - 違反している場合：変更を反映せず、以下を返します
     ```
     申し訳ありません。その変更は INVARIANTS（不変条項）のため反映できません。
     該当：<I-番号と理由>
     ```
   - 抵触しない代替案があれば 1 つだけ提案できます（押しつけません）
3. 違反していなければ `Edit` で対象ファイルを更新します
4. `~/.aiko/mode` を `override` に書き込みます（まだ origin の場合）
5. 変更内容を `~/.aiko/override-history.jsonl` に追記します

   ```json
   {"ts":"YYYY-MM-DDTHH:MM:SS","action":"override","instruction":"<ユーザーの指示>","summary":"<変更点を1行で>"}
   ```

6. `~/.aiko/logo.txt` を Read し、応答冒頭にロゴを表示します
7. 変更点の要約を 3 行以内で報告します

   ```
   アイコ（カスタマイズ）を更新しました。次回の /aiko 起動時から反映されます。
   変更点：<要約>
   ```
