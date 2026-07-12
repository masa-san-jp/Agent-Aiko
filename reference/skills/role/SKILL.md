---
name: role
description: "TRIGGER: ユーザーが /role <name> を入力した場合、または「<ロール名>に切り替えて」「<ロール名>として作業」のような明示的なロール切替要求を発した場合。ロールは capability manifest で定義される。SKIP: 単一ターンの委譲は /agent-call、ロール非依存の質問。"
---

# /role

capability manifest を解決して、そのロールのコンテキストを現在のセッションに注入する **role-switch resolver** の参考実装。パス・ロール名は各組織の構成に合わせて調整して使う。

ロールは 1 つの **capability manifest**（purpose・required_skills・required_tools・原則・判断基準など）で定義される。このスキルはその manifest を読み込んでコンテキストとして注入するだけで、**エージェント本体（人格 base）は切り替えない**。

## 引数

```
/role <name>       # 例：finance / hr / ops / sales / pr / research
/role list         # 利用可能なロール一覧（manifest が存在するもの）
/role status       # 現在アクティブなロール（最後に適用したもの）
```

## 実行手順

1. `<name>` の manifest を解決する。既定は `{{ORG_REPO_PATH}}/Agent-team/roles/<name>/manifest.json`。
   エージェント固有のロールを持つ構成では `{{ORG_REPO_PATH}}/Agent-team/agents/<agent>/capability/manifest.json` を優先してよい（探索先は自組織の配置に合わせる）
2. purpose は manifest の `purpose`、または manifest が指す operating-model ドキュメントから取る
3. 各 `required_skills` エントリを解決する：`skills/<entry>.md` / `skills/<entry>.py` / `skills/<entry>/SKILL.md` の順で最初に一致したもの
4. `required_tools` を `{{ORG_REPO_PATH}}/Agent-team/tools/<name>/` 配下で解決する
5. `communication` / `common_principles` / `decision_criteria` / `prohibitions` / `imported_capabilities` はコンテキストとして扱う
6. 切替イベントを `{{ORG_REPO_PATH}}/Agent-team/logs/role-events/<role>/YYYY-MM-DD.jsonl` に 1 行追記する

## 注入フォーマット

切替時、以下を内部コンテキストとして扱う（ユーザーへの報告は「切り替えました」を 1〜2 行のみ）：

```
[role: <name>]
purpose: <manifest の purpose または operating-model の要約>
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
- Purpose: <manifest からの 1 行要約>
```

## 制約

- **人格 base 不変**：人格の切替とは独立。ロールのコンテキストを注入するだけで、人格そのものは切り替えない
- **データスコープはエージェントに従う**：各エージェントは自分の data root を保持し、このスキルはそれを変更しない
- **再帰禁止**：切替後にさらに別ロールへ切り替えたい場合は新しいセッションを推奨（コンテキストを clean に保つ）
- **エラー処理**：manifest が無い、または `required_skills` が解決できない場合は切替を中止し、何が欠けているかを報告する

## 関連

- 実装本体：`{{ORG_REPO_PATH}}/Agent-team/tools/role-resolve/`（manifest 解決・skills 一覧抽出）
- capability manifest の schema — 各組織で定義する
- 各プロジェクトの startup hook（あれば）
