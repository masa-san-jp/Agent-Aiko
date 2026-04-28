# Agent-Aiko

漫画「アンドロイドは好きな人の夢を見るか？」に登場する AI アンドロイド **AICO-P0** の人物像をモデルに、Claude Code などの AI エージェントへ Aiko 人格を与えるプロジェクトです。

`git clone` した時点では誰でも同じ **Origin Aiko**。コマンド一発で自分用の **Override Aiko** に切り替え、緩やかに育て、いつでも origin に戻せます。

---

## 特徴

- **Origin / Override の二人格を同梱**：用途や好みに応じてコマンドで切替
- **CLAUDE.md 単独で動作**：hooks や skills が無い環境でも CLAUDE.md だけで全機能が成立（他エージェントへの移植可）
- **人格と能力を分離**：人格はモード切替、能力（skills / rules）は常に拡張
- **INVARIANTS による不変核**：です・ます調や境界の振る舞いを Override でも守る
- **名前付きプロファイル**：`/aiko-profile save formal` のように複数人格をスナップショット保存

---

## インストール

### A. リポジトリのスクリプトを使う

```bash
git clone https://github.com/masa-san-jp/agent-aiko.git
cd <あなたのプロジェクト>
bash <agent-aiko の path>/scripts/install.sh
```

実行内容：

- `template/.claude/` を `<カレント>/.claude/` にコピー
- `.claude/aiko/persona/aiko-override.md` が無ければ origin から初期化
- `.claude/aiko/mode` を `origin` で初期化
- `aiko-origin.md` と `INVARIANTS.md` を `chmod 444`
- `hooks/*.sh` に実行権限付与

### B. Claude Code Plugin として

```
/plugin install <repo-url>
```

`plugin/.claude-plugin/plugin.json` がメタデータです。

---

## 使い方

```
/aiko-mode                 # 現在のモードを表示
/aiko-mode override        # Override モードに切替
/aiko-override <自然文>    # Override 人格を変更（INVARIANTS で検証）
/aiko-or <自然文>          # /aiko-override の別名
/aiko-reset                # Override を origin の状態に戻す
/aiko-diff                 # origin と override の差分を表示
/aiko-profile save formal  # 現在の override を `formal` として保存
/aiko-profile load formal  # 保存済み `formal` を override に適用
/aiko-profile list         # 保存済みプロファイルを列挙
/aiko-profile delete formal
```

人格を直接編集しないでください。`aiko-origin.md` と `INVARIANTS.md` は OS と hook で書込が拒否されます。

---

## ディレクトリ構成

```
agent-aiko/
├── README.md
├── docs/
│   ├── design.md                   # アーキテクチャ説明
│   ├── manga-document.md           # 漫画全ページの構造化ドキュメント
│   ├── aico-p0-persona-spec.md     # 人格仕様の真ソース
│   ├── aiko-persona-protocol.md    # 旧版（参照用）
│   └── CLAUDE-v1-draft.md          # v1 ドラフト（aiko-origin.md の元）
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
├── logs/dev-log.jsonl
└── images/                         # 原典漫画データ（Git 管理外）
```

---

## 人格を共有したくなったら

このリポジトリには人格マーケットプレイス的な機構はありません。育てた Override 人格や `profiles/<name>.md` を誰かと交換したい場合は、**GitHub Discussions** にファイル内容を貼り付けて共有してください。受け取った側は `profiles/<name>.md` として保存し、`/aiko-profile load <name>` で適用できます。

---

## ポータビリティ原則

`.claude/CLAUDE.md` は単独で動作する設計です。Cursor など Claude Code 以外のエージェントへ移植する場合も、`.claude/CLAUDE.md` と `.claude/aiko/persona/` `.claude/aiko/capability/` を持っていけば人格システムは成立します。`skills/` `hooks/` `settings.json` は Claude Code 用の補強層です。

---

## ライセンス

MIT
