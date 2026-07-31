# @agent-aiko/capability-registry

Capability Registry。Capability Manifest を、使える能力と除外に分ける。設計書 [`docs/20260730-aiko-mcp-usage-distribution-maintenance-design.md`](../../docs/20260730-aiko-mcp-usage-distribution-maintenance-design.md) §5.5 / §6.3 に対応する。

設計書が唯一の正本。

## 中身

| モジュール | 役割 | 設計書 |
|---|---|---|
| `capability-registry.ts` | Manifest を検証し、使える能力と除外理由に分ける | §5.5・§6.3 |

`@agent-aiko/core` に依存する（`checkSchemaVersion`）。依存は一方向。

## core から分けた理由

設計書 §9 が別パッケージとして置いている。能力の解決は人格の読み出しとは別の関心事で、人格だけ読みたい利用者が Manifest の検証を引き込む必要はない。

## 設計上の判断

**一部が使えないだけでは止めない。** ツールやスキルが使えないときは、除外して理由を残す（§6.5 末尾）。ただし黙って続行はしない。

**`availability` が不正なら ready に丸めない。** 分からない状態を「使える」と解釈すると、使えないものを使える前提で人格が動く。丸めずに除外する。

**認証情報を含む宣言は拒否する。** §3.3 が「認証情報を扱わない」と定めている。値として認証情報らしきものが入った Manifest は受け取らない。

## テスト

```bash
npm ci          # ルートで1度
npm run build
npm test -w @agent-aiko/capability-registry
```
