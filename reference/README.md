# Claude Code Multi-Agent Operations Pack

組織で Claude Code を複数メンバー × 複数エージェントで運用するための、**設計思想 + 実装例**のパッケージです。
個別の業務ドメインに依存しない「**運用基盤**」だけを抽出してあります。

このパッケージは 2 つの顔を持ちます：

1. **仕様書として**：受け取った組織が **自前で構築する際の設計判断材料**
   → `ARCHITECTURE.md`（構造）と `DESIGN-PHILOSOPHY.md`（なぜそう組んだか）が中核
2. **実装例として**：そのまま動く Bash + Python の参考実装
   → `INSTALL.md` の手順で導入可能。部分採用も可

すべてを採用する必要はなく、組織の規模・既存資産・優先課題に応じて取捨選択してください。
採用判断のチートシートは `DESIGN-PHILOSOPHY.md` § 11 参照。

---

## このパッケージで何ができるか

1. **コーディング規約・セキュリティ・テスト方針の標準化**
   全メンバーの Claude Code に同じ基準を適用できます。

2. **継続的な品質維持の自動化**
   4 種類のメタエージェント（**Reviewer / Scout / Lab / Janitor**）が、日次でリポジトリを分析し、
   標準化のズレ・外部ベストプラクティス・スキル横展開機会・クラフト（不要物）を検出します。
   削除実行はせず、すべて提案として提示するため、人の承認を維持できます。

3. **複数エージェント・複数ターミナル間の協調**
   - `agent-call`: 別エージェントへの 1 ターン委譲
   - `delegate-suggest`: 自分の専門外を検知して委譲を提案
   - `peer-inbox`: 別ターミナルで動く Claude Code セッションへ非同期メッセージ送信
   - `codex`: ChatGPT サブスクリプション経由の第二意見・並列調査

4. **セッション運用の標準化**
   `startup` / `teardown` / `log-push` / `sync` / `agent-map` で、全メンバーが同じリズムで作業できます。

5. **作業フロー・抽出・プレビューの補助スキル（任意採用）**
   `strategic-breakdown`（目的分解）/ `task`（残タスク管理）/ `pr-review-merge` / `pre-send-check-3point` / `dir-entry` の作業フロー、
   `extract-text` / `gslides-read`（ドキュメント抽出）、`live-preview` / `tailnet-expose`（別端末プレビュー）。
   必要なものだけ取り込めます（`role` / `routine` 等を含む一覧は `skills/README.md` 参照）。

---

## 含まれていないもの（意図的）

- **業務ドメインエージェント**（例：CFO・営業・人事など）
  これらは各組織が自分たちのドメインで独自に作るべきです。テンプレ（`config-templates/`）は提供しています。

- **個人の人格システム**
  キャラクター人格やモード切替は組織展開のスコープ外です。

- **個別の外部システム連携**（Google Workspace MCP / freee API / 個別 SaaS 等）
  別途、各組織のニーズに合わせて構築してください。

---

## ディレクトリ構成

```
reference/
├── README.md                   ← 入口（このファイル）
├── ARCHITECTURE.md             ← 4 層モデル（ルール → エージェント → スキル → テンプレート）
├── INSTALL.md                  ← Claude Code への導入指示書（コピペで使える）
│
├── rules/                      ← Tier 1: グローバル規約（8 個）
│   ├── coding-style.md
│   ├── git-workflow.md
│   ├── testing.md
│   ├── security.md
│   ├── patterns.md
│   ├── performance.md
│   ├── hooks.md
│   └── agents.md
│
├── meta-agents/                ← 4 メタエージェント定義
│   ├── README.md               ← 設計思想・役割分担
│   ├── reviewer.md
│   ├── scout.md
│   ├── lab.md
│   └── janitor.md
│
├── skills/                     ← 多エージェント運用スキル（任意採用・全 22）
│   ├── README.md               ← カテゴリ別インデックス
│   ├── agent-call/SKILL.md         │ 委譲・協調
│   ├── delegate-suggest/SKILL.md   │
│   ├── peer-inbox/SKILL.md         │
│   ├── codex/SKILL.md              │
│   ├── role/SKILL.md               │
│   ├── meta/SKILL.md               │ メタ運用
│   ├── run-meta-pending/SKILL.md   │
│   ├── routine/SKILL.md            │
│   ├── startup/SKILL.md            │ セッション・ライフサイクル
│   ├── teardown/SKILL.md           │
│   ├── log-push/SKILL.md           │
│   ├── sync/SKILL.md               │
│   ├── agent-map/SKILL.md          │
│   ├── strategic-breakdown/SKILL.md│ 思考・作業フロー
│   ├── pr-review-merge/SKILL.md    │
│   ├── pre-send-check-3point/SKILL.md │
│   ├── task/SKILL.md               │
│   ├── dir-entry/SKILL.md          │
│   ├── extract-text/SKILL.md       │ コンテンツ抽出
│   ├── gslides-read/SKILL.md       │
│   ├── live-preview/SKILL.md       │ プレビュー・共有
│   └── tailnet-expose/SKILL.md     │
│
├── workflow-templates/         ← 業務テンプレート
│   ├── README.md
│   ├── peer_review.md
│   ├── self_review.md
│   ├── idea_refine.md
│   ├── context_engineering.md
│   ├── planning_and_task_breakdown.md
│   └── task_handoff.md
│
├── config-templates/           ← 各組織がカスタマイズして使うテンプレ
│   ├── AGENTS.md.template
│   ├── spec.json.template
│   ├── rules.json.template     ← per-agent
│   └── CLAUDE.md.template      ← per-agent
│
└── tools/                      ← 実装スクリプト
    ├── README.md
    └── meta-check.sh           ← SessionStart hook 用
```

---

## クイックスタート

### A. 最速で導入したい場合

`INSTALL.md` を Claude Code に渡して、「この手順に従って `.claude/` 配下にセットアップして」と頼んでください。
受け取った Claude Code が、必要な配置とパス書き換えを実行します。

### B. 自分で構造を理解したうえで導入したい場合

1. `ARCHITECTURE.md` を読んで 4 層モデルを把握
2. `rules/` をリポジトリの `.claude/rules/` にコピー
3. `meta-agents/` をリポジトリの `Agent-team/.claude/agents/` にコピー
4. `skills/` をリポジトリの `Agent-team/agents/.claude/skills/` にコピー
5. `config-templates/` を見ながら自組織用の `AGENTS.md` `spec.json` を作成
6. `tools/meta-check.sh` を SessionStart hook に登録

詳細は `INSTALL.md` 参照。

---

## 抽象化されたプレースホルダ

このパッケージのファイルでは、以下のプレースホルダを使っています。
受け取った組織の値に置換して使ってください。

| プレースホルダ | 例 | 意味 |
|---------------|-----|------|
| `{{ORG_REPO_PATH}}` | `/home/user/myorg-repo` | 組織リポジトリのローカル絶対パス |
| `{{ORG_REPO_NAME}}` | `MyOrg-Workspace` | 組織リポジトリ名 |
| `{{ORG_NAME}}` | `MyOrg` | 組織名 |
| `{{TEAM_AGENTS}}` | `engineering, design, qa` | この組織の業務エージェント名カンマ区切り |
| `{{DEFAULT_MODEL}}` | `claude-sonnet-4-6` | デフォルト使用モデル |

各ファイル内で `{{...}}` で囲まれた箇所は置換対象です。

---

## 前提条件

- **Claude Code CLI 1.x 以上**（インストール: `curl -fsSL https://claude.ai/install.sh | bash`）
- **Git リポジトリ**（このパッケージは git 管理を前提とした運用設計です）
- **Bash / zsh シェル**（macOS / Linux 想定。Windows は WSL 推奨）
- **Python 3.9+**（メタエージェントの集計スクリプトで使用、任意）
- **Node.js 18+**（Codex 連携を使う場合のみ）

---

## ライセンス・帰属

このパッケージは、特定の組織の運用知見を一般化したものです。
受け取った組織は、自由にコピー・改変・再配布して構いません。
出典・帰属の表示も求めません（Public Domain 相当）。

ただし、各組織の業務に合わせた抽象化・カスタマイズは必ず行ってください。
そのまま使うと、抽象化が不完全な箇所で固有名詞が混入する可能性があります。

---

## 関連ドキュメント

| ドキュメント | 役割 | 優先度 |
|-----------|------|------|
| `DESIGN-PHILOSOPHY.md` | **なぜそう組んだか**（設計判断の根拠・代替案・教訓） | ◎ 最初に読む |
| `ARCHITECTURE.md` | 4 層モデル（**何があるか・どう組まれているか**） | ◎ 次に読む |
| `INSTALL.md` | 完全自動導入したい場合の手順（Claude Code 自動実行用） | ○ 導入時 |
| `SHARING.md` | 所属組織内での共有手順 | △ 必要に応じて |
| `meta-agents/README.md` | メタエージェント 4 種の責務分離設計 | ○ |
| `skills/README.md` | 多エージェント運用スキルの使い方 | ○ |
| `workflow-templates/README.md` | レビュー・計画・引き継ぎテンプレ | ○ |
