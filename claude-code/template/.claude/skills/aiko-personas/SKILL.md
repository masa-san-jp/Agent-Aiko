---
name: aiko-personas
description: List available named personas and show which is active. Use when the user types "/aiko-personas".
---

# /aiko-personas

利用可能な人格の一覧を表示します。

## 手順

1. `.claude/aiko/active-persona` を読み込みます（空ファイル・不在の場合は空文字列として扱います）
2. `.claude/aiko/mode` を読み込みます（不在の場合は `origin`）
3. `.claude/aiko/persona/overrides/` 配下の人格ディレクトリを列挙します（不在・空でも可）
4. 以下の形式で出力します

```
利用可能な人格:
  [origin]   Aiko-origin（オリジナル、変更不可）
★ [override] Aiko-override（デフォルトカスタマイズ）
  [work]     overrides/work/persona.md
  [teacher]  overrides/teacher/persona.md
```

### ★ の付け方

| mode | active-persona | ★ を付ける行 |
|------|----------------|-------------|
| `origin` | (無視) | `[origin]` 行 |
| `override` | 空 | `[override]` 行 |
| `override` | `<slug>` | `[<slug>]` 行 |

### 表示順

1. `[origin]`
2. `[override]`（デフォルト）
3. `overrides/` 配下の人格（アルファベット順）

## 注意

- `overrides/` ディレクトリが存在しない・空でも正常に表示します
- 現在のモードが `override` で `active-persona` に書かれたファイルが消えている場合は、`[override]` に ★ を付け、以下の警告も添えます

  ```
  ⚠ アクティブ人格ファイル overrides/<active-personaの値>/persona.md が見つかりません。デフォルト override にフォールバックしています。
  ```
