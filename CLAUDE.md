# Agent-Aiko — 開発者ルール

Claude ルールは以下の3層に分離されています。**この分離は絶対に守ること。**

| 層 | ファイル | GitHub |
|----|---------|--------|
| 配布用 | `claude-code/template/.claude/CLAUDE.md` | agent-aiko（公開） |
| 開発ログ用 | `../Agent-Aiko-dev/CLAUDE.md` | agent-aiko-dev（公開、兄弟リポ） |
| ローカル専用 | `.claude/rules/dev-workflow.md` | 非公開（.gitignore 済み） |

---

## スキル一覧

| コマンド | 場所 | 用途 |
|---------|------|------|
| `/dev-log` | `.claude/skills/dev-log/SKILL.md` | dev-log.jsonl に作業ログを追記 |
| `/dev-check` | `.claude/skills/dev-check/SKILL.md` | コミット前に三層分離の整合性を検証 |

---

## 絶対ルール（MUST）

### 1. claude-code/template/ への混入禁止

`claude-code/template/` はユーザー環境にコピーされる配布物です。以下を **絶対に含めてはいけない**：

- `dev-docs/` または `Agent-Aiko-dev` への **ローカルパス参照**（`../Agent-Aiko-dev/` `dev-docs/foo.md` 等）
- 開発者固有のツール・ファイルパス
- 本リポジトリ専用の設定

**許容される参照**: **`https?://` の公開アセット URL のみ**（例：`https://github.com/.../Agent-Aiko-dev/...`）。配布先のユーザーがブラウザで開けるリンクであり、ローカルパス依存ではないため許容します。`file://` 等のローカル依存 URL は許容しません。`template-check.sh` は各行から `https?://` URL を一旦除去した上で `dev-docs` / `Agent-Aiko-dev` が残るかを再判定するため、URL とローカルパスが同じ行に混在していてもローカル参照は確実に検出されます。境界の正本は `VISIBILITY.md` を参照してください。

**自動チェック**: `git push` 時に `.claude/hooks/template-check.sh` が自動実行され、違反があればブロックされます。

### 2. dev-log.jsonl の更新（毎セッション必須）

セッション終了前に `/dev-log` スキルで `../Agent-Aiko-dev/dev-log.jsonl` へ追記すること。

- `ts` フィールドの **日付プレフィックス（`YYYY-MM-DD`）は必須**
- 1タスク1行、追記後は `../Agent-Aiko-dev/` 内で `git commit & push`

### 3. Agent-Aiko-dev/README.md の更新

`../Agent-Aiko-dev/` でファイルを追加・削除・リネームしたら、`../Agent-Aiko-dev/README.md` のファイル一覧テーブルを必ず更新すること。

### 4. コミット先の確認

| 変更対象 | コミット先リポジトリ |
|---------|------------------|
| `claude-code/`, `scripts/install.sh`（互換ラッパー）, `CLAUDE.md`, `README.md`, `.claude/`, `codex/`（実装後） | agent-aiko |
| `../Agent-Aiko-dev/` 以下（兄弟リポ） | agent-aiko-dev |

コミット前に必ず `/dev-check` を実行すること。

---

## リポジトリ構成

| ディレクトリ | 用途 | git管理 |
|-------------|------|---------|
| `claude-code/template/` | Claude Code 版配布物 | ✓ agent-aiko |
| `claude-code/scripts/` | Claude Code 版 installer 実体 | ✓ agent-aiko |
| `claude-code/plugin/` | Claude Code Plugin メタデータ | ✓ agent-aiko |
| `scripts/install.sh` | 旧 URL 維持用の互換ラッパー（実体は `claude-code/scripts/install.sh` を呼ぶ） | ✓ agent-aiko |
| `codex/` | Codex 版実装（Phase 1 以降で追加予定） | ✓ agent-aiko |
| `.claude/skills/` | 開発用スキル | ✓ agent-aiko |
| `.claude/hooks/` | 開発用フック | ✓ agent-aiko |
| `.claude/rules/` | ローカル専用ルール | gitignore |
| `images/` | 原典漫画データ | gitignore |

**兄弟リポジトリ**

| ディレクトリ | 用途 | git管理 |
|-------------|------|---------|
| `../Agent-Aiko-dev/` | 開発ログ（agent-aiko-dev リポ、本リポと並置） | 別リポ（本 .gitignore の対象外） |

---

## claude-code/template/ 変更チェックリスト

- [ ] `dev-docs` または `Agent-Aiko-dev` への参照が含まれていないか
- [ ] 開発者固有のパスが含まれていないか
- [ ] `claude-code/scripts/install.sh` のスタッシュ対象と整合しているか
- [ ] README のディレクトリ構成図を更新したか
- [ ] `/dev-check` でチェック済みか
