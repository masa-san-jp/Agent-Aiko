# @agent-aiko/adapter-claude-code

Claude Code 向け Runtime Adapter。設計書 [`docs/20260730-aiko-mcp-usage-distribution-maintenance-design.md`](../../docs/20260730-aiko-mcp-usage-distribution-maintenance-design.md) §8.1 / §15 Phase 4 に対応する。

設計書が唯一の正本。

## 使い方

```bash
node packages/adapter-claude-code/dist/cli.js [claude に渡す引数...]
```

追加の引数はそのまま `claude` へ渡る。Adapter は人格の注入に必要な引数だけを足す。

| 環境変数 | 既定 | 意味 |
|---|---|---|
| `AIKO_HOME` | `~/.aiko` | 人格ファイルの場所 |
| `AIKO_PERSONA_ID` | `aiko` | 読み込む人格の識別子 |
| `AIKO_USER_PROFILE` | なし | User Profile（JSON）のパス |
| `AIKO_STATE_DIR` | `$XDG_RUNTIME_DIR/aiko-claude-code` | 指示文の書き出し先 |
| `AIKO_APPEND` | なし | `1` で既定の人格指示を置き換えず後ろに足す |
| `AIKO_CLAUDE_BIN` | `claude` | 起動する実行ファイル |

## やっていること

1. 人格・ユーザー・能力を Binder で合成する
2. 合成した指示文を `0600` のファイルへ書く
3. `claude --system-prompt-file <path>` として起動する

`--system-prompt-file` は §8.5 で実測確認した手段。`--setting-sources ''` を指定して `CLAUDE.md` も settings も読まない状態でも、この引数だけで人格（一人称・応答プレフィックス）が適用されることを確認している。

## 設計上の判断

**`CLAUDE.md` に触らない** — §8.1 が「既存 `CLAUDE.md` を上書きしない」と定めている。加えて、ファイルを書き換えずに済む手段があるなら、そもそも触る理由がない。管理ブロックを差し込む方式は、利用者のファイルを壊す余地が残る。

**合成できなければ起動しない** — §3.4 の Fail Closed。人格を解決できない・不変条項が空、といった場合に例外で止め、起動用の引数を返さない。部分的な結果を返すと、呼び出し側が「とりあえず起動」できてしまう。人格が無いまま立ち上がった Claude Code は Aiko ではない。

**指示文は `0600` で書く** — §11.3 が Runtime Profile を `0600` と定めている。指示文には呼称などの利用者情報が入るため、他ユーザーから読めてはいけない。`mkdir` / `writeFile` の `mode` は umask に削られるので、書いた後に明示的に締め直している。

**ファイル名は `profile_id`** — 同じ合成結果は同じファイルに落ち、人格が変われば別のファイルになる。どの版で起動したかが後から辿れる（§16）。

**「引数を作る」と「起動する」を分けた** — `prepareLaunch()` は `claude` を起動しない。分けておくと、起動せずに引数と書き出し内容を検証できる。テストで実際に `claude` を起動すると課金が発生し、CI では再現もできない。

**stdout に書かない** — stdout は `claude` のもの。どの版の人格で起動したかは stderr に出す。

## テスト

```bash
cd packages/adapter-claude-code
npm ci
npm run typecheck
npm test
```

検証しているのは「どう起動しようとしたか」— 引数、書き出したファイルの中身と権限、そして合成できないときに引数を作らないこと。

実際に `claude` を起動する経路は、開発時に手元で1度確認した（人格ファイルを置いた一時ディレクトリを `AIKO_HOME` に指定し、`--setting-sources ''` で他の設定を排除した状態で、応答に指定どおりのプレフィックスと一人称が現れることを確認）。CI では課金と再現性の理由から行わない。

## この段階で入れていないもの

§8.1 の残り2点。

- **旧 `.claude/aiko/` の移行** — §14 の `aiko migrate` に属する。CLI（`packages/cli`）が未実装のため、移行の入口ごと後段に置く
- **コンテキスト圧縮後の人格再適用** — 圧縮の検知手段が Claude Code 側にあるかを確認できていない。手段の確認前に実装すると、動かないものを設計に載せることになる（§8.5 で同じ轍を踏まないと決めた）
