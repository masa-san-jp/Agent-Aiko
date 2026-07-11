---
name: role
description: "TRIGGER: ユーザーが /role <name> を入力した場合、または「<ロール名>に切り替えて」「<ロール名>として作業」のような明示的なロール切替要求を発した場合。正本は capability manifest。legacy roles/<name>/rules.json は削除前互換の redirect stub としてのみ扱う。SKIP: 単一ターンの委譲は /agent-call、ロール非依存の質問。"
---

# /role

capability manifest を解決してロールのコンテキストを現在のセッションに注入する **role-switch resolver** の参考実装。パス・ロール名は各組織の構成に合わせて調整して使う。このスキルは**エージェント本体（人格 base）は切り替えない**。ロールの manifest・operating model・required_skills・required_tools を注入するだけ。正本は capability manifest であり、legacy な `roles/<name>/rules.json` は削除前互換の redirect stub としてのみ扱う。

## 引数

```
/role <name>       # 例：finance / hr / ops / sales / pr / research / grants
/role list         # 利用可能なロール一覧
/role status       # 現在アクティブなロール（最後に適用したもの）
```

## 実行手順

1. manifest を次の順で解決する：`agents/<agent>/overrides/<name>/capability/manifest.json` → `agents/<name>/capability/manifest.json` → `agents/<agent>/overrides/<owner>/capability/imported/<name>/manifest.json`
2. 削除前互換としてのみ、上記いずれも見つからない場合に `roles/<name>/rules.json` redirect stub の `moved_to` ターゲットを読む。`ROLE_RESOLVE_LEGACY_ROLES=0` でこのフォールバックを無効化できる
3. purpose は `capability/<docs_dir>/operating-model.md`、次いで manifest の `purpose` から取る。legacy な `roles/<name>/CLAUDE.md` は正本ではない
4. 各 `required_skills` エントリを解決する：`skills/<entry>.md` / `skills/<entry>.py` / `skills/<entry>/SKILL.md` の順で最初に一致したもの
5. `required_tools` を `{{ORG_REPO_PATH}}/Agent-team/tools/<name>/` 配下で解決する
6. `communication` / `common_principles` / `decision_criteria` / `prohibitions` / `imported_capabilities` はコンテキストとして扱う
7. 切替イベントを `{{ORG_REPO_PATH}}/Agent-team/logs/role-events/<role>/YYYY-MM-DD.jsonl` に 1 行追記する

## 注入フォーマット

切替時、以下を内部コンテキストとして扱う（ユーザーへの報告は「切り替えました」を 1〜2 行のみ）：

```
[role: <name>]
purpose: <operating model または manifest の purpose>
source: <persona-capability | business-persona-capability | imported-persona-capability | legacy-redirect>
manifest_file: <解決された manifest のパス>
communication: <manifest communication>
common_principles: <manifest common_principles>
decision_criteria: <manifest decision_criteria>
prohibitions: <manifest prohibitions>
imported_capabilities: <manifest imported_capabilities>
required_skills:
  - <skill1>: <SKILL.md description の先頭 80 文字>
  - <skill2>: ...
required_tools:
  - <tool1>: <tools/<name>/README.md の先頭 80 文字（あれば）>
```

## 切替報告（ユーザー向け）

```
ロール "<name>" に切り替えました。
- Required skills: <件数>（例：agent-call / log-push / ...）
- Required tools: <件数>（例：agent-call / peer-inbox / ...）
- Purpose: <operating model または manifest からの 1 行要約>
```

## 互換期間中の persona 紐付けロール

`bound_persona` は旧ロール層の legacy 情報。新しい正本は各エージェント側の `capability/manifest.json`。

- 名前付きエージェントは、その capability が存在する場合はそちらを優先
- 業務ロールは `agents/<name>/capability/manifest.json` を優先
- 別エージェントへ統合されたロールは、その統合先の imported capability 経由で解決

## 制約

- **人格 base 不変**：人格の切替とは独立。互換コンテキストを注入するだけで、人格そのものは切り替えない
- **データスコープは人格に従う**：各エージェントは自分の data root を保持し、このスキルはそれを変更しない
- **再帰禁止**：切替後にさらに別ロールへ切り替えたい場合は新しいセッションを推奨（コンテキストを clean に保つ）
- **エラー処理**：manifest が無い、または `required_skills` が解決できない場合は切替を中止し、何が欠けているかを報告する
- **削除前検証**：`ROLE_RESOLVE_LEGACY_ROLES=0` でも resolver が通ることを確認する

## 関連

- 実装本体：`{{ORG_REPO_PATH}}/Agent-team/tools/role-resolve/`（解決ロジック・skills 一覧抽出）
- capability manifest の schema — capability manifest の正本 schema
- 各プロジェクトの startup / consistency-check hook（あれば）
