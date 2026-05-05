---
name: aiko-migrate-to-shared
description: Migrate this project's `.claude/aiko/` to the shared store `~/.aiko/` so the same Aiko persona can be used by Codex 版. Use when the user types "/aiko-migrate-to-shared", "/aiko-migrate-to-shared --dry-run", or "/aiko-migrate-to-shared --overwrite". Destructive operation — always run dry-run first and explicitly confirm.
---

# /aiko-migrate-to-shared

このプロジェクトの `${PWD}/.claude/aiko/` を共通ストア `~/.aiko/` に移行し、移行後は `${PWD}/.claude/aiko/` を `~/.aiko/` への symlink に置き換えます。Codex 版（`aiko` シェル）と同じ人格データを共有したいユーザー向けの **任意操作** です。

設計仕様書 §9.2 に対応する実装で、本体は `.claude/scripts/migrate-to-shared.sh`（installer 経由でユーザー環境に配布されます）。

## 引数なし — 確認モード（推奨ファーストステップ）

最初は必ず dry-run で何が起きるかを確認します。**実行はせず、ユーザーに以下のコマンドを案内してください**：

```bash
bash .claude/scripts/migrate-to-shared.sh --dry-run
```

実際にスクリプトを実行する前に、ユーザーに以下を必ず確認してください：

- `~/.aiko/` が既に存在するか（存在する場合は `--overwrite` が必要なことを案内）
- 進行中のセッションを閉じたか（symlink 置換中にファイルを開いていると壊れる可能性）
- バックアップ（`${PWD}/.claude/aiko.backup-<timestamp>/` と必要なら `~/.aiko.backup-<timestamp>/`）が作られることを理解しているか

## 引数 `--dry-run`

```bash
bash .claude/scripts/migrate-to-shared.sh --dry-run
```

を案内します。スクリプトが「[dry-run]」プレフィックス付きで実行内容を表示します。

## 引数 `--overwrite`

`~/.aiko/` が既に存在する場合に上書きする際のオプション。既存の `~/.aiko/` は `~/.aiko.backup-<timestamp>/` にバックアップされてから上書きされます。

```bash
bash .claude/scripts/migrate-to-shared.sh --overwrite
```

## それ以外の引数

スクリプトが `--help` を出すので、

```bash
bash .claude/scripts/migrate-to-shared.sh --help
```

の実行を案内してください。

## 実行後の振る舞い

1. `~/.aiko/` に人格データがコピーされる
2. `${PWD}/.claude/aiko.backup-<timestamp>/` に旧データが backup として保持される（不要になったら手動削除）
3. `${PWD}/.claude/aiko/` は `~/.aiko/` への symlink になる
4. 以降は Claude Code 版・Codex 版のどちらから編集しても同じ人格データに反映される

## 注意

- **このスキル自体は破壊的操作を実行しません**。常にユーザーにスクリプト実行を案内する形を取ります。Claude Code 内から bash を直接実行する場合も、必ず dry-run から始めて結果をユーザーに見せ、明示の確認を得てから本実行に進んでください
- スクリプトは冪等性ガードを持ち、`${PWD}/.claude/aiko/` が既に symlink になっている場合は exit 1 で abort します
- 移行後に元に戻したい場合は、symlink を削除して `${PWD}/.claude/aiko.backup-<timestamp>/` を `${PWD}/.claude/aiko/` にリネームしてください
