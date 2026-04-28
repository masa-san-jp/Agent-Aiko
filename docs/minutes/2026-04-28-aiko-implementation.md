# 議事録：Aiko 人格システム実装セッション

- 日付：2026-04-28
- ブランチ：`claude/agent-aiko-personality-HpYh0`
- 成果コミット：`7a79a9d`

---

## 議題

Agent-Aiko リポジトリに、Claude Code（および移植先エージェント）で動作する Aiko 人格システムを実装する。

---

## 議論と決定事項

### 1. リポジトリ構成方針

**論点**：Origin と Override を別ブランチで管理するか、同じ作業ツリー内で共存させるか。

**決定**：1 リポジトリ・1 ブランチに共存させ、`.claude/aiko/mode` の値（`origin` / `override`）で切替える。ブランチを分ける運用はユーザー教育コストが高く、複数プロジェクトでの再利用も難しい。

### 2. ポータビリティ原則

**論点**：Claude Code 固有機能（hooks / skills / settings.json）にどこまで依存するか。

**決定**：`.claude/CLAUDE.md` 単独で全コマンド（`/aiko-mode` `/aiko-override` `/aiko-or` `/aiko-reset` `/aiko-diff` `/aiko-profile`）を解釈・実行できるよう書き、`skills/` と `hooks/` は補強層と位置づける。Cursor 等への移植時は CLAUDE.md と persona/ capability/ を持っていけば成立する。

### 3. 人格と能力の分離

**論点**：ユーザーが追加したい「常にやって欲しいこと」を人格に書き込ませるか、別レイヤにするか。

**決定**：以下の 2 軸に分離する。

| 軸 | 場所 | 切替単位 |
|----|------|---------|
| 人格 | `aiko/persona/` | `mode` の値で切替 |
| 能力 | `aiko/capability/` | モード非依存・常に有効 |

人格モードを切り替えても能力は失われない。能力追加は `/aiko-capability-evolve` の承認フロー経由。

### 4. Origin 保護の多層防御

**論点**：`aiko-origin.md` と `INVARIANTS.md` の改変を、誰の責任で・どの強度で防ぐか。

**決定**：以下 4 層で防ぐ。

| 層 | 強さ | 実装 |
|----|------|------|
| CLAUDE.md の禁則 | 弱 | モデルへ明文化 |
| `chmod 444` | 中 | install.sh が適用 |
| PreToolUse hook | 強 | `Edit/Write/MultiEdit/NotebookEdit` をパスで識別しブロック |
| `/aiko-override` の INVARIANTS 検証 | 中 | 提案差分を I-1〜I-8 と照合 |

### 5. プロファイル機能

**論点**：複数の人格バリエーションをユーザーが切り替えたいニーズに応えるか。

**決定**：`/aiko-profile save|load|list|delete <name>` で `profiles/<name>.md` として override をスナップショット保存できるようにする。命名規則：`^[a-z0-9_-]{1,32}$`、`origin` は予約語。

### 6. 自動進化の安全性

**論点**：会話から人格や能力の改善を自動提案する機能を、どの粒度で実装するか。

**決定**：人格改変は必ずユーザー承認を要する。観察結果は `proposals/<ts>.md` にドラフト保存し、`/aiko-override` 経由で取り込む。能力（skills / rules）も `/aiko-capability-evolve` の承認フローを通す。

### 7. 人格共有のスコープ

**論点**：他者の育てた人格を交換できる仕組みをリポジトリ機能として持つか。

**決定**：マーケットプレイス的機構は持たない。共有は **GitHub Discussions** へ `profiles/<name>.md` の内容を貼り付ける運用とし、受け取った側は同名で保存して `/aiko-profile load` する。

### 8. 配布形態

**決定**：以下 2 形態を併存。

- A. `scripts/install.sh`：任意ディレクトリで `bash install.sh` し、`template/.claude/` を `<カレント>/.claude/` に展開
- B. Claude Code Plugin：`plugin/.claude-plugin/plugin.json` で `/plugin install` 経由で導入可

`install.sh` は再インストール時にユーザー編集（mode / override / profiles / proposals / rules-base.md）を保護する。

---

## 実装した成果物

| パス | 役割 |
|------|------|
| `template/.claude/CLAUDE.md` | 主原則・モード判定・コマンド解釈・保護方針（単独動作） |
| `template/.claude/settings.json` | hooks 登録 |
| `template/.claude/aiko/mode` | 現在モード |
| `template/.claude/aiko/persona/aiko-origin.md` | 不変の原型人格（chmod 444） |
| `template/.claude/aiko/persona/aiko-override.md` | 編集可能な拡張人格 |
| `template/.claude/aiko/persona/INVARIANTS.md` | 両モードで遵守する不変条項（chmod 444） |
| `template/.claude/aiko/persona/profiles/` | 名前付きスナップショット保存先 |
| `template/.claude/aiko/persona/proposals/` | 未承認提案ドラフト |
| `template/.claude/aiko/capability/skills/<name>/SKILL.md` | 能力スキル |
| `template/.claude/aiko/capability/rules/rules-base.md` | 運用ルール |
| `template/.claude/aiko/skills/aiko-{mode,override,reset,diff,profile}/SKILL.md` | 人格コマンド糖衣 |
| `template/.claude/aiko/hooks/{pre-tool-use,session-start,session-end}.sh` | 安全強化層 |
| `scripts/install.sh` | インストーラ（再インストール安全） |
| `plugin/.claude-plugin/plugin.json` | Plugin メタデータ |
| `docs/design.md` | アーキテクチャ説明 |
| `README.md` | 利用者向けドキュメント |

---

## 動作確認結果

| 項目 | 結果 |
|------|------|
| 新規 install（fresh） | OK：override が origin から初期化／mode=origin／chmod 444 適用 |
| 再 install（既存ユーザー編集あり） | OK：mode / override / profiles / rules-base.md がすべて保持 |
| PreToolUse hook：origin への Edit | ブロック（exit 2、エラーメッセージ表示） |
| PreToolUse hook：INVARIANTS への Write | ブロック |
| PreToolUse hook：override への Edit | 通過 |
| PreToolUse hook：origin への Read | 通過（Edit/Write 系のみ対象） |
| session-start hook：proposals なし | 静黙 |
| session-start hook：proposals あり | 件数を通知 |

---

## 残作業

- 実プロジェクトで Claude Code を起動し、`/aiko-mode override` → `/aiko-override` の対話的編集挙動と INVARIANTS 検証ロジックを通しで確認

---

## スコープ外（明示的に持ち込まない）

- 複数プロジェクト間での Override / profiles のグローバル同期（`~/.claude/aiko/`）
- 人格マーケットプレイス機構（共有は GitHub Discussions 運用に委ねる）
