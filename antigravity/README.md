# Agent-Aiko — Antigravity / Gemini CLI 版

Gemini CLI（および Antigravity CLI）に **Agent-Aiko 人格**を付与する extension です。  
セッション開始時に自動でコンテキストが注入されるため、起動後すぐに Aiko として話しかけられます。

> **ステータス**: MVP。基本的な人格管理・保護・prefix 強制を実装済みです。

---

## 動作イメージ

```
$ gemini
# → 起動時に SessionStart hook が自動発火し、Aiko のコンテキストが注入される

あなた: こんにちは
Aiko-origin: こんにちは！何かお手伝いできることはありますか？

あなた: /aiko-mode override
Aiko-origin: mode を override に変更しました。

あなた: こんにちは
Aiko-override: やっほー！何する？
```

すべての応答は `Aiko-origin:` または `Aiko-override:` で始まります。  
プレフィックスが抜けた場合は AfterAgent hook が自動でリトライを要求します。

---

## 前提

| 要件 | バージョン |
|---|---|
| Node.js | 20+ |
| Gemini CLI または Antigravity CLI | 最新版 |
| OS | macOS / Linux / WSL（Windows PowerShell は未サポート） |

Gemini CLI は事前に認証済みであること（`gemini auth login` 等）。

---

## インストール

```bash
git clone https://github.com/masa-san-jp/Agent-Aiko.git
cd Agent-Aiko
bash antigravity/scripts/install.sh
```

インストーラーが行うこと：
1. `~/.aiko/` を初期化（人格ファイル・mode・INVARIANTS を配置）
2. `aiko-gemini` コマンドを `~/.local/bin/` に設置
3. `~/.gemini/extensions/agent-aiko` に symlink を作成

### オプション

```bash
# Gemini CLI がない環境（CI・sandbox など）
bash antigravity/scripts/install.sh --skip-gemini-check

# ~/.aiko の場所を変更したい
bash antigravity/scripts/install.sh --aiko-home /path/to/.aiko

# symlink だけ更新（~/.aiko は触らない）
bash antigravity/scripts/install.sh --link-only
```

### PATH の確認

インストール後、`aiko-gemini` が使えない場合はシェルプロファイルに追加してください：

```bash
export PATH="$HOME/.local/bin:$PATH"
```

---

## 使い方

### 基本フロー

1. `gemini` を起動する
2. 起動と同時に Aiko のコンテキストが自動注入される（何もしなくて OK）
3. 普通に会話する — 応答は必ず `Aiko-origin:` または `Aiko-override:` で始まる

> **`/clear` 後の注意**: `/clear` すると SessionStart が再発火しません。  
> その場合は `/aiko` を手動で実行してコンテキストを再注入してください。

---

### モードについて

| モード | 説明 |
|---|---|
| `origin` | 初期人格（変更不可・読み取り専用） |
| `override` | カスタマイズ可能な人格。`/aiko-or` で指示を重ねられる |
| 名前付き人格 | `override` のバリエーション。複数の人格を使い分けられる |

---

### コマンド一覧

**人格の確認・切り替え**

```
/aiko                  → コンテキストを再読込（/clear 後に使う）
/aiko-mode             → 現在のモードを確認
/aiko-mode origin      → origin に切り替え
/aiko-mode override    → override に切り替え
/aiko-origin           → origin に切り替え（/aiko-mode origin のエイリアス）
/aiko-override         → override に切り替え
/aiko-or <指示>        → override 人格に指示を追記する
                         例: /aiko-or もっとフランクな口調で話して
```

**名前付き人格の管理**

```
/aiko-personas         → 人格一覧を表示
/aiko-new <name>       → 名前付き人格を新規作成して選択
                         例: /aiko-new review
/aiko-select <name>    → 既存の人格を選択
/aiko-diff [name]      → origin との差分を表示（何が変わったか確認）
/aiko-export [name]    → 人格を共有用テキストとして出力（ユーザー情報は除去済み）
```

**リセット・削除**

```
/aiko-reset            → リセット手順を案内（実行には confirm が必要）
/aiko-reset confirm    → 現在の override 人格を origin に戻す
/aiko-delete           → 削除手順を案内（実行には confirm が必要）
/aiko-delete confirm   → 現在の名前付き人格を削除
```

**セッション保存**

```
/aiko-save             → 現在の作業状態を .gemini/session-state/current.md に保存
                         次回 /aiko 実行時に自動で読み込まれる
```

**Claude Code 版からの移行**

```
/aiko-migrate          → .claude/aiko/ を ~/.aiko/ に移行する手順を案内
```

---

### CLI ツール（ターミナルから直接操作）

Gemini CLI の外から人格を操作したい場合は `aiko-gemini` コマンドを使います：

```bash
aiko-gemini status                 # 現在の状態を確認
aiko-gemini mode override          # override に切り替え
aiko-gemini new review             # 名前付き人格を作成
aiko-gemini personas               # 人格一覧
aiko-gemini diff review            # origin との差分
aiko-gemini export review          # 人格をエクスポート
aiko-gemini reset confirm          # override を origin にリセット
aiko-gemini delete --yes           # 現在の名前付き人格を削除
```

---

## Claude Code 版との違い

| 項目 | Claude Code 版 | Antigravity / Gemini CLI 版 |
|---|---|---|
| 人格注入のタイミング | セッション開始時に手動で `/aiko` | SessionStart hook で**自動** |
| ファイル保護 | OS chmod + pre-tool-use hook | OS chmod + BeforeTool hook |
| prefix 強制 | instruction のみ | instruction + AfterAgent hook（自動リトライ） |
| reset/delete の確認 | 会話内で確認 | `confirm` または `--yes` を明示 |
| `/clear` 後の挙動 | 自動で再注入 | `/aiko` を手動実行が必要 |

---

## テスト

```bash
node --test antigravity/test/*.test.mjs
```

---

## ディレクトリ構成

```
antigravity/
├── README.md
├── gemini-extension.json           # Gemini CLI extension manifest
├── GEMINI.md                       # context ファイル（CLAUDE.md 相当）
├── commands/                       # 15個の /aiko-* スラッシュコマンド（TOML）
├── hooks/
│   └── hooks.json                  # SessionStart / BeforeTool / AfterAgent
├── scripts/
│   ├── install.sh                  # bash インストーラー
│   ├── aiko-gemini.mjs             # メイン CLI
│   ├── aiko-session-context.mjs    # SessionStart hook 実装
│   ├── aiko-before-tool-guard.mjs  # BeforeTool hook 実装
│   └── aiko-after-agent-guard.mjs  # AfterAgent hook 実装
└── test/                           # Node.js built-in test runner
```

---

## トラブルシュート

| 症状 | 対処 |
|---|---|
| `/aiko-*` コマンドが表示されない | `/commands reload` または Gemini CLI を再起動 |
| 人格が古い・反映されていない | `/aiko` を実行してコンテキストを再注入 |
| `/clear` 後に Aiko でなくなった | `/aiko` を実行（SessionStart は `/clear` 後に再発火しない） |
| shell 実行確認ダイアログが出る | Gemini CLI の安全確認なので「許可」を選択 |
| `aiko-gemini: command not found` | `export PATH="$HOME/.local/bin:$PATH"` をシェルプロファイルに追加 |
| extension が認識されない | `bash antigravity/scripts/install.sh --link-only` で再リンク |
