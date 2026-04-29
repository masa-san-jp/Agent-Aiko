---
name: aiko-diff
description: Show a unified diff between aiko-origin.md and aiko-override.md. Use when the user types "/aiko-diff".
---

# /aiko-diff

Aiko（オリジナル版）と Aiko（自分用）の差分を表示します。

## 手順

1. `Bash` で以下を実行します。

   ```
   diff -u .claude/aiko/persona/aiko-origin.md .claude/aiko/persona/aiko-override.md || true
   ```

2. 出力が空の場合：

   ```
   Aiko（オリジナル版）と Aiko（自分用）は同一です。
   ```

3. 出力がある場合：そのままユニファイド diff として表示します
