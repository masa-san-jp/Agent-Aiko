# @agent-aiko/binder

Runtime Profile Binder。人格・ユーザー・能力を1つの Runtime Profile に束ね、束ねられないときは Profile を返さず理由を返す。設計書 [`docs/20260730-aiko-mcp-usage-distribution-maintenance-design.md`](../../docs/20260730-aiko-mcp-usage-distribution-maintenance-design.md) §5.3 / §6 に対応する。

設計書が唯一の正本。

## 中身

| モジュール | 役割 | 設計書 |
|---|---|---|
| `binder.ts` | 入力取得・検証・参照解決・最小権限化・競合解消・Profile 生成・hash・fail-closed 判定 | §5.3・§6.1・§6.5 |

`@agent-aiko/core` に依存する（人格の読み出し・合成・能力の解決・hash・スキーマ互換判定）。依存は一方向で、core は binder を知らない。

## core から分けた理由

設計書 §9 のリポジトリ構成が `packages/core` と `packages/binder` を別に置いている。Phase 2 では実装を早く通すために core の中に置いたが、そのままだと「Core を読む」ことが「束ねる責務まで読む」ことになり、§5.1〜§5.2（読み出しと合成）と §5.3（束ねる）の境界が消える。

分けたことで、core を使うが束ねはしない利用者——たとえば人格を読むだけの CLI——が Binder ごと引き込まなくて済む。

## 設計上の判断

**Level 2 を名乗るには注入手段が要る** — Claude Code と Codex は Level 2 対象だが、注入手段が指定されていなければ Profile を返さない。手段なしで Level 2 を名乗る Profile は、§3.4 の Fail Closed を素通りさせる嘘になる。

**止まるところと止まらないところを分けた** — 人格・不変条項・ユーザーの解決失敗は例外で止める（§6.5 の fail-closed 条件）。一方、ツールやスキルの一部が使えないだけなら止めず、除外して理由を残す（§6.5 末尾）。どちらも「黙って続行しない」点は同じで、違うのは続行するかどうかだけ。

**出力をスキーマに通している** — `schemas/` と実装は別々に書いたので、片方だけ直すと静かに食い違う。合成した Profile を `runtime-profile.schema.json` に通すテストを置いた。項目名を1つ変えるだけでこのテストが落ちることを実際に確認している。

## テスト

```bash
npm ci          # ルートで1度
npm run build   # tsc -b が core を先に解決する
npm test -w @agent-aiko/binder
```
