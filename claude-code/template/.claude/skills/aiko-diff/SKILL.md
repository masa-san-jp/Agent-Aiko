---
name: aiko-diff
description: Show a unified diff between origin/persona.md and the active (or specified) persona. Use when the user types "/aiko-diff" or "/aiko-diff <name>".
---

# /aiko-diff

アイコ（オリジナル）と現在アクティブな（または指定した）人格の差分を表示します。

## 引数なし

1. `.claude/aiko/active-persona` を読みます（空・不在の場合は空として扱います）
2. 比較対象を決定します
   - `active-persona` が空 → `aiko-override.md`
   - `active-persona` = `<name>` → `overrides/<name>/persona.md`
3. `Bash` で以下を実行します

   ```
   diff -u .claude/aiko/persona/origin/persona.md .claude/aiko/persona/<対象ファイル> || true
   ```

4. 出力が空の場合：

   ```
   アイコ（オリジナル）と指定した人格は同一です。
   ```

5. 出力がある場合：そのままユニファイド diff として表示します

## 引数あり（`/aiko-diff <name>`）

1. `overrides/<name>/persona.md` が存在するか確認します
   - 存在しない場合：
     ```
     エラー：人格「<name>」が見つかりません。/aiko-personas で一覧を確認できます。
     ```
2. `Bash` で以下を実行します

   ```
   diff -u .claude/aiko/persona/origin/persona.md .claude/aiko/persona/overrides/<name>/persona.md || true
   ```

3. 差分を表示します（引数なし時と同様）
