# @agent-aiko/cli

`aiko` コマンド。設計書 [`docs/20260730-aiko-mcp-usage-distribution-maintenance-design.md`](../../docs/20260730-aiko-mcp-usage-distribution-maintenance-design.md) §4.4 に対応する。

設計書が唯一の正本。

## 使える

```bash
aiko status        # いま何が読めていて、何が起動できるか
aiko doctor        # 構成を点検する
aiko doctor --fix  # 見つかったもののうち、直し方が分かっているものを直す
```

## まだ無い

`install` / `uninstall` / `update` / `rollback` / `configure`。前の4つは配布（§15 Phase 5）に属し、`configure` は User Profile の対話設定で未着手。

**黙って何もしないのではなく、理由を返して終了コード 2 を返す。** 「打ったのに何も起きない」を作らないため。

## 終了コード

| コード | 意味 |
|---|---|
| 0 | 問題なし（`doctor` では warn を含む） |
| 1 | 起動できない状態（`status` の Binding failed、`doctor` の FAIL） |
| 2 | コマンドの使い方が違う（未実装・未知のコマンド） |

`status` が Binding failed のときに 0 を返さないのは、スクリプトから見て正常と区別できなくなるため。

## 見る場所

MCP サーバー（`packages/mcp-server/src/server.ts`）と**同じ環境変数を同じ既定で読む**。

| 変数 | 既定 |
|---|---|
| `AIKO_HOME` | `~/.aiko` |
| `AIKO_USER_PROFILE` | 未設定（`user_id: default` で解決） |
| `AIKO_PERSONA_ID` | `aiko` |

ここがサーバーとずれると、`aiko doctor` が「問題なし」と言った構成でサーバーが起動に失敗する、という最悪の食い違いが起きる。揃えてあるのはそのため。

## 設計上の判断

**診断は直さない。** `doctor` は見て報告するだけで、`--fix` を明示的に付けたときだけ書き換える。勝手に直すと、何が壊れていたのかが残らない。

**検査する注入手段は Adapter の既定を使う。** `DEFAULT_INJECTION` を `@agent-aiko/adapter-claude-code` から取っている。ここを自前で書くと、Adapter が既定を変えたときに `doctor` だけ古い経路を検査し続け、「点検は通るのに起動しない」が起きる。

**権限の不足は warn で fail ではない。** 緩いだけなら Aiko は動く。動作不能ではないものを FAIL にすると、本当に起動できないときと区別が付かなくなる。ただし放置してよいものでもないので `--fix` の対象にしてある。

**色を付けない。** CI のログやリダイレクト先で読めなくなるより、どこでも同じに見えるほうを取る。

## テスト

```bash
npm ci          # ルートで1度
npm run build
npm test -w @agent-aiko/cli
```

権限の検査は、一時ディレクトリに実際にモードを設定して実際に読み直している。ここを mock にすると「仕様には書いてあるが実際は設定されていない」という、まさに検出したい種類のずれを見逃す。
