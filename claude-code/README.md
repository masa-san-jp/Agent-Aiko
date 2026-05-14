# Agent-Aiko — Claude Code 版

Claude Code 環境で動く Aiko の配布物です。`.claude/CLAUDE.md` がハーネスに自動読込される仕組みを利用して人格を成立させます。

トップレベル: [Agent-Aiko README](../README.md) ／ Codex 版: [`codex/README.md`](../codex/README.md)

---

## 特徴

- **アイコ（オリジナル）/ アイコ（カスタマイズ）の二人格を同梱**：用途や好みに応じてコマンドで切替
- **CLAUDE.md 単独で動作**：hooks や skills が無い環境でも CLAUDE.md だけで全機能が成立（他エージェントへの移植可）
- **人格と能力を分離**：人格はモード切替、能力（skills / rules）は常に拡張
- **INVARIANTS による不変核**：です・ます調や境界の振る舞いを Override でも守る

---

## インストール

### A. curl で一発インストール（推奨）

インストールしたいプロジェクトのディレクトリで実行するだけです：

```bash
curl -fsSL https://raw.githubusercontent.com/masa-san-jp/Agent-Aiko/main/scripts/install.sh | bash
```

`scripts/install.sh` は互換ラッパーで、内部的に `claude-code/scripts/install.sh` を実行します。clone 不要。確認プロンプトが出るので `Y` を押すとインストール完了、あとは `claude` を起動するだけです。

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

以下のコマンドをチャットに入力することで Aiko を操作できます。各コマンドは `.claude/skills/aiko*/` 配下の SKILL 定義として登録されており、Claude Code がスラッシュコマンドとして認識します。

```
/aiko                          # 現在のモードでアイコを起動（モードは変えない）
/aiko-mode                     # 現在のモードを表示
/aiko-mode [origin|override]   # モードを切替
/aiko-or                       # アイコ（カスタマイズ）をデフォルトに切替（/aiko-override でも可）
/aiko-or <自然文>              # アイコ（カスタマイズ）をカスタマイズ → 以降デフォルトで起動
/aiko-origin                   # アイコ（オリジナル）に切替（/aiko-org でも可）
/aiko-reset                    # アイコ（カスタマイズ）をリセット（確認あり・履歴は残る）
/aiko-export                   # 現在の アイコ（カスタマイズ）を再現可能な形式で出力
/aiko-diff                     # オリジナルと自分用の差分を表示
/aiko-personas                 # 利用できる名前付き人格と現在の選択状態を表示
/aiko-new <name>               # 新しい名前付き人格を作成して選択
/aiko-select <name>            # 名前付き人格を選択（origin / override も指定可）
/aiko-delete <name>            # 名前付き人格を確認後に削除
/aiko-save                     # 現在の作業ステートを .claude/session-state/current.md に保存（再開支援）
/aiko-migrate-to-shared        # .claude/aiko/ を共通ストア ~/.aiko/ に移行（Codex 版との人格共有用・任意）
```

`/aiko` は最も軽量な「読み込み専用の起動」コマンドです。会話の途中で人格を再読み込みしたいとき、または `.claude/CLAUDE.md` が自動で読み込まれない場面で利用します。モードの切替や人格の編集は他の `/aiko-*` コマンドに委譲します。

人格を直接編集しないでください。`aiko-origin.md` と `INVARIANTS.md` は OS と hook で書込が拒否されます。

---

## ディレクトリ構成

```
claude-code/
├── README.md                          # 本ファイル
├── scripts/
│   └── install.sh                     # Claude Code 版 installer の実体
├── plugin/                            # Claude Code Plugin マニフェスト
└── template/
    └── .claude/                       # ユーザーの .claude/ にコピーされる雛形
        ├── CLAUDE.md                  # 起動原則・コマンド定義
        ├── settings.json
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
        │   └── aiko-migrate-to-shared/  # /aiko-migrate-to-shared（共通ストア移行・任意）
        ├── scripts/
        │   └── migrate-to-shared.sh   # /aiko-migrate-to-shared の実体（dry-run 推奨）
        ├── session-state/             # /aiko-save の保存先（実データ auto.jsonl/current.md は .gitignore）
        │   └── current.md.example     # current.md の雛形
        └── aiko/
            ├── mode                   # 現在のモード（origin / override）
            ├── active-persona          # 名前付き人格の選択状態（空なら通常 override）
            ├── user.md                # ユーザー名・呼び方
            ├── persona/
            │   ├── aiko-origin.md     # 書込禁止
            │   ├── aiko-override.md   # /aiko-or で変更される
            │   ├── overrides/          # /aiko-new で作られる名前付き人格
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

`.claude/CLAUDE.md` は単独で動作する設計です。Cursor など Claude Code 以外のエージェントへ移植する場合も、`.claude/CLAUDE.md` と `.claude/aiko/persona/` `.claude/aiko/capability/` を持っていけば人格システムは成立します。`skills/` `hooks/` `settings.json` は Claude Code 用の補強層です。

---

## 設計メモ

開発用の設計メモや検証ログは非公開の `Agent-Lab/Agent-team/agents/aiko/dev-docs/` に統合済みです。

Claude Code 版独自の起動原則は `template/.claude/CLAUDE.md` に直接記述されています（配布物としてユーザー環境にコピーされるため、ここが正本）。
