---
name: aiko-profile
description: Manage named snapshots of the override persona (save / load / list / delete). Use when the user types "/aiko-profile".
---

# /aiko-profile

Override 人格 `.claude/aiko/persona/aiko-override.md` の名前付きスナップショットを管理します。保存先は `.claude/aiko/persona/profiles/<name>.md` です。

## 名前の制約

- 正規表現：`^[a-z0-9_-]{1,32}$`
- 予約語：`origin`（使用不可）
- 違反時：

  ```
  プロファイル名は英小文字・数字・`_`・`-` の 1〜32 文字で指定してください（`origin` は予約）。
  ```

## サブコマンド

### `save <name>`

1. 名前の妥当性を確認します
2. `profiles/<name>.md` がすでに存在する場合：

   ```
   profile `<name>` はすでに存在します。上書きしてよいですか？
   ```

   同意があれば上書き、なければ中止します。

3. `aiko-override.md` の内容を `profiles/<name>.md` に書き込みます
4. 報告：`profile <name> を保存しました。`

### `load <name>`

1. 名前の妥当性を確認します
2. `profiles/<name>.md` が存在しない場合：

   ```
   profile `<name>` は存在しません。`/aiko-profile list` で確認できます。
   ```

3. 存在すればその内容で `aiko-override.md` を上書きします（mode は変更しません）
4. 報告：`profile <name> を override に適用しました。`

### `list`

1. `profiles/` 直下の `*.md` を列挙し、拡張子を除いた名前を 1 行ずつ表示します
2. 1 件もなければ：

   ```
   保存済みプロファイルはありません。
   ```

### `delete <name>`

1. 名前の妥当性を確認します
2. 存在しなければ：

   ```
   profile `<name>` は存在しません。
   ```

3. 存在すれば削除します
4. 報告：`profile <name> を削除しました。`

## サブコマンドが指定されない・不正な場合

```
使い方：/aiko-profile <save|load|list|delete> [name]
```
