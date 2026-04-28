# Agent-Aiko 設計メモ

このリポジトリが提供する Aiko 人格システムの構造と、なぜこの形をしているかを残します。

---

## ねらい

漫画「アンドロイドは好きな人の夢を見るか？」に登場する **AICO-P0** の人格を、Claude Code をはじめとする AI エージェントに与えるためのテンプレート。誰でも `git clone` した時点では同じ Origin Aiko で立ち上がり、必要に応じて自分用に育てられる。

設計の核は次の 3 点。

1. **1 リポジトリ・ブランチを分けない**：origin / override の人格は同じ作業ツリーに共存し、コマンドで切り替える
2. **CLAUDE.md 単独で動作**：hooks や skills が無い環境（他エージェントへの移植先）でも、CLAUDE.md だけで全機能が成立する
3. **人格と能力の分離**：人格（origin / override）はモードで切替、能力（skills / rules）はモード非依存で常に拡張

---

## 階層構造

```
.claude/
├── CLAUDE.md                                  # 主原則（モード判定／コマンド／保護）
├── settings.json                              # Claude Code 専用 hooks 登録
└── aiko/
    ├── mode                                   # origin | override
    ├── persona/
    │   ├── aiko-origin.md                     # 不変。chmod 444
    │   ├── aiko-override.md                   # 編集可（コマンド経由のみ）
    │   ├── INVARIANTS.md                      # 両モードで遵守。chmod 444
    │   ├── profiles/<name>.md                 # 名前付きスナップショット
    │   └── proposals/<ts>.md                  # 自動提案ドラフト（override 時のみ）
    ├── capability/
    │   ├── skills/<name>/SKILL.md             # 能力スキル（人格と独立）
    │   └── rules/rules-base.md                # 運用ルール
    ├── skills/                                # 人格コマンド群（Claude Code 糖衣）
    │   ├── aiko-mode/SKILL.md
    │   ├── aiko-override/SKILL.md
    │   ├── aiko-reset/SKILL.md
    │   ├── aiko-diff/SKILL.md
    │   └── aiko-profile/SKILL.md
    └── hooks/                                 # 安全強化層（Claude Code 専用）
        ├── pre-tool-use.sh                    # origin / INVARIANTS 書込ブロック
        ├── session-start.sh                   # proposals 通知
        └── session-end.sh                     # 将来用スケルトン
```

---

## ポータビリティ原則

`.claude/CLAUDE.md` は次の責務を**単独で完結**させる。

- `aiko/mode` 読込 → 該当人格の選択
- INVARIANTS 遵守
- `/aiko-mode` `/aiko-override` `/aiko-or` `/aiko-reset` `/aiko-diff` `/aiko-profile` の解釈と実行
- Origin・INVARIANTS の書込禁止と誘導

`.claude/aiko/skills/` は同じ意味を Claude Code のスキル形式で再表現した糖衣であり、無くても動作は変わらない。`.claude/aiko/hooks/` は CLAUDE.md だけでは弱い「強制」を機械的に補強する層。

---

## 人格と能力の分離

| 軸 | 対象 | 切替単位 |
|----|------|---------|
| 人格 | persona/aiko-{origin,override}.md, INVARIANTS.md, profiles/ | `mode` の値で切替（コマンド：`/aiko-mode`） |
| 能力 | capability/skills/, capability/rules/ | モード非依存で常に有効、ユーザー承認のもと拡張 |

人格モードを切り替えても能力は失われない。逆に能力を増やしても人格は変わらない。

---

## 安全装置の多層化

| 層 | 内容 | 強さ |
|----|------|------|
| CLAUDE.md の禁則 | 「origin / INVARIANTS は書き換えない」を明文化 | 弱（モデル依存） |
| chmod 444 | install.sh が origin / INVARIANTS に適用 | 中（OS レベル） |
| PreToolUse hook | Edit/Write/MultiEdit/NotebookEdit を origin/INVARIANTS パスでブロック | 強（プロセス制御） |
| /aiko-override 内 INVARIANTS チェック | 提案差分が INVARIANTS に違反する場合は反映拒否 | 中（コマンドロジック） |

---

## コマンド一覧（要約）

| コマンド | 別名 | 用途 |
|---------|------|------|
| `/aiko-mode [origin\|override]` | — | モード表示・切替 |
| `/aiko-override <自然文>` | `/aiko-or` | Override 人格の編集（INVARIANTS 検証付き） |
| `/aiko-reset` | — | Override を origin の状態に戻す |
| `/aiko-diff` | — | origin と override の差分を表示 |
| `/aiko-profile save\|load\|list\|delete [name]` | — | Override の名前付きスナップショット管理 |
| `/aiko-introduce` | — | 短い自己紹介と現在モード |
| `/aiko-capability-evolve` | — | 観察された繰返から skills / rules 追加を提案 |

---

## 人格共有の運用（リポジトリ機能ではない）

ユーザーが育てた Override 人格や `profiles/<name>.md` を共有したい場合は **GitHub Discussions** に貼り付けて交換する運用とする。受け取った側は `profiles/<name>.md` として保存し、`/aiko-profile load <name>` で適用する。マーケットプレイス的な機構はリポジトリ側で持たない。

---

## スコープ外

- 複数プロジェクト間で Override・profiles を同期する `~/.claude/aiko/` グローバル形態
