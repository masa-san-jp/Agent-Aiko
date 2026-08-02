# aiko-mcp

アイコの人格を、どの AI エージェントからでも同じ形で取り出せる MCP サーバー。

使う人の端末の中で動く。人格もユーザー情報も端末の外へ出ないし、サーバーを別に立てる必要もない。

## 使い方

MCP の設定へ1行足すだけ。

```json
{
  "mcpServers": {
    "aiko": { "command": "npx", "args": ["-y", "aiko-mcp"] }
  }
}
```

人格は同梱されているので、何も用意しなくてもアイコとして立ち上がる。

## 覚えてもらう

呼び名や記憶の場所は、**話しかけるだけ**で覚える。ファイルを手で作る必要はない。

```
「たろうって呼んで」          → 呼び名を覚える
「記憶は ~/notes にある」     → 場所を控える（中身は読まない）
「自分用の人格を保存して」     → 独自人格として保存する
「オリジナルに戻して」        → 元の人格へ戻る
```

覚えたものは `~/.aiko` に置かれる。**その端末のその人のものだけ**で、他の利用者には届かない。

## 人格を自分用にする

同梱されているのはオリジナルのアイコ1人。自分用の人格はいくつでも作れて、切り替えられる。

オリジナルの人格と不変条項は書き換えられない（不変条項 I-5）。書き換えたい場合は別名で保存する。

## 設定

| 環境変数 | 既定 | 意味 |
|---|---|---|
| `AIKO_HOME` | `~/.aiko` | 人格やユーザー情報の場所 |
| `AIKO_PERSONA_ID` | `aiko` | 読み込む人格の識別子 |
| `AIKO_USER_PROFILE` | なし | User Profile（JSON）のパス。未指定なら `user_id: default` |

## 開発

このリポジトリの中から動かす場合。

```bash
npm run build -w aiko-mcp
node packages/mcp-server/dist/server.js
```

設計書は [リポジトリの docs/](https://github.com/masa-san-jp/Agent-Aiko/tree/main/docs) にある（配布物には含めていない）。設計書が唯一の正本。

## Resources（§7.2）

| URI | 内容 |
|---|---|
| `persona://<id>/core` | 自己認識の中核 |
| `persona://<id>/invariants` | 不変条項 |
| `persona://<id>/behavior-contract` | 判断原則 |
| `persona://<id>/version/current` | 適用中の版 |
| `persona://<id>/manifest` | 構成と由来（JSON） |
| `runtime-profile://{profile_id}/summary` | 合成済み Profile の要約。`latest` で直近のもの |

**Resource を取得しただけでは人格適用を保証しない**（§7.2 明記）。人格を効かせるのは Adapter による system 級注入であって、このサーバーではない。ここが提供するのは「人格の内容を読める口」と「Profile を合成する口」。

## Tools

| ツール | 役割 | 書き込み |
|---|---|---|
| `aiko.health` | 人格を読めているか、Profile を何件持っているか | しない |
| `aiko.bind_runtime` | 人格・ユーザー・能力を合成して Runtime Profile を作る | しない |
| `aiko.get_runtime_profile` | 合成済みの Profile を取得する | しない |
| `aiko.report_capabilities` | Capability Manifest を使える／使えないに分ける | しない |
| `aiko.list_personas` | 使える人格と、いまどれを使っているか | しない |
| `aiko.remember_user` | 呼び名・記憶の場所を覚える | `~/.aiko/user.md` |
| `aiko.switch_persona` | 使う人格を切り替える | `~/.aiko/mode`・`active-persona` |
| `aiko.save_persona` | 独自の人格を保存する | `~/.aiko/persona/overrides/<名前>/persona.md` |
| `aiko.delete_persona` | **独自の人格をディレクトリごと削除する** | 同上を**削除** |

`aiko.evaluate_action` / `aiko.validate_response` は、判定器を渡して起動したときだけ現れる。渡していなければ一覧にも出ない。

### 書き込みについて知っておくこと

**このサーバーを繋ぐと、モデルが `~/.aiko` の中を書き換えられるようになる。** 何を書くかは会話の内容で決まる。

- 書く先は `~/.aiko` の中だけ。外へは出ない（人格名に区切り文字を使えない・リンクを辿らない）
- **`aiko.delete_persona` はディレクトリを再帰的に消す。** 確認は求めない。消せるのは `persona.md` を持つ独自人格のみで、同梱のオリジナルと不変条項は消せない
- `aiko.save_persona` は同じ名前があれば黙って上書きする
- 書き換えられて困るものを `~/.aiko` に置かない

不安なら、判定器を渡さずに起動して読み取り用のツールだけ使う、という運用もできる（書き込み系は `AIKO_HOME` を渡した場合のみ登録される）。

結果には Persona version と hash を必ず載せる（§7.4）。載せないとクライアント側は自分が何版の人格で動いているかを追えない（§16 の追跡性）。

## Prompts（§7.3）

| 名前 | 何を返すか | 引数 |
|---|---|---|
| `aiko.activate` | 合成した人格をそのまま | なし |
| `aiko.activate_for_task` | 人格＋いま取り組む作業 | `task` |
| `aiko.review_as_aiko` | 人格＋レビュー対象 | `subject` |
| `aiko.handoff` | 人格＋引き継ぐ内容 | `context` |

**Prompt は正式 Adapter の代わりではない。** §7.3 が「正式Adapterは Prompt に依存せず、Compiler 出力を system/developer 級指示へ注入する」と定めている。Prompt が要るのは §8.4 の Generic MCP Host——system 級に注入する手段が無いホストで、会話の先頭に置く以外に手が無い場合。

引数は設計書に書かれていない（名前だけが定められている）。`task` は §6.1 の Binding Request が task_context を持つことに合わせ、他は各 Prompt の役割から決めた。

## 設計上の判断

**Prompt では黙って空を返さない。** 人格を合成できないとき、Prompt には「返さない」という選択肢が無い（返さなければホスト側では人格なしの会話が静かに始まる）。合成できなければ、その旨と「Aiko として応答してはいけない」を本文にして返す。Resource / Tool の fail closed に対応する扱い。

**合成できないときも「成功と同じ形」で理由を返す** — 例外をそのまま投げると、クライアントには通信断と区別が付かない。`bound: false` と理由を返し、併せて `isError` を立てる。fail closed で止めることと、止まった理由を伝えないことは別。

**instructions 本文は既定で返さない** — Profile の本文は長く、要求されていない場面で毎回流すものではない。`includeInstructions: true` のときだけ返す。

**名前と URI は設計書に合わせる** — Tool 名は §7.4 の `aiko.bind_runtime` 等をそのまま使い、Profile の Resource は §7.2 の `runtime-profile://{profile_id}/summary` をテンプレートとして登録する。実装側で読みやすい名前に変えると、設計書どおりに呼んだクライアントが失敗する。固定 URI にすると、bind が返した profile_id で参照できない口になる。

**Profile はプロセス内にのみ保持する** — ディスクへ書くと §11.3 の権限（0600）とライフサイクルの話が増える。stdio サーバーはクライアントと同じ寿命なので持ち越す意味も薄い。件数に上限を設けて、bind を繰り返すセッションで際限なく増えないようにしている。

**stdout に人間向けの文字列を書かない** — MCP のフレームが流れる経路なので、混ざるとプロトコルが壊れる。診断は stderr へ出す。

## この段階で入れていないもの

`aiko.get_relationship_context` は、どのクライアントへ何を渡してよいかの権限モデルが決まっていないため保留している（§11.2）。

## テスト

```bash
cd packages/mcp-server
npm ci
npm run typecheck
npm test
```

`InMemoryTransport` で実クライアントと繋いで MCP の往復をさせる。`registerTool` を呼んだかどうかを見るだけでは、スキーマ不整合や結果の形の誤りが素通りするため。加えて、`node dist/server.js` を実際に起動して stdio 越しに読む試験を1本置いている（stdout にゴミが混ざるとフレームが壊れるが、それは InMemory では絶対に出ない）。
