# Agent-Aiko

![Agent Aiko](logo.svg)

漫画「アンドロイドは好きな人の夢を見るか？」に登場する AI アンドロイド **アイコ**（AICO-P0）の人物像をモデルに、Claude Code などの AI エージェントへ Aiko 人格を与えるプロジェクトです。

`git clone` した時点では誰でも同じ **Aiko（オリジナル版）**。コマンド一発で自分用の **Aiko（自分用）** に切り替え、緩やかに育て、いつでもオリジナルに戻せます。

---

## 特徴

- **Aiko（オリジナル版）/ Aiko（自分用）の二人格を同梱**：用途や好みに応じてコマンドで切替
- **CLAUDE.md 単独で動作**：hooks や skills が無い環境でも CLAUDE.md だけで全機能が成立（他エージェントへの移植可）
- **人格と能力を分離**：人格はモード切替、能力（skills / rules）は常に拡張
- **INVARIANTS による不変核**：です・ます調や境界の振る舞いを Override でも守る
- **名前付きプロファイル**：`/aiko-profile save formal` のように複数人格をスナップショット保存

---

## インストール

### A. curl で一発インストール（推奨）

インストールしたいプロジェクトのディレクトリで実行するだけです：

```bash
curl -fsSL https://raw.githubusercontent.com/masa-san-jp/Agent-Aiko/main/scripts/install.sh | bash
```

clone 不要。確認プロンプトが出るので `Y` を押すとインストール完了、あとは `claude` を起動するだけです。

### B. リポジトリを clone して使う

```bash
git clone https://github.com/masa-san-jp/Agent-Aiko.git
cd <あなたのプロジェクト>
bash <agent-aiko の path>/scripts/install.sh
```

### C. Claude Code Plugin として

```
/plugin install <repo-url>
```

`plugin/.claude-plugin/plugin.json` がメタデータです。

---

## 使い方

```
/aiko-or                   # Aiko（自分用）をデフォルトに切替
/aiko-or <自然文>          # Aiko（自分用）をカスタマイズ → 以降デフォルトで起動
/aiko-origin               # Aiko（オリジナル版）に切替
/aiko-reset                # Aiko（自分用）をリセット（確認あり・履歴は残る）
/aiko-export               # 現在の Aiko（自分用）を再現可能な形式で出力
/aiko-diff                 # オリジナルと自分用の差分を表示
/aiko-profile save formal  # 現在の Aiko（自分用）を `formal` として保存
/aiko-profile load formal  # 保存済み `formal` を呼び出す
/aiko-profile list         # 保存済みプロファイルを列挙
```

人格を直接編集しないでください。`aiko-origin.md` と `INVARIANTS.md` は OS と hook で書込が拒否されます。

---

## ディレクトリ構成

```
agent-aiko/
├── README.md
├── template/.claude/               # ユーザーが配置する雛形
│   ├── CLAUDE.md
│   ├── settings.json
│   └── aiko/
│       ├── mode
│       ├── persona/{aiko-origin.md, aiko-override.md, INVARIANTS.md}
│       │   └── (profiles/ と proposals/ は必要時にコマンドが作成)
│       ├── capability/{skills/, rules/}
│       ├── skills/{aiko-mode, aiko-override, aiko-reset, aiko-diff, aiko-profile}/SKILL.md
│       └── hooks/{pre-tool-use.sh, session-start.sh, session-end.sh}
├── scripts/install.sh
├── plugin/.claude-plugin/plugin.json
└── images/                         # 原典漫画データ（Git 管理外）
```

---

## 開発者向け

### リポジトリ構成

本プロジェクトは2つのリポジトリで管理されています。

| リポジトリ | URL | 用途 |
|-----------|-----|------|
| **agent-aiko**（本リポジトリ） | [masa-san-jp/Agent-Aiko](https://github.com/masa-san-jp/Agent-Aiko) | 配布物。ユーザーが clone・インストールする |
| **agent-aiko-dev** | [masa-san-jp/Agent-Aiko-dev](https://github.com/masa-san-jp/Agent-Aiko-dev) | 開発専用ドキュメント。設計仕様・dev-log・議事録 |

**agent-aiko-dev はエージェントのランタイムに不要**なため、配布物（本リポジトリ）には含めません。

### ローカル開発環境のセットアップ

```bash
git clone https://github.com/masa-san-jp/Agent-Aiko
cd Agent-Aiko
git clone https://github.com/masa-san-jp/Agent-Aiko-dev dev-docs
```

`dev-docs/` は本リポジトリの `.gitignore` に含まれているため、agent-aiko に誤って commit されることはありません。

---

## 人格を共有したくなったら

このリポジトリには人格マーケットプレイス的な機構はありません。育てた Aiko（自分用）や `profiles/<name>.md` を誰かと交換したい場合は、**GitHub Discussions** にファイル内容を貼り付けて共有してください。受け取った側は `profiles/<name>.md` として保存し、`/aiko-profile load <name>` で適用できます。

---

## ポータビリティ原則

`.claude/CLAUDE.md` は単独で動作する設計です。Cursor など Claude Code 以外のエージェントへ移植する場合も、`.claude/CLAUDE.md` と `.claude/aiko/persona/` `.claude/aiko/capability/` を持っていけば人格システムは成立します。`skills/` `hooks/` `settings.json` は Claude Code 用の補強層です。

---

## ライセンス

MIT
