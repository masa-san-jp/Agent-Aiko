# アーキテクチャ：4 層モデル

このパッケージは **4 層構造**で設計されています。下から順に積み上がります。

---

## 階層構造

```
┌──────────────────────────────────────────────────┐
│  4. ワークフローテンプレート (workflow-templates/) │  ← 業務手順
├──────────────────────────────────────────────────┤
│  3. スキル (skills/)                               │  ← 道具・能力
├──────────────────────────────────────────────────┤
│  2. エージェント (meta-agents/ + 業務 agents/)     │  ← 主体・役割
├──────────────────────────────────────────────────┤
│  1. ルール (rules/ + INVARIANTS)                   │  ← 守るべき規範
└──────────────────────────────────────────────────┘
```

各層は下位の層に依存し、上位の層を制約します。

---

## 1. ルール層（rules/）

**守るべき内容を定義する層**。全エージェント・全スキルが参照します。

| ファイル | 役割 |
|---------|------|
| `coding-style.md` | コードの書き方（イミュータビリティ・ファイル分割等） |
| `git-workflow.md` | コミット形式・PR ワークフロー |
| `testing.md` | テスト戦略・カバレッジ要求 |
| `security.md` | セキュリティ規範（API キー保護等） |
| `patterns.md` | 共通パターン（API レスポンス・Repository 等） |
| `performance.md` | モデル選択・コンテキスト管理 |
| `hooks.md` | Hooks システムの解説と運用 |
| `agents.md` | エージェント連携の方針 |

**配置先**: `~/.claude/rules/` または `<repo>/.claude/rules/`

ルールは「**変更が稀でも全体に効くもの**」を置きます。
組織固有の業務ルールは `Agent-team/spec.json` の `common_principles` に書きます。

---

## 2. エージェント層

### 2-A. メタエージェント（meta-agents/）

**継続的な品質維持を担う 4 役割**。日次で自動起動し、観測 → 提案を行います。

| エージェント | 何を見る | 何を提案する |
|------------|---------|------------|
| **reviewer** | ログ・ルール・スキーマ・データフロー | 標準化のズレ・規約違反 |
| **scout** | 外部のベストプラクティス（ホワイトリスト経由のみ） | 新しいパターンの自チーム適用 |
| **lab** | 内部スキル・ログの繰り返しパターン | 重複処理の統合・新スキル切り出し |
| **janitor** | リポジトリ全体のクラフト | 未使用ファイル・stale な提案・容量超過 |

**配置先**: `Agent-team/.claude/agents/{role}.md`

### 2-B. 業務エージェント（このパッケージには含まれない）

各組織が独自に作る、業務ドメイン担当のエージェントです。
テンプレは `config-templates/CLAUDE.md.template` `config-templates/rules.json.template` を参照。

**配置先**: `Agent-team/agents/{role}/CLAUDE.md`

---

## 3. スキル層（skills/）

**エージェントが使う道具**。複数エージェントから共通利用できます。

このパッケージでは「**多エージェント運用の基盤スキル**」のみ含めています。

| スキル | 用途 |
|--------|------|
| `agent-call` | 別エージェントへの 1 ターン委譲（subprocess） |
| `delegate-suggest` | 自分の専門外を検知して委譲提案 |
| `peer-inbox` | 別ターミナルで動く Claude Code への非同期メッセージ |
| `codex` | ChatGPT サブスクリプション経由の第二意見 |
| `meta` | メタエージェントの手動起動 |
| `run-meta-pending` | 自動起動の検知と消化 |
| `startup` | エージェント起動の標準シーケンス |
| `teardown` | エージェント終了の標準シーケンス |

**配置先**: `Agent-team/agents/.claude/skills/{name}/SKILL.md`

各スキルは `SKILL.md` 内の `description` で TRIGGER / SKIP 条件を明記し、
Claude Code が自然文から起動を判断できるようにします。

---

## 4. ワークフローテンプレート層（workflow-templates/）

**特定の業務シーンで再利用する手順書**。スキルが「いつ・何を実行するか」を内包するのに対し、
テンプレートは「**人が読んで判断する手順**」です。

| テンプレート | 使う場面 |
|------------|---------|
| `peer_review.md` | 別チームへ相互レビューを返すとき |
| `self_review.md` | 週次の自己点検 |
| `idea_refine.md` | 生のアイデアを構造化するとき |
| `context_engineering.md` | コンテキスト管理を意識するとき |
| `planning_and_task_breakdown.md` | 大目標を分解するとき |
| `task_handoff.md` | 別エージェントに引き継ぐとき |

**配置先**: `Agent-team/skills/`

---

## レイヤ間の関係

### 例 1: コードを書くとき

```
タスク: 「ユーザー認証 API を追加」
  ↓
ルール層: security.md → API キー保護必須・入力バリデーション必須
ルール層: testing.md → 80% カバレッジ・TDD 必須
ルール層: coding-style.md → イミュータブル・エラー処理必須
  ↓
エージェント層: planner → 計画立案
エージェント層: tdd-guide → テスト先行で実装
エージェント層: code-reviewer → 完了後レビュー
エージェント層: security-reviewer → コミット前に脆弱性チェック
  ↓
スキル層: agent-call → 別観点が必要なら専門エージェントに委譲
  ↓
テンプレート層: planning_and_task_breakdown → 計画粒度の確認
```

### 例 2: 日次の自動運用

```
SessionStart hook → tools/meta-check.sh
  ↓ 24h 経過したロール検出
.pending/{role} marker 作成
  ↓
スキル層: run-meta-pending → marker 検知
  ↓
エージェント層: reviewer / scout / lab / janitor 並列起動
  ↓
出力先: logs/reviews/YYYY-Www-{role}.jsonl
出力先: rules.json の pending_updates[] （reviewer のみ）
出力先: backlog タスク
出力先: dev-logs.md 週次サマリー
  ↓
オーナー（人間）が pending_updates を承認 → rules.json 反映
```

---

## 設計原則

### G 原則（Governance Principles）

メタエージェントの設計に組み込まれた、運用の健全性を保つ 13 の原則です。

| ID | 原則 | 適用箇所 |
|----|------|---------|
| G1 | 機械検証可能なルーブリックのみ判定 | reviewer / lab |
| G2 | dedup（過去 4 週の同一 finding はスキップ） | 全メタエージェント |
| G3 | 件数・サイズ上限（観測の暴走防止） | 全メタエージェント |
| G4 | atomic write（temp → os.replace） | rules.json / backlog.json 書き込み |
| G6 | stale 管理（古い提案の自動降格） | reviewer の pending_updates |
| G8 | メタログ必須（誰が何時に何をしたか） | 全メタエージェント |
| G11 | ホワイトリスト経由（外部参照の制限） | scout |
| G12 | 削除は提案止まり（物理削除禁止） | janitor |
| G13 | 人間時間ではなくデータ駆動（24h 経過 → pending） | meta-check.sh |

### 削除と外部参照の責務分離

```
janitor: 削除"提案"のみ可。物理削除禁止。
scout:   外部 URL 参照可。リポジトリ書込み禁止。
reviewer: rules.json への変更提案可。スキル新規作成禁止。
lab:     スキル切り出し提案可。rules.json 変更禁止。
```

これにより「単一エージェントが暴走しても被害が局所化される」設計になっています。

### コスト合理性

メタエージェントの自動起動は **SessionStart hook + Claude 内部の Agent ツール**で実現しています。
クラウド cron や外部 scheduler は使いません。これにより：

- インフラコストゼロ
- セッション開始時のみコスト発生（毎日数円程度）
- 人が全く Claude Code を起動しない日は、メタエージェントも走らない（自然な間引き）

---

## 拡張ポイント

このパッケージに、各組織が独自に追加するもの：

1. **業務ドメインエージェント**（`Agent-team/agents/{role}/`）
2. **業務固有スキル**（`Agent-team/agents/{role}/skills/`）
3. **業務固有ルール**（`agents/{role}/rules.json`）
4. **外部システム連携**（MCP サーバー設定等）
5. **インストール可能な他のグローバルエージェント**（必要に応じて）

詳細は `INSTALL.md` のステップ 5 以降を参照。
