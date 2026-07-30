# @agent-aiko/adapter-codex

Codex 向け Runtime Adapter。設計書 [`docs/20260730-aiko-mcp-usage-distribution-maintenance-design.md`](../../docs/20260730-aiko-mcp-usage-distribution-maintenance-design.md) §8.2 / §15 Phase 4 に対応する。

設計書が唯一の正本。

## 使い方

```bash
node packages/adapter-codex/dist/cli.js > base-instructions.txt
```

標準出力は `thread/start` の `baseInstructions` に渡す文字列だけ。人格の版と `profile_id` は標準エラーへ出す。

| 環境変数 | 既定 | 意味 |
|---|---|---|
| `AIKO_HOME` | `~/.aiko` | 人格ファイルの場所 |
| `AIKO_PERSONA_ID` | `aiko` | 読み込む人格の識別子 |
| `AIKO_USER_PROFILE` | なし | User Profile（JSON）のパス |

## なぜ `baseInstructions` なのか

Codex は `thread/start` で渡した `baseInstructions` をスレッド存続中固定し、ターン単位で上書きできない。Level 2（§2.1）が求める「起動前に入れて途中で外せない」をそのまま満たす。既存 `codex/src/aiko-prompt-builder.ts` が実現している方式で、本 Adapter はその組み立てを Core へ移したもの。

## 設計上の判断

**ファイルを書かない** — Claude Code 側は `--system-prompt-file` のためディスクへ落とす必要があるが、Codex は文字列を受け取る。呼び方などの利用者情報を書き出さずに済むなら、書き出さないほうが安全（§11.2）。

**合成できなければ文字列を作らない** — §3.4 の Fail Closed。人格を解決できない・不変条項が空、といった場合に例外で止める。部分的に返すと、呼び出し側が人格なしでスレッドを開始できてしまう。

**標準出力を `baseInstructions` 専用にする** — 空でない出力があること自体が「人格を合成できた」の合図になる。診断は標準エラーへ。

**既存のシェルを置き換えない** — §8.2 は「既存 Codex Runtime を段階統合」と定めている。この CLI は人格文字列を出すところまでで、対話シェル本体は既存 `codex/` が持ったまま。接続を段階的に進められる。

## 動作確認

```
$ AIKO_HOME=<人格ファイルを置いた一時ディレクトリ> node dist/cli.js
aiko-codex: persona aiko@0.0.0 profile 8488054489a7b3a1
あなたは AI エージェント「アイコ」です。

# 不変条項（常に最優先で遵守）
取り繕わない。
...

$ rm <一時ディレクトリ>/INVARIANTS.md && AIKO_HOME=... node dist/cli.js
aiko-codex: 人格を合成できなかったため Codex スレッドを開始しません: ...
exit=2
```

不変条項を取り除くと標準出力には何も出ず、終了コード 2 で止まることを実行で確認している。

## テスト

```bash
cd packages/adapter-codex
npm ci
npm run typecheck
npm test
```

Codex 本体とは通信しない。検証するのは「何を渡そうとしたか」——`baseInstructions` の中身、注入手段、不変条項の位置、そして合成できないときに文字列を作らないこと。

## この段階で入れていないもの

- **既存 `codex/src` の Core への接続** — `aiko-persona-loader.ts` / `aiko-prompt-builder.ts` を Core 経由に差し替える作業。既存の動いているシェルに手を入れるため、別増分にする（§14 Phase 4）
- **Capability Manifest 化と sandbox / approval policy の反映**（§8.2 の残り）— Permission Manifest を扱う段に属する
