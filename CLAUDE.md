# Agent-Aiko — 開発者ルール

Claude ルールは以下の3層に分離されています。**この分離は絶対に守ること。**

| 層 | ファイル | GitHub |
|----|---------|--------|
| 配布用 | `template/.claude/CLAUDE.md` | agent-aiko（公開） |
| 開発ログ用 | `dev-docs/CLAUDE.md` | agent-aiko-dev（公開） |
| ローカル専用 | `.claude/rules/dev-workflow.md` | 非公開（.gitignore 済み） |

---

## スキル一覧

| コマンド | 場所 | 用途 |
|---------|------|------|
| `/dev-log` | `.claude/skills/dev-log/SKILL.md` | dev-log.jsonl に作業ログを追記 |
| `/dev-check` | `.claude/skills/dev-check/SKILL.md` | コミット前に三層分離の整合性を検証 |

---

## 絶対ルール（MUST）

### 1. template/ への混入禁止

`template/` はユーザー環境にコピーされる配布物です。以下を **絶対に含めてはいけない**：

- `dev-docs/` へのパス参照
- 開発者固有のツール・ファイルパス
- 本リポジトリ専用の設定

**自動チェック**: `git push` 時に `.claude/hooks/template-check.sh` が自動実行され、違反があればブロックされます。

### 2. dev-log.jsonl の更新（毎セッション必須）

セッション終了前に `/dev-log` スキルで `dev-docs/dev-log.jsonl` へ追記すること。

- `ts` フィールドの **日付プレフィックス（`YYYY-MM-DD`）は必須**
- 1タスク1行、追記後は `dev-docs/` 内で `git commit & push`

### 3. dev-docs/README.md の更新

`dev-docs/` でファイルを追加・削除・リネームしたら、`dev-docs/README.md` のファイル一覧テーブルを必ず更新すること。

### 4. コミット先の確認

| 変更対象 | コミット先リポジトリ |
|---------|------------------|
| `template/`, `scripts/`, `plugin/`, `CLAUDE.md`, `README.md`, `.claude/` | agent-aiko |
| `dev-docs/` 以下 | agent-aiko-dev |

コミット前に必ず `/dev-check` を実行すること。

---

## リポジトリ構成

| ディレクトリ | 用途 | git管理 |
|-------------|------|---------|
| `template/` | 配布物 | ✓ agent-aiko |
| `scripts/` | インストーラ | ✓ agent-aiko |
| `plugin/` | Plugin メタデータ | ✓ agent-aiko |
| `.claude/skills/` | 開発用スキル | ✓ agent-aiko |
| `.claude/hooks/` | 開発用フック | ✓ agent-aiko |
| `.claude/rules/` | ローカル専用ルール | gitignore |
| `dev-docs/` | 開発ログ（agent-aiko-dev clone 先） | gitignore |
| `images/` | 原典漫画データ | gitignore |

---

## template/ 変更チェックリスト

- [ ] `dev-docs/` への参照が含まれていないか
- [ ] 開発者固有のパスが含まれていないか
- [ ] `install.sh` のスタッシュ対象と整合しているか
- [ ] README のディレクトリ構成図を更新したか
- [ ] `/dev-check` でチェック済みか
