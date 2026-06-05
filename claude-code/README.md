# Agent-Aiko — Claude Code 版

Claude Code 環境で動く Aiko の配布物です。既存プロジェクトの `.claude/CLAUDE.md` と `.claude/settings.json` を上書きせず、Aiko の人格データは共有ストア `~/.aiko/` に初期化します。

トップレベル: [Agent-Aiko README](../README.md) ／ Codex 版: [`codex/README.md`](../codex/README.md)

---

## 特徴

- **アイコ（オリジナル）/ アイコ（カスタマイズ）の二人格を同梱**：用途や好みに応じてコマンドで切替
- **既存設定を保護**：プロジェクト既存の `.claude/CLAUDE.md` / `.claude/settings.json` を保持
- **共有ストアで動作**：人格・モード・ユーザー設定は `~/.aiko/` に保存し、Codex 版とも共有可能
- **人格と能力を分離**：人格はモード切替、能力（skills / rules）は常に拡張
- **INVARIANTS による不変核**：です・ます調や境界の振る舞いを Override でも守る

---

## インストール

### A. curl でインストール（推奨）

インストールしたいプロジェクトのディレクトリで次のコマンドを実行します。

```bash
curl -fsSL https://raw.githubusercontent.com/masa-san-jp/Agent-Aiko/main/scripts/install.sh | bash
```

`scripts/install.sh` は互換ラッパーで、内部的に `claude-code/scripts/install.sh` を実行します。確認プロンプトで `Y` を入力すると、Aiko 共有ストア `~/.aiko/` が初期化され、対象プロジェクトには `.claude/skills/aiko*/` と `.claude/scripts/aiko-*.sh` が配置されます。既存の `.claude/CLAUDE.md` と `.claude/settings.json` は上書きされません。

### B. リポジトリを clone して使う

```bash
# 1. 任意の場所に Agent-Aiko を clone（例：ホームディレクトリ）
git clone https://github.com/masa-san-jp/Agent-Aiko.git

# 2. インストールしたいプロジェクトに移動
cd <あなたのプロジェクト>

# 3. clone した場所のパスを指定して実行（どちらでも動きます）
bash /clone した場所/Agent-Aiko/scripts/install.sh                 # 互換ラッパー経由
bash /clone した場所/Agent-Aiko/claude-code/scripts/install.sh     # 直接実行
# 例: bash ~/Agent-Aiko/scripts/install.sh
```

---

## 使い方

以下のコマンドをチャットに入力することで Aiko を操作できます。各コマンドは `.claude/skills/aiko*/` 配下の SKILL 定義として登録されており、Claude Code がスラッシュコマンドとして認識します。人格データは `~/.aiko/` から読み書きします。

```
/aiko                          # 現在のモードでアイコを起動（モードは変えない）
/aiko-mode                     # 現在のモードを表示
/aiko-mode [origin|override]   # モードを切替
/aiko-or                       # アイコ（カスタマイズ）をデフォルトに切替（/aiko-override でも可）
/aiko-or <自然文>              # アイコ（カスタマイズ）をカスタマイズ → 以降デフォルトで起動
/aiko-origin                   # アイコ（オリジナル）に切替（/aiko-org でも可）
/aiko-reset                    # アイコ（カスタマイズ）をリセット（確認あり・履歴は残る）
/aiko-export                   # 現在の アイコ（カスタマイズ）を共有用に出力（ユーザー情報は含めない）
/aiko-diff                     # オリジナルと自分用の差分を表示
/aiko-personas                 # 利用できる名前付き人格と現在の選択状態を表示
/aiko-new <name>               # 新しい名前付き人格を作成して選択
/aiko-select <name>            # 名前付き人格を選択（タイポ・大小揺れも fuzzy で解決）
/aiko-delete                   # 現在の人格にお別れを告げて削除（引数なし・確認あり）
/aiko-save                     # 現在の作業ステートを .claude/session-state/current.md に保存（再開支援）
/aiko-migrate-to-shared        # 旧 .claude/aiko/ を共通ストア ~/.aiko/ に移行（旧導入環境向け・任意）
/aiko-service                  # 常駐稼働の方法を案内（デーモンモード / systemd サービス）
```

`/aiko` は最も軽量な「読み込み専用の起動」コマンドです。会話の途中で人格を読み込みたいときに利用します。モードの切替や人格の編集は他の `/aiko-*` コマンドに委譲します。

## 複数の自分用人格

`/aiko-new <name>` を入力すると、通常の `override` とは別に名前付き人格が作成され、その人格が選択されます。作成した人格は `persona/overrides/<name>/` に保存されます。`/aiko-personas` を入力すると一覧と現在の選択状態が表示されます。`/aiko-select <name>` を入力すると指定した人格に切り替わります。`/aiko-select` を入力しない場合は、最後に選択した人格が使われます。

```text
/aiko-new review
/aiko-new planning
/aiko-select review
```

人格を直接編集しないでください。`persona/origin/persona.md`、互換用の `aiko-origin.md`、`INVARIANTS.md` は OS と hook で書込が拒否されます。

---

## ディレクトリ構成

```
claude-code/
├── README.md                          # 本ファイル
├── scripts/
│   └── install.sh                     # Claude Code 版 installer の実体
├── plugin/                            # Claude Code Plugin マニフェスト
└── template/
    └── .claude/                       # 配布元テンプレート
        ├── CLAUDE.md                  # 互換用の起動原則（既存ユーザー環境には上書きしない）
        ├── settings.json              # 互換用 hook 設定（既存ユーザー環境には上書きしない）
        ├── skills/                    # Claude Code が認識するスラッシュコマンド
        │   ├── aiko/                  # /aiko 起動（モード尊重・読み込み専用）
        │   ├── aiko-mode/
        │   ├── aiko-override/
        │   ├── aiko-or/
        │   ├── aiko-origin/
        │   ├── aiko-org/
        │   ├── aiko-reset/
        │   ├── aiko-diff/
        │   ├── aiko-export/
        │   ├── aiko-personas/
        │   ├── aiko-new/
        │   ├── aiko-select/
        │   ├── aiko-delete/
        │   ├── aiko-save/
        │   ├── aiko-migrate-to-shared/  # /aiko-migrate-to-shared（共通ストア移行・任意）
        │   └── aiko-service/            # /aiko-service（常駐起動方法の案内）
        ├── scripts/
        │   ├── aiko-boot.sh           # 自動再起動ラッパー（daemon / Telegram モード）
        │   ├── aiko-service.sh        # systemd サービス管理
        │   └── migrate-to-shared.sh   # /aiko-migrate-to-shared の実体（dry-run 推奨）
        ├── session-state/             # /aiko-save の保存先（実データ auto.jsonl/current.md は .gitignore）
        │   └── current.md.example     # current.md の雛形
        └── aiko/                      # ~/.aiko/ に初期化される Aiko 共有ストア
            ├── mode                   # 現在のモード（origin / override）
            ├── active-persona          # 名前付き人格の選択状態（空なら通常 override）
            ├── user.md                # ユーザー名・呼び方
            ├── persona/
            │   ├── origin/
            │   │   ├── persona.md     # 書込禁止・origin 正本
            │   │   ├── user.md        # origin 用ユーザー情報
            │   │   └── README.md
            │   ├── aiko-origin.md     # 書込禁止・旧形式互換
            │   ├── aiko-override.md   # active-persona 空のとき /aiko-or で変更される
            │   ├── overrides/          # /aiko-new で作られる名前付き人格
            │   │   └── <name>/
            │   │       ├── persona.md
            │   │       ├── user.md
            │   │       ├── rules.md    # 任意
            │   │       └── README.md
            │   └── INVARIANTS.md      # 書込禁止・不変核
            ├── capability/            # Aiko が自己拡張する領域
            │   ├── skills/            # 会話から提案・追加されるスキル
            │   └── rules/
            │       └── rules-base.md  # ユーザーが教えた運用ルール
            └── hooks/
                ├── session-start.sh
                ├── session-end.sh
                └── pre-tool-use.sh
```

---

## ポータビリティ原則

`template/.claude/CLAUDE.md` は互換用の起動原則テンプレートです。現在の installer はユーザー環境の `.claude/CLAUDE.md` を上書きしません。Claude Code 以外のエージェントへ移植する場合は、`~/.aiko/persona/` と `~/.aiko/capability/` を正本として使います。`skills/` `hooks/` `settings.json` は Claude Code 用の補強層です。

---

## 10. Telegram ボットモード（常駐稼働）

Aiko を Telegram ボットとして常時稼働させることができます。Telegram でメッセージを送ると Aiko が返答します。

### しくみ

`--telegram` フラグで起動すると、Claude Code が **`plugin:telegram@claude-plugins-official`** プラグインを読み込み、Telegram とのやりとりを処理します。

加えて、起動・再起動のタイミングで「起動しました」「再起動します」という通知を送信します。この通知だけが `AIKO_TELEGRAM_BOT_TOKEN` / `AIKO_TELEGRAM_CHAT_ID` を直接使います。

### 事前準備

1. Telegram の **BotFather** で `/newbot` を実行し、ボットトークンを取得します
2. 作ったボットとチャットを開始し、`chat_id` を取得します
   - `https://api.telegram.org/bot<your_token>/getUpdates` を開くと確認できます
3. 以下の環境変数を設定します:
   ```bash
   export AIKO_TELEGRAM_BOT_TOKEN="your_token"
   export AIKO_TELEGRAM_CHAT_ID="your_chat_id"
   ```

### 起動

```bash
bash .claude/scripts/aiko-boot.sh --telegram           # フォアグラウンドで起動
bash .claude/scripts/aiko-boot.sh --daemon --telegram  # バックグラウンドで起動
```

### systemd サービスとして登録（Linux）

インストール前に環境変数を設定しておくと `~/.aiko/telegram.env` に自動保存されます:

```bash
export AIKO_TELEGRAM_BOT_TOKEN="your_token"
export AIKO_TELEGRAM_CHAT_ID="your_chat_id"
bash .claude/scripts/aiko-service.sh install --telegram
```

**インストール後に設定する場合**は `~/.aiko/telegram.env` を直接編集してください（`chmod 600` で保護されています）:

```
AIKO_TELEGRAM_BOT_TOKEN=your_token
AIKO_TELEGRAM_CHAT_ID=your_chat_id
```

編集後はサービスを再起動して環境変数を反映させてください:

```bash
bash .claude/scripts/aiko-service.sh stop
bash .claude/scripts/aiko-service.sh start
```

### セキュリティ注記

Telegram モードは `--dangerously-skip-permissions` で起動します。これはプラグインが自律的にツールを呼び出すために必要なフラグです。以下の点に注意してください:

- **信頼できるプロジェクトディレクトリ内でのみ** 使用してください
- ボットを**パブリックグループに追加しないでください**（誰でもコマンドを送れるようになります）
- トークンが漏洩した場合は BotFather の `/revoke` コマンドですぐに無効化してください

---

## 11. 常駐稼働（デーモン / systemd）

### デーモンモード（OS 非依存）

```bash
bash .claude/scripts/aiko-boot.sh --daemon
bash .claude/scripts/aiko-boot.sh --daemon --telegram
bash .claude/scripts/aiko-boot.sh --status
bash .claude/scripts/aiko-boot.sh --stop
```

ログ: `~/.aiko/aiko.log`（`AIKO_LOG_FILE` で変更可）

### systemd サービス（Linux 推奨）

```bash
bash .claude/scripts/aiko-service.sh install
bash .claude/scripts/aiko-service.sh install --telegram
bash .claude/scripts/aiko-service.sh start
bash .claude/scripts/aiko-service.sh stop
bash .claude/scripts/aiko-service.sh status
bash .claude/scripts/aiko-service.sh log
bash .claude/scripts/aiko-service.sh uninstall
```

詳細は `/aiko-service` コマンドで確認できます。

---

## 設計メモ

開発用の設計メモや検証ログは非公開の `Agent-Lab/` に統合済みです。

Claude Code 版独自の互換用起動原則は `template/.claude/CLAUDE.md` に残しています。新規導入ではユーザー環境へ上書きコピーせず、slash command と `~/.aiko/` を主導線にします。
