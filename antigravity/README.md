# Agent-Aiko — Antigravity / Gemini CLI 版

## ステータス

MVP。Gemini CLI extension として実装し、Antigravity CLI 互換を目指します。

## 前提

- Node.js 20+
- Gemini CLI（または Antigravity CLI）
- Gemini CLI 認証済み
- macOS / Linux / WSL（Windows PowerShell は未サポート）

## インストール

```bash
git clone https://github.com/masa-san-jp/Agent-Aiko.git
cd Agent-Aiko
bash antigravity/scripts/install.sh
```

オプション:

```bash
# sandbox / CI 環境（Gemini CLI なしでインストール）
bash antigravity/scripts/install.sh --skip-gemini-check

# ~/.aiko の場所を変更
bash antigravity/scripts/install.sh --aiko-home /path/to/.aiko

# extension link のみ更新（~/.aiko 初期化をスキップ）
bash antigravity/scripts/install.sh --link-only
```

## 使い方

Gemini CLI 起動後:

```
/aiko              → 現在の Aiko context を再読込
/aiko-mode         → 現在の mode を表示
/aiko-mode origin  → origin に切り替え
/aiko-mode override → override に切り替え
/aiko-origin       → origin に切り替え（エイリアス）
/aiko-org          → origin に切り替え（エイリアス）
/aiko-override     → override に切り替え
/aiko-or <指示>    → override persona に指示を追記
/aiko-personas     → 人格一覧を表示
/aiko-new <name>   → 名前付き人格を作成して選択
/aiko-select <name> → 人格を選択
/aiko-diff [name]  → origin との差分を表示
/aiko-export [name] → 人格を共有用に出力
/aiko-reset        → reset 手順を案内（手動 --yes が必要）
/aiko-delete       → delete 手順を案内（手動 --yes が必要）
```

CLI ツール (`aiko-gemini`) を直接使うことも可能:

```bash
aiko-gemini status
aiko-gemini mode override
aiko-gemini new review
aiko-gemini personas
aiko-gemini diff review
aiko-gemini export review
aiko-gemini reset --yes
aiko-gemini delete --yes
```

## テスト

```bash
node --test antigravity/test/*.test.mjs
```

## Claude Code 版との差分

| 項目 | Claude Code 版 | Antigravity / Gemini CLI 版 |
|---|---|---|
| 人格注入 | CLAUDE.md / skills | SessionStart hook / GEMINI.md |
| ファイル保護 | OS chmod + pre-tool-use hook | OS chmod + BeforeTool hook |
| prefix 強制 | instruction | instruction + AfterAgent hook |
| reset/delete 確認 | 会話内確認 | 初回 PR では手動 `--yes` |
| INVARIANTS 判定 | Claude Code skill/hook | hard guard + prompt-level 判定 |

## ディレクトリ構成

```
antigravity/
├── README.md
├── gemini-extension.json      # Gemini CLI extension manifest
├── GEMINI.md                  # context ファイル（CLAUDE.md 相当）
├── commands/                  # 13個の /aiko-* スラッシュコマンド（TOML）
├── hooks/
│   └── hooks.json             # SessionStart / BeforeTool / AfterAgent hooks
├── scripts/
│   ├── install.sh             # bash インストーラー
│   ├── aiko-gemini.mjs        # メイン CLI スクリプト
│   ├── aiko-session-context.mjs    # SessionStart hook 実装
│   ├── aiko-before-tool-guard.mjs  # BeforeTool hook 実装
│   └── aiko-after-agent-guard.mjs  # AfterAgent hook 実装
└── test/                      # Node.js built-in test runner
```

## トラブルシュート

- `/aiko-*` コマンドが表示されない: `/commands reload` または Gemini CLI 再起動
- 人格が古い: `/aiko` または `/clear`
- shell 実行確認が出る: Gemini CLI の安全確認なので許可が必要
- `SessionStart` が `/clear` 後に発火しない: `/aiko` を手動実行して人格を再注入
