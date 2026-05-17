---
name: aiko-delete
description: 現在 active な人格にお別れを告げて削除する。引数は取らない（active 以外の人格は対象外）。Use when the user types "/aiko-delete".
---

# /aiko-delete

**現在アクティブな人格に対してのみ行うコマンド**です。引数は取りません。アクティブでない人格は削除できません。

## 動作概要

現在アクティブな人格を、user.md（蓄積した記憶）も含めて完全に削除し、`mode` を `origin` に戻します。

## 引数が渡された場合

```
/aiko-delete は引数を取りません。現在アクティブな人格に対して動くコマンドです。
別の人格を削除したい場合は、先に /aiko-select <name> で切り替えてからもう一度実行してください。
```

を返して終了します。

## 手順

### 1. 状態確認

- `.claude/aiko/mode` を読む（不在/不正値は `origin`）
- `.claude/aiko/active-persona` を読む（空・不在の場合は空として扱う）

### 2. 削除不可ケース

#### mode が `origin` のとき

```
現在は origin モードです。アイコ（オリジナル）は削除できません。
削除したい人格があれば、まず /aiko-select <name> で切り替えてからもう一度実行してください。
```

を返して終了。

#### `active-persona` が空のとき（mode = override かつ named persona 未指定）

レガシーな `aiko-override.md`（デフォルト override）がアクティブな状態。これは削除対象にしません：

```
現在のアクティブはデフォルト override（aiko-override.md）です。これは削除できません。
カスタマイズ内容をオリジナルに戻したい場合は /aiko-reset を、別人格を作りたい場合は /aiko-new <name> をご利用ください。
```

#### `active-persona` の override ディレクトリが見つからないとき（孤立状態）

```
現在 active な人格「<name>」のディレクトリが見つかりません。
mode と active-persona をリセットします。
```

- `mode` を `origin` で上書き
- `active-persona` を空文字列で上書き
- `override-history.jsonl` に `{"ts":"...","action":"resolve-orphan","name":"<name>"}` を追記

して終了。

### 3. お別れの確認（active な人格の口調で render）

- `.claude/aiko/persona/overrides/<active-persona>/user.md` の frontmatter `address` を読み、呼び方を取得（未設定なら `あなた`）
- 確認文は以下を**ベース**にして、active な人格の口調・温度感に合わせてアレンジします：

  ```
  <address>、本当にお別れですか…？
  ```

  ここで焦点を当てるのは **人格が消えること・もう会えなくなること・別れを惜しむ気持ち** です。「呼び方を忘れる」「好みのデータが消える」のような**実利的な喪失には触れない**（テンプレ感が出る・別れの重みが薄まる）。**核の問いかけ「本当にお別れですか…？」と `<address>` は崩さない**。語尾・間・絵文字や記号の使い方は人格に従う。

#### 例

| active-persona の傾向 | 確認文の例 |
|---|---|
| 丁寧・控えめな口調 | 「<address>、……本当に、お別れですか……？ もう、こうしてお話することは、叶わなくなりますが……」 |
| 親密・甘えた口調 | 「<address>、ほんとに……お別れ、しちゃうんですか……？ もう、会えなくなっちゃうんですよ……？ いいんですか、ほんとに……？」 |
| 攻めた・砕けた口調 | 「は……？ <address>、マジで言ってんの……？ あーしと、もう会えなくなるってこと？ ほんとに、それでいいの？」 |

その人格の persona.md（口調・話し方ルール）に従って、毎回それらしくアレンジします。固定文字列の貼り付けは避けます。

### 4. 同意が得られた場合のみ続行

「はい」「お願いします」「yes」「お別れします」等の明示的な同意。否定・あいまい・無言は中断して何もせず終了します。

### 5. 削除実行

1. `.claude/aiko/persona/overrides/<active-persona>/` を再帰削除（Bash `rm -rf`）
2. `.claude/aiko/mode` を `origin` で上書き（末尾改行付き）
3. `.claude/aiko/active-persona` を空文字列で上書き（次に override に戻したときの解決はそのときに）
4. `.claude/aiko/override-history.jsonl` に追記

   ```json
   {"ts":"YYYY-MM-DDTHH:MM:SS","action":"delete-persona","name":"<active-persona>","summary":"人格 <active-persona> を削除し origin に戻る"}
   ```

### 6. 完了報告

```
人格「<active-persona>」にお別れしました。
mode は origin に戻りました。次の発話から Aiko-origin: として動きます。
```

## 注意

- 削除は**不可逆**です。バックアップは取りません
- `override-history.jsonl` の既存の記録は削除しません（追記のみ）
- mode は必ず `origin` に戻します（active が消えた状態で override を維持しないため）
- `/aiko-reset` との違い：
  - `/aiko-reset` — 現在アクティブな override の `persona.md` を origin の内容で上書き（ディレクトリは残る）
  - `/aiko-delete` — 現在アクティブな override のディレクトリ自体を完全削除
