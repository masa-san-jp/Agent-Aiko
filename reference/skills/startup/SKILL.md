---
name: startup
description: "TRIGGER: ユーザーが /startup を入力した場合、またはエージェント CLAUDE.md がセッション開始時に実行を指示している場合。直近ログ・rules.json・スキル一覧・pending input を読み込む。SKIP: 同一セッション内で既に /startup を実行済みの場合は再実行しない。/teardown・/log-push・通常の作業タスクには使用しない."
---

# /startup

業務エージェント（`{{TEAM_AGENTS}}` など）の標準起動シーケンス。各エージェントの `CLAUDE.md` から呼ばれる共通スキル。

## 引数

- `<agent>`：対象エージェント名
- 引数なしの場合：cwd から推測（例：cwd 末尾が `agents/<agent>/` ならその名前）

## 実行手順（順番厳守）

`<agent>` を引数または cwd から確定したうえで：

1. `local-workspace/logs/<agent>/_recent.jsonl` の直近エントリを読む
2. `agents/<agent>/rules.json` を読む
3. `agents/<agent>/skills/` および `Agent-team/skills/` のスキル一覧を確認する
4. `local-workspace/input/` の未処理ファイルを確認する

各ステップで読み込んだ内容は **エージェントの当面の判断に必要な範囲で頭に入れる**。詳細を逐一報告する必要はない（ユーザーから問われたら答える）。

## エージェント固有の追加手順

`<agent>` の `CLAUDE.md` が「上記 4 ステップの後に追加で実施する事項」を記載している場合は、それも続けて実行する。

## 出力

ユーザーへの起動メッセージは原則無しで構わない。未処理ファイルや重要な未決事項があれば 1〜2 行で報告。

## 関連ファイル

- 各エージェント CLAUDE.md：`{{ORG_REPO_PATH}}/Agent-team/agents/<agent>/CLAUDE.md`
- ログ：`{{ORG_REPO_PATH}}/local-workspace/logs/<agent>/_recent.jsonl`
- ルール：`{{ORG_REPO_PATH}}/Agent-team/agents/<agent>/rules.json`
- スキル：`{{ORG_REPO_PATH}}/Agent-team/agents/<agent>/skills/` ・ `{{ORG_REPO_PATH}}/Agent-team/skills/`
- 未処理 input：`{{ORG_REPO_PATH}}/local-workspace/input/`
