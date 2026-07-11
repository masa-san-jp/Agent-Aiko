# Workflow Templates

業務シーンで再利用する手順書（人が読んで判断する）。

スキルが「いつ・何を実行するか」を内包するのに対し、テンプレートは
「**手順を読んで自分で判断・実行する**」もの。各エージェントが必要に応じて参照します。

---

## 一覧

| テンプレート | 用途 |
|------------|------|
| `peer_review.md` | 別チームへ相互レビューを返す |
| `self_review.md` | 週次の自己点検 |
| `idea_refine.md` | 生のアイデアを構造化 |
| `context_engineering.md` | コンテキスト管理を意識 |
| `planning_and_task_breakdown.md` | 大目標を分解 |
| `task_handoff.md` | 別エージェントに引き継ぐ |

---

## 配置先

`{{ORG_REPO_PATH}}/Agent-team/skills/` 配下にそのまま配置してください。

---

## 各組織で必要に応じて追加すべきもの

このパッケージには含まれていない、各組織で必要に応じて作る手順書例：

- `update_log.md` — per-agent ログの追記手順（`Agent-team/skills/`）
- `git_push.md` — push 前のチェック手順
- `update_rules.md` — rules.json 変更プロセス
- `archive_reference.md` — reference ドキュメントのアーカイブ
- `research_reference.md` — reference ドキュメント調査

これらは組織のリポジトリ規約・git 運用ルールに依存するため、各組織で記述してください。
