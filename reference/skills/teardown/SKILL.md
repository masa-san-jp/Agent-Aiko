---
name: teardown
description: "TRIGGER: ユーザーが /teardown を入力した場合、またはエージェント CLAUDE.md がセッション終了時に実行を指示している場合。per-agent ログ更新・週次 self/peer review（金曜）・git push を一括実行。SKIP: セッション継続中・作業の途中・セッション終了表現とログ/push 言及が両方ある場合は /log-push を優先（より広範囲をカバー）."
---

# /teardown

業務エージェント（`{{TEAM_AGENTS}}` など）の標準終了シーケンス。各エージェントの `CLAUDE.md` から呼ばれる共通スキル。

## 引数

- `<agent>`：対象エージェント名
- `[--peer-review]`：金曜の相互レビュー対象週なら付与
- 引数なしの場合：cwd から推測

## 実行手順（順番厳守）

1. `local-workspace/logs/<agent>/current.jsonl` を `update_log` テンプレ（`{{ORG_REPO_PATH}}/Agent-team/skills/update_log.md`）で追記更新する
2. 金曜の場合：`{{ORG_REPO_PATH}}/Agent-team/skills/self_review.md` に従って自己レビューを実施
   - `--peer-review` 指定または対象エージェントの場合、当該週なら相互レビューも実施（ローテーションは `peer_review.md` 参照）
3. `{{ORG_REPO_PATH}}/Agent-team/skills/git_push.md` の手順で push する

## 関連と差別化

| | `/teardown` | `/log-push`（任意・組織で構築する場合） |
|---|---|---|
| 対象 | 業務エージェント単独の終了処理 | プロジェクト横断（agents + 公開ログ） |
| ログ追記 | per-agent JSONL のみ | per-agent JSONL + dev-logs.md + 公開ログ |
| レビュー | 金曜の self/peer review 含む | 含まない |
| git push | git_push スキル経由（per-agent push） | リポ全体 push |
| 用途 | エージェント単位の整然とした終了 | セッション横断の総まとめ・公開記録 |

セッション終了表現とログ／push 言及の両方が出た場合は、組織で広範囲な `/log-push` を別途構築している場合はそちらを優先。各エージェント単独の節目（業務完了報告など）では `/teardown` を使う。

## 関連ファイル

- update_log テンプレ：`{{ORG_REPO_PATH}}/Agent-team/skills/update_log.md`
- 自己レビュー：`{{ORG_REPO_PATH}}/Agent-team/skills/self_review.md`
- 相互レビュー：`{{ORG_REPO_PATH}}/Agent-team/skills/peer_review.md`
- git push：`{{ORG_REPO_PATH}}/Agent-team/skills/git_push.md`
- per-agent ログ：`{{ORG_REPO_PATH}}/local-workspace/logs/<agent>/current.jsonl`
