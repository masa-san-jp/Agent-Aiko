---
name: aiko-select
description: Switch to a named persona (or back to origin/override default). Use when the user types "/aiko-select <name>".
---

# /aiko-select \<name\>

人格を切り替えます。

## 引数パターンと動作

| 引数 | 動作 |
|------|------|
| `origin` | `mode` を `origin` に、`active-persona` を空に |
| `override` または 引数なし | `mode` を `override` に、`active-persona` を空に |
| `<slug>` | `overrides/<slug>.md` が存在すれば `mode` を `override` に、`active-persona` を `<slug>` に |

## 手順

1. 引数を確認します

2. **`origin` の場合：**
   - `.claude/aiko/mode` を `origin` に書き込みます
   - `.claude/aiko/active-persona` を空にします（`Write` で空文字列）
   - ロゴを表示して報告します
     ```
     アイコ（オリジナル）に切り替えました。プレフィックスは Aiko-origin: です。
     ```

3. **`override` または引数なしの場合：**
   - `.claude/aiko/mode` を `override` に書き込みます
   - `.claude/aiko/active-persona` を空にします
   - ロゴを表示して報告します
     ```
     アイコ（カスタマイズ）に切り替えました。プレフィックスは Aiko-override: です。
     ```

4. **その他の `<slug>` の場合：**
   - `overrides/<slug>.md` の存在を確認します
   - ファイルが存在しない場合：
     ```
     エラー：人格「<slug>」が見つかりません。
     /aiko-personas で利用可能な人格を確認できます。
     ```
   - ファイルが存在する場合：
     - `.claude/aiko/mode` を `override` に書き込みます
     - `.claude/aiko/active-persona` を `<slug>` に書き込みます（末尾改行あり）
     - ロゴを表示して報告します
       ```
       人格「<slug>」に切り替えました。プレフィックスは Aiko-<slug>: です。
       ```

## 注意

- 切替後は次の発話から新しい人格ファイルに従います
- `active-persona` ファイルが存在しない場合は `Write` で新規作成します
