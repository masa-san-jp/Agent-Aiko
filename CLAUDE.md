# Agent-Aiko — 開発者ルール

Claude ルールは以下の3層に分離されています。

| 層 | ファイル | GitHub |
|----|---------|--------|
| 配布用 | `template/.claude/CLAUDE.md` | agent-aiko（公開） |
| 開発ログ用 | `dev-docs/CLAUDE.md` | agent-aiko-dev（公開） |
| ローカル専用 | `.claude/rules/dev-workflow.md` | 非公開（.gitignore 済み） |

---

## リポジトリ構成のルール

| ディレクトリ | 用途 | git管理 |
|-------------|------|---------|
| `template/` | 配布物（ユーザーが `.claude/` にコピーする雛形） | ✓ 管理 |
| `scripts/` | インストーラ・ユーティリティ | ✓ 管理 |
| `plugin/` | Claude Code Plugin メタデータ | ✓ 管理 |
| `dev-docs/` | 開発専用ドキュメント（agent-aiko-dev clone 先） | `.gitignore` 済み |
| `images/` | 原典漫画データ | `.gitignore` 済み |

`template/` はユーザーの環境にコピーされる。**開発者固有のパス・ツール・設定を `template/` 内のファイルに書いてはいけない。**

---

## 開発ログの記録（毎セッション必須）

作業の節目、またはセッション終了時に以下を **必ず** 実施します。

1. **`dev-docs/dev-log.jsonl` に追記する**（1 タスク 1 行）
   - `ts` フィールドに `YYYY-MM-DD` 形式の日付プレフィックスは**必須**
   - フォーマット:
     ```json
     {"ts":"YYYY-MM-DD","project":"Agent-Aiko","task":"<タスク名>","status":"completed|in_progress|blocked","summary":"実施内容を1〜2文で","issues":[],"decisions":[]}
     ```
2. **`dev-docs/README.md` を更新する**（ファイルを追加・削除・リネームした場合）
   - README のファイル一覧テーブルを実態に合わせて修正する

`dev-docs/` は `agent-aiko-dev` リポジトリのローカルクローンです。追記後は `dev-docs/` 内で `git commit & push` してください。

---

## template/ を変更するときのチェックリスト

- [ ] `dev-docs/` への参照が含まれていないか
- [ ] 開発者固有のパスが含まれていないか
- [ ] `install.sh` のスタッシュ対象（user-controlled files）と整合しているか
- [ ] 新規ファイルを追加した場合、README のディレクトリ構成図を更新したか
