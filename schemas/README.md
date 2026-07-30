# Aiko-MCP スキーマ

設計書 [`docs/20260730-aiko-mcp-usage-distribution-maintenance-design.md`](../docs/20260730-aiko-mcp-usage-distribution-maintenance-design.md) §6 / §7 に対応する JSON Schema（draft 2020-12）。Phase 0「仕様固定」の成果物のうち、スキーマ部分。

設計書が唯一の正本。ここは設計書の記述を機械が検証できる形にしたものであり、設計判断そのものを書き足す場所ではない。

## 6本の内容

| ファイル | 何を表すか | 設計書 |
|---|---|---|
| `persona-package.schema.json` | Aiko が何者か。配布単位 | §5.1・§3.2 |
| `user-profile.schema.json` | Aiko と特定ユーザーの関係 | §6.2 |
| `capability-manifest.schema.json` | 実行環境で使える能力の目録 | §6.3・§5.5・§3.3 |
| `permission-manifest.schema.json` | 実行環境が課す権限・承認境界 | §8.2・§6.4 |
| `binding-request.schema.json` | Binder への入力 | §6.1 |
| `runtime-profile.schema.json` | Binder が合成した実行時の結果 | §5.3・§7.2 |

## テスト

```bash
cd schemas
npm ci
npm test
```

一番大事な性質は「設計書に載っている例がそのまま通ること」。§6.1・§6.2・§6.3・§3.3 の例を実データとして検証しており、スキーマが設計書から離れると失敗する。加えて、通ってはいけないものが弾かれることも確かめている（通る例だけのテストは、制約を全部外しても通るため意味がない）。

弾かれることを確認している主なもの:

- 認証情報の値を含む Capability Manifest（§3.3・§11.2）
- `invariants` を欠いた Persona Package（§6.5 の fail-closed 条件）
- 形式不正な SHA-256、SemVer でない version
- 相対パスの `project_root` / `writable_paths`
- 綴り違いの項目（`additionalProperties: false` で黙って無視しない）
- §8.5 で実測していない注入手段を名乗る Runtime Profile
- 適合レベル 0..2 の範囲外（§2.1）

## 設計上の判断

**`additionalProperties: false` を既定にした** — 綴り違いを黙って受理すると、設定したつもりの項目が効いていない状態になる。Fail Closed（§3.4）の思想に合わせ、知らない項目は弾く。

**既定値を安全側に置いた** — `privacy.*` と `network.outbound` は、明示的に許可しない限り外へ出さない側を既定とした（§3.4・§11.2）。

**`format` キーワードを使っていない** — ajv で `format` を検証するには追加パッケージが必要になる。日時は `pattern` で検証している。`codex/` が依存ゼロで運用されている慣習に合わせ、依存は検証用の ajv 1本だけに留めた。

**`injection_method` を列挙型にした** — §8.5 で実際に動かして確認した手段だけを値として許す。未検証の手段を Profile が名乗れないようにするための制約であり、Antigravity CLI の手段が判明した時点で追加する（#45）。

## 未確定事項（マサさんの判断が必要）

Phase 0 は「Schema・一貫性レベル・互換性方針・Threat Model の確定」と定義されている（§15）。このうちスキーマと一貫性レベルは設計書から起こせたが、以下は設計書に記述がなく、判断を仰ぐ必要がある。

1. **人格本文の持ち方** — `persona-package` は本文をパッケージ内の相対パス＋SHA-256 への参照として持つ形にした。マニフェストに本文を直接埋め込む案もある。参照方式にすると本文を別ファイルとして人が読めるまま配布できる一方、ファイル数が増える。
2. **`permission-manifest` の共通形式** — 設計書は Codex の sandbox / approval policy を反映するとだけ述べている。ここでは Codex の語彙（`read-only` / `workspace-write` / `danger-full-access`）を共通語彙として採用したが、Claude Code の permission mode との対応付けは決めていない。
3. **`runtime-profile` が本文を持つか** — 現状は `instructions` として本文を持たせている（0600 のローカルファイル前提・§11.3）。参照だけを持たせる案もある。
4. ~~**互換性方針**~~ — **決定済み（マサさん確定 2026-07-30）**。受理するのは「現行版とその1つ前」まで。設計書 §10.3.1 に記載し、判定は `packages/core/src/schema-compatibility.ts` が持つ。
5. **Threat Model** — 未着手。§11.4 が SHA-256・署名・SBOM を挙げているが、何を脅威と見なすかの明文化がない。Phase 5（配布・署名）までに用意する。

1〜3 は暫定のまま Phase 2 を進められる。5 が要るのは Phase 5。

当初この README は「4 と 5 は Phase 1 に入る前に決める必要がある」と書いていたが、実際には Phase 1（Aiko Core）は両方なしで実装できた。見積もりが厳しすぎたので訂正した。
