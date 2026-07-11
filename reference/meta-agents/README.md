# Meta-Agents

業務エージェント横断で「**継続的な品質維持**」を担う 4 役割。日次で自動起動します。

---

## 4 役割の責務分担

| エージェント | 観測対象 | 提案出力 | 削除実行 | 外部参照 |
|------------|---------|---------|---------|---------|
| **reviewer** | 内部ログ・rules・schema | rules.json の pending_updates / backlog | 禁止 | 禁止 |
| **scout** | 外部ベストプラクティス（whitelist） | scout_sources.json / backlog | 禁止 | **可（whitelist のみ）** |
| **lab** | 内部スキル・ログ | backlog（skill 切り出し提案） | 禁止 | 禁止 |
| **janitor** | リポジトリ全体 | 削除提案・統合提案 | **禁止**（提案のみ） | URL 検証のみ |

責務が完全に分離されているため、単一エージェントが暴走しても被害が局所化されます。

---

## 出力先（共通）

すべてのメタエージェントは以下の 4 経路に出力します。

1. **JSONL findings**: `Agent-team/logs/reviews/YYYY-Www-{role}.jsonl`
2. **rules.json pending_updates**: 該当エージェントのルール変更提案（reviewer のみ）
3. **backlog タスク**: `tasks/backlog.json` に着手可能タスクとして起票
4. **dev-logs.md ブロック**: 週次サマリー

人間（オーナー）は pending_updates と backlog を承認することで運用に反映します。
**自動承認は一切ありません**。

---

## 自動起動の仕組み

```
SessionStart hook → tools/meta-check.sh
  ↓ 24h 経過したロール検出
.pending/{role} marker 作成
  ↓
スキル: run-meta-pending → marker 検知
  ↓
Agent ツール: subagent_type={role} で並列起動
  ↓
完了後: .pending/{role} 削除 / .last-run-{role} 更新
```

クラウド cron は使いません。Claude Code セッション開始時のみコスト発生。

---

## 起動サイクル

| 役割 | 自動起動条件 | フル踏査タイミング |
|------|------------|------------------|
| reviewer | 24h 経過（月初は健全性メトリクス併発） | - |
| scout | 24h 経過（差分のみ） | 土曜：全 active sources 総当たり / 月初：whitelist 全件審査 |
| lab | 24h 経過 | - |
| janitor | 24h 経過（light モード：4 カテゴリのみ） | 金曜：full モード（10 カテゴリ＋削除提案） |

scout の週次フル・月次審査、janitor の週次フルは自動化スコープ外です。
ユーザーが `/meta scout` `/meta janitor` で手動起動してください。

---

## ファイル

| ファイル | 内容 |
|---------|------|
| `reviewer.md` | 標準化・整合・再発防止。ルーブリック判定 + dedup |
| `scout.md` | 社外 BP 観測。whitelist + インチキ排除 6 条件 |
| `lab.md` | スキル横展開。重複検出・横断パターン検出 |
| `janitor.md` | クラフト検出。light/full の 2 モード |

各ファイルは Agent ツールから `subagent_type={role}` で参照される定義です。
配置先は `Agent-team/.claude/agents/{role}.md`。

---

## カスタマイズポイント

各組織で調整が必要な箇所：

1. **reviewer**: 観測対象のエージェント名（`{{TEAM_AGENTS}}` プレースホルダ）
2. **scout**: ホワイトリスト（`Agent-team/skills/scout_sources.json` を別途作成）
3. **lab**: 観測対象のスキルディレクトリパス
4. **janitor**: 容量上限・ファイル年齢の閾値

ファイル内の `{{...}}` プレースホルダを置換して使ってください。
