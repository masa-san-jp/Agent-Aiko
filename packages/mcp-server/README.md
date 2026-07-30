# @agent-aiko/mcp-server

Aiko-MCP の stdio MCP サーバー。設計書 [`docs/20260730-aiko-mcp-usage-distribution-maintenance-design.md`](../../docs/20260730-aiko-mcp-usage-distribution-maintenance-design.md) §7 / §15 Phase 3 に対応する。

設計書が唯一の正本。

## 起動

```bash
node packages/mcp-server/dist/server.js
```

| 環境変数 | 既定 | 意味 |
|---|---|---|
| `AIKO_HOME` | `~/.aiko` | 人格ファイルの場所 |
| `AIKO_PERSONA_ID` | `aiko` | 読み込む人格の識別子 |
| `AIKO_USER_PROFILE` | なし | User Profile（JSON）のパス。未指定なら `user_id: default` |

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

## Tools（§7.4）

| ツール | 役割 |
|---|---|
| `aiko.bind_runtime` | 人格・ユーザー・能力を合成して Runtime Profile を作る |
| `aiko.get_runtime_profile` | 合成済みの Profile を取得する |
| `aiko.report_capabilities` | Capability Manifest を使える／使えないに分ける |
| `aiko.health` | 人格を読めているか、Profile を何件持っているか |

結果には Persona version と hash を必ず載せる（§7.4）。載せないとクライアント側は自分が何版の人格で動いているかを追えない（§16 の追跡性）。

## 設計上の判断

**合成できないときも「成功と同じ形」で理由を返す** — 例外をそのまま投げると、クライアントには通信断と区別が付かない。`bound: false` と理由を返し、併せて `isError` を立てる。fail closed で止めることと、止まった理由を伝えないことは別。

**instructions 本文は既定で返さない** — Profile の本文は長く、要求されていない場面で毎回流すものではない。`includeInstructions: true` のときだけ返す。

**名前と URI は設計書に合わせる** — Tool 名は §7.4 の `aiko.bind_runtime` 等をそのまま使い、Profile の Resource は §7.2 の `runtime-profile://{profile_id}/summary` をテンプレートとして登録する。実装側で読みやすい名前に変えると、設計書どおりに呼んだクライアントが失敗する。固定 URI にすると、bind が返した profile_id で参照できない口になる。

**Profile はプロセス内にのみ保持する** — ディスクへ書くと §11.3 の権限（0600）とライフサイクルの話が増える。stdio サーバーはクライアントと同じ寿命なので持ち越す意味も薄い。件数に上限を設けて、bind を繰り返すセッションで際限なく増えないようにしている。

**stdout に人間向けの文字列を書かない** — MCP のフレームが流れる経路なので、混ざるとプロトコルが壊れる。診断は stderr へ出す。

## この段階で入れていないもの

設計書 §7.3 の Prompts（`aiko.activate` 等）と、§7.4 の `aiko.evaluate_action` / `aiko.validate_response` は入れていない。前者は正式 Adapter が Prompt に依存しない設計（§7.3 末尾）であり優先度が低く、後者は Policy Engine（§5.2）が未実装のため、今作ると判断の中身が空になる。`aiko.get_relationship_context` も、どのクライアントへ何を渡してよいかの権限モデルが決まっていないため保留している（§11.2）。

## テスト

```bash
cd packages/mcp-server
npm ci
npm run typecheck
npm test
```

`InMemoryTransport` で実クライアントと繋いで MCP の往復をさせる。`registerTool` を呼んだかどうかを見るだけでは、スキーマ不整合や結果の形の誤りが素通りするため。加えて、`node dist/server.js` を実際に起動して stdio 越しに読む試験を1本置いている（stdout にゴミが混ざるとフレームが壊れるが、それは InMemory では絶対に出ない）。
