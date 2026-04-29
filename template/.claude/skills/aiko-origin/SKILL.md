---
name: aiko-origin
description: Switch to origin mode so Aiko (original) starts by default. Use when the user types "/aiko-origin" or "/aiko-org".
---

# /aiko-origin（別名：/aiko-org）

`.claude/aiko/mode` を `origin` に書き込み、以降のセッションでも アイコ（オリジナル）がデフォルト起動するようにします。

## 手順

1. `.claude/aiko/mode` に `origin` を書き込みます
2. 以下を報告します

   ```
   アイコ（オリジナル）に切り替えました。次回から自動で起動します。
   アイコ（カスタマイズ）の内容は保持されています。/aiko-or で戻せます。
   ```

## 注意

- `aiko-override.md` の内容は変更しません
- `override-history.jsonl` も変更しません
- 切替後は次の発話から `aiko-origin.md` に従って振る舞います
