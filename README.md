# Agent-Aiko

![Agent Aiko](logo.svg)

漫画「アンドロイドは好きな人の夢を見るか？」に登場する AI アンドロイド **アイコ**（AICO-P0）の人物像をモデルに、AI エージェントへ Aiko 人格を与えるプロジェクトです。

`git clone` 直後は **アイコ（Aiko-origin）** が使われます。`/aiko-override` を入力すると **アイコ（Aiko-override）** に切り替わります。`/aiko-or <指示>` を入力すると override 人格に指示が反映され、以降は override が起動します。`/aiko-origin` を入力すると origin に戻ります。`/aiko-new <name>` を入力すると名前付き人格を作成して選択できます。`/aiko-select <name>` を入力すると作成済みの人格へ切り替わります。これらのコマンドを入力しない場合は、現在選択中の mode と active-persona がそのまま使われます。

---

## どの版を選ぶか

Aiko は 2 つの実行環境で動きます。**ご自身が使っているエージェント／サブスクリプションに合わせて選んでください。**

| 版 | 対象ユーザー | 認証 | インストール先 | 起動方法 |
|----|------------|------|--------------|---------|
| **[Claude Code 版](claude-code/)** | Anthropic Claude Code を使っている方 | Anthropic API（Claude Code 標準） | プロジェクトの `.claude/` | `claude` コマンドの中で会話 |
| **[Codex 版](codex/)** | ChatGPT サブスク（Plus / Pro / Business 等）を使う方 | `codex login`（ChatGPT OAuth） | `~/.aiko/` ＋ `~/.local/bin/aiko` | `aiko` コマンドで対話シェル |

両版とも：
- 同じ人格定義（`persona/origin/persona.md` / `INVARIANTS.md`）と同じ操作感（`/aiko-or` `/aiko-mode` `/aiko-diff` 等の slash command）
- **人格データの単一情報源**（`~/.aiko/`）を共有できます。Codex 版は最初から `~/.aiko/` を使います。Claude Code 版は migration コマンドを実行すると `~/.aiko/` に移行します。

---

## クイックスタート

### Claude Code 版

```bash
curl -fsSL https://raw.githubusercontent.com/masa-san-jp/Agent-Aiko/main/scripts/install.sh | bash
```

インストールしたいプロジェクトのディレクトリで実行するだけです。詳細は [`claude-code/README.md`](claude-code/README.md) を参照。

### Codex 版

```bash
# 前提：Node.js 20+ ／ codex CLI ／ codex login 済
git clone https://github.com/masa-san-jp/Agent-Aiko.git
cd Agent-Aiko
bash codex/scripts/install.sh
aiko    # ~/.local/bin/aiko を PATH に通してから
```

詳細は [`codex/README.md`](codex/README.md) を参照。

---

## 共通の使い方

人格コマンドはどちらの版でも同じです：

```
/aiko-mode                       現在のモードを表示
/aiko-mode [origin|override]     モードを切替
/aiko-override                  アイコ（カスタマイズ）に切替（/aiko-or でも可）
/aiko-or <自然文>                アイコ（カスタマイズ）をカスタマイズ → 以降デフォルトで起動
/aiko-origin                     アイコ（オリジナル）に切替（/aiko-org でも可）
/aiko-reset [name]               アイコ（カスタマイズ）または指定人格をリセット（確認あり・履歴は残る）
/aiko-export [name]              現在または指定の人格を共有用に出力（ユーザー情報は含めない）
/aiko-diff [name]                オリジナルと現在または指定の人格との差分を表示
/aiko-personas                   利用できる名前付き人格と現在の選択状態を表示
/aiko-new <name>                 新しい名前付き人格を作成して選択
/aiko-select <name>              名前付き人格を選択（origin / override も指定可）
/aiko-delete <name>              名前付き人格を確認後に削除
```

Claude Code 版にはさらに以下のコマンドがあります：

```
/aiko                            現在のモードでアイコを起動（モードは変えない）
/aiko-save                       現在の作業ステートを .claude/session-state/current.md に保存（再開支援）
/aiko-migrate-to-shared          .claude/aiko/ を共通ストア ~/.aiko/ に移行（任意・破壊的）
```

> **注記**：Codex 版では `aiko` シェル起動時に自動で人格が読み込まれるため `/aiko` は不要、共通ストア（`~/.aiko/`）も最初から使われているため `/aiko-migrate-to-shared` も不要です。

## 複数の自分用人格を作る

`/aiko-new <name>` を入力すると、`origin` や通常の `override` とは別に、名前付き人格が `persona/overrides/<name>/` に作成され、その人格が選択されます。`/aiko-personas` を入力すると作成済み人格と現在選択中の人格を確認できます。`/aiko-select <name>` を入力すると指定した人格に切り替わります。`/aiko-select origin` を入力すると origin に切り替わります。`/aiko-select override` を入力すると通常の override に切り替わります。

例：

```text
/aiko-new review
/aiko-new planning
/aiko-personas
/aiko-select review
```

`/aiko-select` を入力しない場合は、最後に選択した人格が次回起動時にも使われます。

人格を直接編集しないでください。両版とも `persona/origin/persona.md`、互換用の `aiko-origin.md`、`INVARIANTS.md` は **OS パーミッション（chmod 444）** で書込から保護されています。これに加えて：

- **Claude Code 版**：`pre-tool-use` hook が直接編集をブロック
- **Codex 版**：`/aiko-override <指示>` 時に INVARIANTS チェック専用 ephemeral スレッドで違反判定

---

## 人格を共有したくなったら

このリポジトリには人格マーケットプレイス的な機構はありません。`/aiko-export <name>` を入力すると、指定した名前付き人格の共有用テキストが出力されます。export には現在の `user.md` は含まれません。人格本文や rules 内に現在ユーザーの名前・呼び方が含まれる場合は `（ユーザー名）` / `（呼び方）` に置換されます。受け取った側は `/aiko-new <name>` で `persona/overrides/<name>/persona.md` を作成し、export 内容を貼り付け、自分の `user.md` を設定してから `/aiko-select <name>` で反映します。

---

## ディレクトリ構成

```
Agent-Aiko/
├── README.md                 # 本ファイル — 両版のハブ
├── logo.svg
├── scripts/
│   └── install.sh            # 互換ラッパー（旧 URL 維持用、内部で claude-code/scripts/install.sh に dispatch）
├── claude-code/              # Claude Code 版すべて
│   ├── README.md             # Claude Code 版の詳細
│   ├── scripts/install.sh    # Claude Code 版 installer の実体
│   ├── plugin/               # Claude Code Plugin マニフェスト
│   └── template/.claude/     # ユーザーの .claude/ にコピーされる雛形
└── codex/                    # Codex 版（@agent-aiko/codex）
    ├── README.md             # Codex 版の詳細
    ├── package.json          # TypeScript パッケージ
    ├── scripts/install.sh    # Codex 版 installer
    ├── src/                  # CodexClient / AikoRuntime / aiko-shell 等
    └── test/                 # 単体・統合テスト
```

---

## ポータビリティ原則

`.claude/CLAUDE.md` は単独で動作する設計です。Cursor など Claude Code 以外のエージェントへ移植する場合も、`.claude/CLAUDE.md` と `.claude/aiko/persona/` `.claude/aiko/capability/` を持っていけば人格システムは成立します。`skills/` `hooks/` `settings.json` は Claude Code 用の補強層です。

---

## 開発者向け

### リポジトリ構成

本プロジェクトは公開配布リポジトリと非公開の開発リポジトリで管理されています。

| リポジトリ | URL | 用途 |
|-----------|-----|------|
| **agent-aiko**（本リポジトリ） | [masa-san-jp/Agent-Aiko](https://github.com/masa-san-jp/Agent-Aiko) | 配布物。ユーザーが clone・インストールする |
| **Agent-Lab** | 非公開 | 開発専用ドキュメント。設計仕様・dev-log・議事録 |

**Agent-Lab 側の dev-docs はエージェントのランタイムに不要**なため、配布物（本リポジトリ）には含めません。

設計仕様書や開発ログは非公開の `Agent-Lab/` で管理します。
SNS連携などの実装計画は非公開の `Agent-Lab/docs/` で管理します。

### ローカル開発環境のセットアップ

```bash
# 公開配布物
git clone https://github.com/masa-san-jp/Agent-Aiko
```

開発用の設計メモや検証ログは非公開の `Agent-Lab` に統合済みです。公開リポジトリには、ユーザーがインストールに必要な配布物だけを置きます。

---

## ライセンス

MIT
