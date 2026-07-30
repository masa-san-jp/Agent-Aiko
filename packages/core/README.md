# @agent-aiko/core

Aiko Core。人格を読み出し、ユーザー・能力と合わせて実行環境へ注入する指示文へ合成する。設計書 [`docs/20260730-aiko-mcp-usage-distribution-maintenance-design.md`](../../docs/20260730-aiko-mcp-usage-distribution-maintenance-design.md) §5.1 / §5.2 / §14 Phase 1 に対応する。

設計書が唯一の正本。

## 中身

| モジュール | 役割 | 設計書 |
|---|---|---|
| `persona-repository.ts` | 人格の読み出し口（interface）と解決失敗の例外 | §5.1 |
| `filesystem-persona-repository.ts` | 現行の `~/.aiko/` をそのまま読む実装 | §14 Phase 1 |
| `compiler.ts` | 人格・ユーザー・能力から指示文と hash を合成 | §5.2 |
| `hash.ts` | SHA-256。キー順に依存しないオブジェクトハッシュ | §5.3・§6.5 |

## 現行レイアウトをそのまま読む理由

§14 の移行計画は Phase 1 を「現行ファイルを FileSystemPersonaRepository で読む」と定めている。manifest を持つ形式（`schemas/persona-package.schema.json`）へ移すのは Phase 2 以降。したがってこの実装は manifest を要求せず、既存の `mode` / `active-persona` / `persona/**` のレイアウトを読む。既存の `codex/src/aiko-persona-loader.ts` が扱っているものと同じ配置。

旧フラット型（`persona/aiko-origin.md`・`persona/aiko-override.md`・`persona/overrides/<slug>.md`）も読む。ディレクトリ型を先に探し、無ければ旧型へ落ちる。既存 loader が対応していた配置を落とすと、まだ移行していないインストールが起動時に fail closed するため。名前付き人格は「ディレクトリ型 → 旧型」を使い切ってから既定 override へ落ちる（先に既定を見ると、旧型で置かれた指定人格が既定に食われて別人が立つ）。

読み出し口を interface に切ってあるので、manifest 形式の実装は別クラスとして足せる。呼び出し側は変わらない。

## 設計上の判断

**欠けたまま起動させない** — 人格本文と不変条項が見つからない場合は `PersonaResolutionError` を投げる。§6.5 は「Invariants 欠落」を fail-closed 条件に挙げており、空文字列で続行すると不変条項なしの Aiko が立ち上がる。運用ルールは無い環境があるため必須にしていない。

**不在と失敗を区別する** — ファイルが無い（ENOENT）ときだけ次の候補へ進み、権限エラーなどは握りつぶさずそのまま投げる。全部の失敗を「無かった」に丸めると、読めるはずのものが読めていない事故が見えなくなる。

**合成の並びは既存実装を引き継いだ** — 不変条項 → 人格 → 運用ルール → ユーザー、の順序は `codex/src/aiko-prompt-builder.ts` が実際に人格を立てている並び。作り直す理由がない。

**矛盾時の優先順位は §6.4 の並びを崩さない** — ここで注入する範囲だけを抜き出しているが、ユーザーのプライバシー方針が運用ルールより上、という §6.4 の順序は変えない。テストで順序を検証している。

**hash はキー順に依存しない** — `JSON.stringify` をそのまま使うとキーの並びで結果が変わる。同じ入力から必ず同じ hash が出ないと、§6.5 の hash 検証も §16 の追跡も成立しない。

## テスト

```bash
cd packages/core
npm ci
npm run typecheck
npm test
```

ファイルを読む部分は一時ディレクトリに `~/.aiko/` 相当を作って検証している。mock で置き換えると「ファイルが無いときにどう振る舞うか」という、この実装が最も間違えやすい部分を確かめられなくなるため。
