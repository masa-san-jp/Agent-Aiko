# Visibility — Agent-Aiko

このリポジトリにおける **「公開（GitHub に同期）」** と **「非公開（ローカル限定）」** の境界を明示する仕様書です。`.gitignore` はこの仕様の実装であり、両者が乖離していたら `.gitignore` 側を修正してください。

リポジトリ：`https://github.com/masa-san-jp/Agent-Aiko`

---

## 公開対象（GitHub に同期される）

### 配布対象

- `claude-code/template/` — Claude Code 版配布物（ユーザー環境にコピーされる雛形）
- `claude-code/scripts/` — Claude Code 版 installer 実体
- `claude-code/plugin/` — Claude Code Plugin メタデータ
- `codex/` — Codex 版実装
- `scripts/install.sh` — 旧 URL 維持用の互換ラッパー

### 開発資材（公開）

- `.claude/skills/` — 開発用スキル（dev-log, dev-check 等）
- `.claude/hooks/` — 開発用 git hook（template-check 等）
- `.claude/settings.json` — 共有設定

### ルートドキュメント

- `CLAUDE.md` `README.md` `VISIBILITY.md`（このファイル）`logo.svg` `.gitignore`

### テスト・ドキュメント

- `codex/test/` — Codex 版テスト資材（実装と同居）
- `docs/` — 配布対象ドキュメント

---

## 非公開対象（gitignore で除外）

### 開発者ローカル専用

- `.claude/rules/` — 開発者ローカル運用ルール（dev-workflow.md 等）
- `.claude/settings.local.json` — 端末固有の許可・設定

### コンテンツ素材

- `images/` — 原典漫画データ（別途管理）

### Aiko ランタイム実データ

- `**/session-state/auto.jsonl` — 自動セッションログ
- `**/session-state/current.md` — 手動セッションスナップショット

雛形（`session-state/current.md.example`）はコミット対象。実データはコミットしない。

### 同名ネスト clone の予防

- `/Agent-Aiko/` — 本リポを誤って自身配下に clone した場合の予防
- `/Agent-Aiko-dev/` — 兄弟リポを誤って本リポ配下に clone した場合の予防（正しい配置は `../Agent-Aiko-dev/`）
- `/dev-docs/` — 旧 dev-docs ネスト構造の再混入予防（`../Agent-Aiko-dev/` へ分離済み）

---

## 配布物（template/）への混入禁止

`claude-code/template/` はユーザー環境にコピーされる配布物です。次は **絶対に含めない**：

- 開発者専用リポへのパス参照（`dev-docs/` `Agent-Aiko-dev/`）
- 開発者固有のツール・ファイルパス
- 本リポジトリ専用の設定

`.claude/hooks/template-check.sh` が `git push` 時に自動チェックします。URL 内の参照（公開アセット URL 等）は許容されます。

---

## 関連リポジトリ（兄弟・別リポ）

| リポ | ローカル配置 | 用途 |
|------|-------------|------|
| `Agent-Aiko-dev` | `../Agent-Aiko-dev/`（兄弟） | 開発ログ（議事録・設計メモ・dev-log.jsonl） |
| `Agent-Workplace` | 別ロケーション | 業務エージェント運用環境 |

`Agent-Aiko-dev` は **本リポジトリ内に配置しない**。`Agent-Aiko/` の親ディレクトリに兄弟として clone してください：

```bash
git clone https://github.com/masa-san-jp/Agent-Aiko
git clone https://github.com/masa-san-jp/Agent-Aiko-dev
```

---

## 境界の判断基準

新しいファイル・ディレクトリを足すときは次で判断：

| 質問 | Yes → 公開 | Yes → 非公開 |
|------|-----------|-------------|
| ユーザー環境にコピーされる配布物か？ | ✓ | |
| 配布物の installer・plugin・docs か？ | ✓ | |
| 開発者ローカルの設定・ルールか？ | | ✓ |
| 個別セッションのランタイム実データか？ | | ✓ |
| 著作物・原典素材か？ | | ✓ |

迷う場合は **非公開側（gitignore に追加）** を選び、後から公開へ昇格する方が安全。

---

## 検証

`.gitignore` と本仕様の整合は、`/dev-check` スキルおよび `template-check.sh` hook で確認できます：

```bash
# 配布物の汚染チェック
bash .claude/hooks/template-check.sh

# 非公開対象が誤って tracked になっていないか
git ls-files .claude/rules/ images/ 2>/dev/null
```

仕様変更時は **本ファイルと `.gitignore` を一緒に更新**してください。
