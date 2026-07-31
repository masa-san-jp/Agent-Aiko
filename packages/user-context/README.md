# @agent-aiko/user-context

User Context Provider。User Profile から、下流が使う最小情報だけを取り出す。設計書 [`docs/20260730-aiko-mcp-usage-distribution-maintenance-design.md`](../../docs/20260730-aiko-mcp-usage-distribution-maintenance-design.md) §5.4 / §6.2 に対応する。

設計書が唯一の正本。

## 中身

| モジュール | 役割 | 設計書 |
|---|---|---|
| `user-context-provider.ts` | User Profile を検証し、Compiler が使う最小情報だけを返す | §5.4・§6.2 |
| `user-profile-path.ts` | User Profile の既定の置き場を決める | §4.4 |

`@agent-aiko/core` に依存する（`checkSchemaVersion` と `UserContext` 型）。依存は一方向で、core は本パッケージを知らない。

## core から分けた理由

設計書 §9 が別パッケージとして置いている。Phase 2 では実装を通すために core の中に置いたが、そのままだと「人格を読む」ことと「利用者が誰かを解決する」ことが同じ塊になる。人格だけ読みたい利用者が、User Profile の検証まで引き込む必要はない。

## 設計上の判断

**渡された最小情報しか下流へ流さない。** User Profile 全体を Compiler へ渡さない。§5.4 が「最小情報」と定めており、`privacy` と `memory_namespace` は指示文に載せるものではないため `UserContext` に含めない。

**知らない値は黙って捨てず拒否する。** `verbosity` や `directness` に未知の値が入っていたら、既定へ丸めずに例外にする。丸めると、設定したつもりのものが別の値で動く。

**置き場の決め方をここに置く。** `aiko configure` が書き、MCP サーバーと各 Adapter が読む。決め方が散ると「作ったのに読まれない」が起きる。

## テスト

```bash
npm ci          # ルートで1度
npm run build
npm test -w @agent-aiko/user-context
```
