# slash-router — Telegram 経由のスラッシュコマンド転送

## 規則

Telegram envelope 付きメッセージで本文が `/` で始まる場合、スラッシュコマンドとしてルーティングする。

claude UI 層はターミナル直入力された `/command` のみ処理する。Telegram から届いた `/command` は LLM（Aiko）に**プレーンテキスト**として渡されるだけで、UI のスラッシュ処理は走らない。このルールが架橋を担う。

## パース仕様

入力：`/<skill-name>[ <args>]`

- `<skill-name>` は `:` と `-` を含めて OK（例：`telegram:access`、`aiko-mode`）
- `<args>` は空白区切りの残り部分。空でも OK。

## ルーティング規約（4 カテゴリ）

| カテゴリ | 判定 | アクション |
|---|---|---|
| **A. 通常スキル** | available skills 一覧にマッチ、blocklist 非該当 | `Skill` ツールで invoke、raw 結果を Telegram reply（[raw-output.md](./raw-output.md)に従う） |
| **B. CLI 組み込み** | `cli_builtin` blocklist 該当 | ターミナル必須を案内 |
| **C. security-sensitive** | `security_sensitive` blocklist 該当 | プラグイン policy のためターミナル必須を案内 |
| **D. 未知** | どれにもマッチしない | available skills から近そうな 2〜3 件を提案 |

## blocklist

```
cli_builtin: model, config, help, clear, fast, exit, init, review, security-review, loop, schedule
security_sensitive: telegram:access, telegram:configure
```

## 長時間処理での予告

A カテゴリで invoke するスキルが重い処理（複数ステップ・サブエージェント起動・10 秒以上）に該当する場合、[turn-start-announcement.md](./turn-start-announcement.md) に従って、開始前に短い Telegram reply で「これから〜やる」を予告する。

## エラーハンドリング

- Skill ツール失敗 → エラー要因を Telegram reply で報告
- args パースエラー → 「使い方」を提示
- カテゴリ D → スキル候補を提案、選択待ち

## available skills の取得源

**毎セッション** system reminder で渡される最新のスキル一覧を使う。Aiko 内部に静的キャッシュを持たない（スキルは追加・削除される）。
