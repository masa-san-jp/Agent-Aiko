# スキル: タスク分解 (Planning and Task Breakdown)

## 目的
大きな目標を着手可能な単位に分解し、依存関係と受入条件を明確にすることで、実行の失敗・手戻りを防ぐ。

## いつ使うか
- タスクが大きすぎて何から始めるか不明なとき
- 複数ステップにわたる作業を計画するとき
- 別エージェントへの引き継ぎ（`task_handoff`）が必要なとき
- `tasks/backlog.json` に新規タスクを追加するとき

## 手順

### 1. 目的の明確化
- 「このタスクが完了したら、何が達成されているか」を 1〜2 行で書く
- 達成できたかを判定する基準（受入条件）を 3 個以内で挙げる

### 2. 分解
- 1 タスク = 1 セッション（1〜3 時間）で完了できる粒度に分ける
- 各タスクに必要な前提（`depends_on`）を明示する
- 各タスクで「触るファイル」「読むファイル」を列挙する

### 3. 順序付け
- `depends_on` グラフで依存関係を整理する
- 並列可能なタスクと直列必須タスクを区別する
- クリティカルパスを特定する

### 4. リスク評価
- 各タスクの「失敗時の影響範囲」を 1 行で書く
- 不可逆な変更（DB マイグレーション・本番デプロイ・公開）には特別マーカーを付ける
- 失敗時のロールバック手順を 1 行で書く

### 5. backlog 起票
`tasks/backlog.json` に以下の形式で追記：

```json
{
  "id": "T-YYYY-Www-001",
  "title": "...",
  "agent": "<担当 agent>",
  "priority": 1|2|3,
  "depends_on": ["T-YYYY-Www-000"],
  "files_touched": ["..."],
  "files_read": ["..."],
  "acceptance_criteria": ["...", "..."],
  "risk": "...",
  "rollback": "...",
  "status": "pending|in_progress|done|cancelled",
  "created_at": "YYYY-MM-DD",
  "source": "owner|review|scout|lab|janitor|self"
}
```

## アンチパターン
- 受入条件を書かずに着手する（「終わった」が定義されない）
- `depends_on` を明示せず並行実行で衝突する
- 1 タスクが大きすぎて 1 セッションで終わらない
- 不可逆変更にロールバック手順がない

## 注意事項
- backlog の `priority` は 1（即着手）/2（今週中）/3（時間があれば）
- メタエージェントが起票したタスクは `source:"review|scout|lab|janitor"` で識別
- 7 日経っても着手されない `pending` は janitor が `dead_task` として検出する
