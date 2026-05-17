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
| `<slug>` | `overrides/<slug>/persona.md` が存在すれば `mode` を `override` に、`active-persona` を `<slug>` に |

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

   タイポ・大文字小文字の揺れがあっても**なんとなく察して**解決します。`.claude/aiko/persona/overrides/` 配下で `persona.md` を含むディレクトリ名を候補集合として、以下を上から判定し、最初にヒットしたものを採用します。

   | 段階 | 判定 | 例 | 動作 |
   |------|------|----|------|
   | 1. 完全一致（大小無視・前後空白除去） | normalize 後に完全一致 | `Work` → `work` | **確認なし**で切替 |
   | 2. 単一の prefix 一致 | 入力で始まる候補が 1 個 | `wo` → `work` | 「`<候補>` ですね？」と 1 行確認 |
   | 3. 単一の部分一致 | 入力を含む候補が 1 個 | `ud` → `study` | 同上 |
   | 4. 単一の編集距離 ≤ 2 | Levenshtein 距離 ≤ 2 の候補が 1 個 | `worl` → `work` | 同上 |
   | 5. 複数候補にヒット | 2 個以上 | `w` → `work` / `writing` | 候補列挙して再入力 |
   | 6. ヒットなし | 0 個 | `xyz` | 候補列挙して再入力 |

   段階 2〜4 の確認：

   ```
   「<入力>」は「<候補>」のことですね？ 切り替えてよろしいですか？
   ```

   ユーザー同意で続行、否定なら全候補を列挙して再入力を促します。

   段階 5・6 の応答：

   ```
   「<入力>」に該当する人格が <複数 / 見つかり> ません。

   候補：
     origin
     ★ <active>
       <slug>
       <slug>

   もう一度 /aiko-select <name> で指定してください。
   ```

   解決後の切替動作：

   - `.claude/aiko/mode` を `override` に書き込みます
   - `.claude/aiko/active-persona` を `<slug>` に書き込みます（末尾改行あり）
   - ロゴを表示して報告します
     ```
     人格「<slug>」に切り替えました。プレフィックスは Aiko-<slug>: です。
     ```

## 注意

- 切替後は次の発話から新しい人格ファイルに従います
- `active-persona` ファイルが存在しない場合は `Write` で新規作成します
