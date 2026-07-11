# INSTALL.md — 完全自動導入手順書（Claude Code への指示書）

> **位置づけ**：このファイルは「**そのまま動くものをすぐ欲しい**」場合の手順書です。
> 多くの組織では**部分採用**で十分です（例：rules/ だけ、meta-agents/ 4 種だけ）。
> **設計判断の根拠を理解してから自前で組み立てたい**場合は `DESIGN-PHILOSOPHY.md` から読んでください。

このファイルは、**受け取った組織の Claude Code に直接渡して実行させる**ための手順書です。
ユーザーが「`reference/INSTALL.md` を読んで、この手順に従って `.claude/` 配下にセットアップして」と頼めば、
Claude Code が以下を順に実行します。

---

## 0. 事前確認（Claude Code が最初に行うこと）

### 0-1. ユーザーへの確認項目

以下の 6 項目を **1 回でまとめてユーザーに質問してください**（推奨テンプレ）：

```
セットアップに必要な情報を 6 項目まとめて確認させてください：

1. REFERENCE_ROOT — この INSTALL.md を含む reference/ ディレクトリの絶対パス
   （例：/Users/you/Downloads/Agent-Teams/reference）
2. ORG_REPO_PATH — セットアップ先リポの絶対パス
   （例：/Users/you/Dev/my-org-repo）
3. ORG_NAME — 組織名
   （例：MyOrg）
4. TEAM_AGENTS — 業務エージェント名のリスト（カンマ区切り、小文字英数字とハイフンのみ）
   （例：engineering, design, qa。後から追加可能、初期 1〜2 個でも OK）
5. DEFAULT_MODEL — デフォルト使用モデル
   （既定：claude-sonnet-4-6）
6. ルール配置スコープ
   （既定：project-local = ORG_REPO_PATH/.claude/rules/。
    複数プロジェクト跨ぎなら global = ~/.claude/rules/ も可）
```

ユーザーが部分回答（例：4 だけ未定）でもセットアップを進められます。`main` のような最小エージェント 1 個から始めて、後から追加してください。

これらをプレースホルダ値として記録：

```
{{REFERENCE_ROOT}}      = ユーザーの回答 1（INSTALL.md のあるディレクトリ。以降の cp はここを起点）
{{ORG_REPO_PATH}}       = ユーザーの回答 2
{{ORG_REPO_NAME}}       = リポジトリ名（パス末尾）
{{ORG_NAME}}            = ユーザーの回答 3
{{TEAM_AGENTS}}         = ユーザーの回答 4 をカンマ区切りで保持
{{DEFAULT_MODEL}}       = ユーザーの回答 5 または claude-sonnet-4-6
{{CLAUDE_RULES_DIR}}    = ユーザーの回答 6 に応じて
                          project-local 選択時: {{ORG_REPO_PATH}}/.claude/rules
                          global 選択時:        $HOME/.claude/rules
```

### 0-2. 依存環境チェック（MANDATORY）

以下を実行して、不足があればユーザーに通知して中断してください：

```bash
set -e

# 必須ツールチェック
for cmd in claude git bash python3; do
  command -v "$cmd" >/dev/null || { echo "ERROR: '$cmd' not found in PATH"; exit 1; }
done

# バージョン表示（記録用）
echo "== Dependencies =="
claude --version
git --version
bash --version | head -1
python3 --version

# パス・権限チェック
test -d "{{REFERENCE_ROOT}}" || { echo "ERROR: {{REFERENCE_ROOT}} does not exist"; exit 1; }
test -f "{{REFERENCE_ROOT}}/INSTALL.md" || { echo "ERROR: {{REFERENCE_ROOT}}/INSTALL.md not found — wrong path?"; exit 1; }
test -w "{{ORG_REPO_PATH}}" || { echo "ERROR: {{ORG_REPO_PATH}} is not writable"; exit 1; }
```

### 0-3. シェル変数のエクスポート

以降の全コマンドでこれらを参照します。Claude Code はセッション内で必ず最初にエクスポート + 業務エージェント配列を準備してください：

```bash
export REFERENCE_ROOT="{{REFERENCE_ROOT}}"
export ORG_REPO_PATH="{{ORG_REPO_PATH}}"
export ORG_REPO_NAME="{{ORG_REPO_NAME}}"
export ORG_NAME="{{ORG_NAME}}"
export DEFAULT_MODEL="{{DEFAULT_MODEL}}"
export CLAUDE_RULES_DIR="{{CLAUDE_RULES_DIR}}"
# agent-call.sh / peer-inbox.sh が参照する
export WORKPLACE_ROOT="$ORG_REPO_PATH"

# 業務エージェントは配列で保持（zsh / bash 両対応。"$VAR" の word-split に依存しない）
AGENTS=(engineering design qa)   # ← Claude Code が user 回答（カンマ→スペース→要素）から組み立てる
export TEAM_AGENTS_STR="${AGENTS[*]}"   # スペース区切り文字列（Python env var、表示用）
```

**重要（zsh 互換性）**：macOS Catalina (2019) 以降のデフォルトシェルは zsh。`for x in $VAR` は zsh で word-split されないため、以降のループは **必ず `"${AGENTS[@]}"` の配列構文**を使ってください。`for agent in $AGENTS` 形式は使用禁止。

### 0-4. OS 判定（sed の互換性）

以降の `sed -i` 呼び出しは macOS と Linux で構文が異なります：

```bash
case "$(uname)" in
  Darwin) SED_INPLACE=(sed -i '') ;;
  *)      SED_INPLACE=(sed -i) ;;
esac
"${SED_INPLACE[@]}" "s|FROM|TO|g" file
```

以降の手順では BSD 構文（macOS）で記載します。Linux では `''` を削除してください。

### 0-5. タイムゾーン

`scout_sources.json` などで日付を扱う際は **実行端末のローカル `YYYY-MM-DD`**（`date +%F`）を使ってください。
組織でタイムゾーンを統一する場合は `date -u +%F`（UTC）に揃えるか、運用ルールに明記してください。

---

## 1. ディレクトリ作成

**事前注意**：以降の全コマンドは `$ORG_REPO_PATH` を起点とします。確実な cwd を確保してください。

```bash
set -e  # 失敗時に中断
cd "$ORG_REPO_PATH"

mkdir -p "$CLAUDE_RULES_DIR"
mkdir -p .claude/agents
mkdir -p Agent-team/.claude/agents
mkdir -p Agent-team/agents/.claude/skills
mkdir -p Agent-team/agents/.claude/scripts
mkdir -p Agent-team/skills
mkdir -p Agent-team/logs/reviews/.pending
mkdir -p Agent-team/tasks
mkdir -p Agent-team/reviews/{self,peer,monthly}
mkdir -p Agent-team/tools/{agent-call,peer-inbox,codex}
```

業務エージェントのディレクトリ作成：

Section 0-3 で定義した `AGENTS` 配列を使います。

```bash
# エージェント名バリデーション（小文字英数字とハイフンのみ、先頭末尾ハイフン禁止、空文字禁止）
for agent in "${AGENTS[@]}"; do
  case "$agent" in
    ""|*[!a-z0-9-]*|-*|*-)
      echo "ERROR: invalid agent name: '$agent' (lowercase alnum + '-', no leading/trailing '-', no empty)"; exit 1 ;;
  esac
done

for agent in "${AGENTS[@]}"; do
  mkdir -p "Agent-team/agents/$agent"/{skills,schema,input,output,done}
done
```

---

## 2. ルールの配置（rules/）

`$REFERENCE_ROOT/rules/` 配下の 8 ファイルを `$CLAUDE_RULES_DIR/` にコピー（Section 0-1 で確定したスコープへ）：

```bash
mkdir -p "$CLAUDE_RULES_DIR"
cp "$REFERENCE_ROOT/rules/"*.md "$CLAUDE_RULES_DIR/"
ls "$CLAUDE_RULES_DIR/"  # 8 ファイル配置を確認
```

**プレースホルダ置換**: これらのファイルにはプレースホルダはありません。そのまま使えます。

---

## 3. メタエージェントの配置（meta-agents/）

`$REFERENCE_ROOT/meta-agents/` 配下の 4 ファイルを `Agent-team/.claude/agents/` にコピー：

```bash
cp "$REFERENCE_ROOT/meta-agents/"{reviewer,scout,lab,janitor}.md \
   "$ORG_REPO_PATH/Agent-team/.claude/agents/"
```

**プレースホルダ置換**：`{{TEAM_AGENTS}}` を実値（ユーザー回答 4）に置換します。

```bash
cd "$ORG_REPO_PATH/Agent-team/.claude/agents"
TEAM_AGENTS_LITERAL="<実値: 例 engineering, design, qa>"  # ← Claude Code が実値を埋め込む
"${SED_INPLACE[@]}" "s|{{TEAM_AGENTS}}|$TEAM_AGENTS_LITERAL|g" *.md
```

`${SED_INPLACE[@]}` は Section 0-4 で定義した OS 判定済みの sed 配列です。

---

## 4. スキルの配置（skills/）

`$REFERENCE_ROOT/skills/` 配下の 8 スキルを `Agent-team/agents/.claude/skills/` にコピー：

```bash
SKILLS=(agent-call delegate-suggest peer-inbox codex meta run-meta-pending startup teardown)
for s in "${SKILLS[@]}"; do
  cp -r "$REFERENCE_ROOT/skills/$s" "$ORG_REPO_PATH/Agent-team/agents/.claude/skills/"
done
```

**プレースホルダ置換**（Python で sed の特殊文字問題を回避、heredoc はクォート版で shell 干渉を防ぐ）：

```bash
cd "$ORG_REPO_PATH/Agent-team/agents/.claude/skills"
TEAM_AGENTS_STR="${TEAM_AGENTS_STR}" python3 - <<'PY'
import pathlib, os
team_agents = ", ".join(os.environ.get("TEAM_AGENTS_STR", "").split())
replacements = {
    "{{ORG_REPO_PATH}}": os.environ["ORG_REPO_PATH"],
    "{{DEFAULT_MODEL}}": os.environ["DEFAULT_MODEL"],
    "{{TEAM_AGENTS}}":   team_agents,
}
for p in pathlib.Path(".").rglob("SKILL.md"):
    s = p.read_text(encoding="utf-8")
    for k, v in replacements.items():
        s = s.replace(k, v)
    p.write_text(s, encoding="utf-8")
PY
```

**中間プレースホルダ check（推奨）**：このセクション完了直後にスコープを限定して receiver check：

```bash
bash "$REFERENCE_ROOT/_scripts/check-placeholders.sh" --receiver \
     --target "$ORG_REPO_PATH/Agent-team/agents/.claude/skills"
```

---

## 5. ワークフローテンプレートの配置（workflow-templates/）

`$REFERENCE_ROOT/workflow-templates/` 配下の 6 ファイルを `Agent-team/skills/` にコピー：

```bash
cp "$REFERENCE_ROOT/workflow-templates/"{peer_review,self_review,idea_refine,context_engineering,planning_and_task_breakdown,task_handoff}.md \
   "$ORG_REPO_PATH/Agent-team/skills/"
```

プレースホルダはありません。そのまま使えます。

---

## 6. 設定ファイルの作成（config-templates/）

### 6-1. AGENTS.md

```bash
cp "$REFERENCE_ROOT/config-templates/AGENTS.md.template" \
   "$ORG_REPO_PATH/Agent-team/AGENTS.md"

# 事務的な置換は自動で（ORG_REPO_PATH のみ）
python3 - <<'PY'
import pathlib, os
p = pathlib.Path(os.environ["ORG_REPO_PATH"]) / "Agent-team" / "AGENTS.md"
s = p.read_text(encoding="utf-8")
s = s.replace("{{ORG_REPO_PATH}}", os.environ["ORG_REPO_PATH"])
p.write_text(s, encoding="utf-8")
PY
```

その後、ユーザーと一緒に「チーム選択ガイド」のテーブルを業務エージェント名で埋めます（手編集）。

### 6-2. spec.json

```bash
cp "$REFERENCE_ROOT/config-templates/spec.json.template" \
   "$ORG_REPO_PATH/Agent-team/spec.json"

# 事務的な置換（project / organization）を自動化
python3 - <<'PY'
import pathlib, os
p = pathlib.Path(os.environ["ORG_REPO_PATH"]) / "Agent-team" / "spec.json"
s = p.read_text(encoding="utf-8")
s = (s.replace("{{ORG_REPO_NAME}}", os.environ["ORG_REPO_NAME"])
      .replace("{{ORG_NAME}}",      os.environ["ORG_NAME"]))
p.write_text(s, encoding="utf-8")
PY
```

残るのは手編集対象（`goals[]` 2 項目、`agents[]` 業務エージェント定義、`data_flows[]`、`{{AGENT_*_NAME}}` `{{AGENT_*_PURPOSE}}`）。

**最小 valid example**（後続スキルが読むため形式ブレを避ける）：

```json
{
  "project": "MyOrg-Workspace",
  "organization": "MyOrg",
  "goals": [
    "短期：MVP 開発",
    "中期：チーム間のレビュー文化定着"
  ],
  "agents": [
    {"name": "engineering", "purpose": "implementation", "inputs": [], "outputs": []},
    {"name": "design",      "purpose": "UI/UX design",   "inputs": [], "outputs": []}
  ],
  "data_flows": []
}
```

### 6-3. 各業務エージェントの CLAUDE.md と rules.json

各エージェントについてループで処理：

```bash
for agent in "${AGENTS[@]}"; do
  cp "$REFERENCE_ROOT/config-templates/CLAUDE.md.template" \
     "$ORG_REPO_PATH/Agent-team/agents/$agent/CLAUDE.md"
  cp "$REFERENCE_ROOT/config-templates/rules.json.template" \
     "$ORG_REPO_PATH/Agent-team/agents/$agent/rules.json"
done
```

プレースホルダ置換（Python で安全に）：

```bash
TEAM_AGENTS_STR="${TEAM_AGENTS_STR}" python3 - <<'PY'
import pathlib, os

org_repo = os.environ["ORG_REPO_PATH"]
agents = os.environ.get("TEAM_AGENTS_STR", "").split()

# Claude Code はこの辞書を実値で埋めて渡す。エージェントごとの purpose が異なるため反復構造で。
agent_purposes = {
    "engineering": "<実値: 例 implementation>",
    # "design": "...", "qa": "...", ...
}

for a in agents:
    purpose = agent_purposes.get(a, f"<{a} の役割の 1 行説明>")
    for fname in ("CLAUDE.md", "rules.json"):
        p = pathlib.Path(org_repo) / "Agent-team" / "agents" / a / fname
        s = p.read_text(encoding="utf-8")
        s = (s.replace("{{AGENT_NAME}}", a)
              .replace("{{AGENT_PURPOSE}}", purpose)
              .replace("{{ORG_REPO_PATH}}", org_repo))
        p.write_text(s, encoding="utf-8")
PY
```

**中間 receiver check**（spec.json と AGENTS.md の手編集対象は未完なので、`--target` を絞る）：

```bash
# 各業務エージェントの CLAUDE.md / rules.json は自動置換できる範囲を確認
for agent in "${AGENTS[@]}"; do
  bash "$REFERENCE_ROOT/_scripts/check-placeholders.sh" --receiver \
       --target "$ORG_REPO_PATH/Agent-team/agents/$agent"
done
```

**全体 receiver check は Section 11-5 まで延期**します（spec.json / AGENTS.md / scout_sources.json の手編集が未完のため、ここで全体 check すると false-positive が出る）。

---

## 7. tools の配置と SessionStart hook 登録

### 7-1. 同梱スクリプトの配置（完全実装）

`reference/tools/` の 3 スクリプトはすべて完全実装で同梱されています。コピーして実行権限を付与するだけで動作します。

```bash
mkdir -p "$ORG_REPO_PATH/Agent-team/tools/agent-call"
mkdir -p "$ORG_REPO_PATH/Agent-team/tools/peer-inbox"
mkdir -p "$ORG_REPO_PATH/Agent-team/agents/.claude/scripts"

cp "$REFERENCE_ROOT/tools/agent-call.sh"  "$ORG_REPO_PATH/Agent-team/tools/agent-call/agent-call.sh"
cp "$REFERENCE_ROOT/tools/peer-inbox.sh"  "$ORG_REPO_PATH/Agent-team/tools/peer-inbox/peer-inbox.sh"
cp "$REFERENCE_ROOT/tools/meta-check.sh"  "$ORG_REPO_PATH/Agent-team/agents/.claude/scripts/meta-check.sh"

chmod +x "$ORG_REPO_PATH/Agent-team/tools/agent-call/agent-call.sh"
chmod +x "$ORG_REPO_PATH/Agent-team/tools/peer-inbox/peer-inbox.sh"
chmod +x "$ORG_REPO_PATH/Agent-team/agents/.claude/scripts/meta-check.sh"
```

`meta-check.sh` はリポジトリ名による絞り込みを **環境変数 `META_CHECK_REPO_NAME`** で制御します（sed による分岐改変は不要）。設定したい場合は Section 7-3 の hook 定義で env を渡してください。

### 7-2. Codex（任意・組織で構築）

`reference/tools/` には Codex 連携スクリプトは含めていません。
ChatGPT 第二意見が不要な組織はスキップして OK。
必要な組織は `tools/README.md` の「Codex」セクションを参照して構築してください。

### 7-3. Claude Code 設定への登録（Python で安全に merge）

settings.json への追記は手編集だと JSON 構文エラーを起こしやすいため、Python で既存設定を保ったまま merge します。

```bash
SETTINGS_PATH="$ORG_REPO_PATH/.claude/settings.json"   # project-local 推奨
# あるいは global: SETTINGS_PATH="$HOME/.claude/settings.json"

SETTINGS_PATH="$SETTINGS_PATH" python3 - <<'PY'
import json, pathlib, os

path = pathlib.Path(os.environ["SETTINGS_PATH"])
path.parent.mkdir(parents=True, exist_ok=True)
data = json.loads(path.read_text()) if path.exists() else {}

org_repo = os.environ["ORG_REPO_PATH"]
org_name = os.environ.get("ORG_REPO_NAME", "")
meta_check = f"{org_repo}/Agent-team/agents/.claude/scripts/meta-check.sh"

# WORKPLACE_ROOT と META_CHECK_REPO_NAME を hook 側でも渡す（受け取り側 shell 環境に依存しないため）
command = f'WORKPLACE_ROOT="{org_repo}" META_CHECK_REPO_NAME="{org_name}" bash "{meta_check}"'

hook = {
    "matcher": "*",
    "hooks": [{"type": "command", "command": command}],
}

data.setdefault("hooks", {}).setdefault("SessionStart", []).append(hook)
path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"merged: {path}")
PY
```

JSON 構文確認：

```bash
python3 -c "import json; json.load(open('$SETTINGS_PATH'))" && echo "JSON OK"
```

---

## 8. .gitignore の更新

`$ORG_REPO_PATH/.gitignore` に **マーカー付きで追記**（再実行時の二重追記を防ぐ）：

```bash
GITIGNORE_FILE="$ORG_REPO_PATH/.gitignore"
BEGIN_MARK="# === BEGIN agent-team ==="
END_MARK="# === END agent-team ==="

# 既存マーカー間を削除（再実行時冪等化）
if [ -f "$GITIGNORE_FILE" ] && grep -qF "$BEGIN_MARK" "$GITIGNORE_FILE"; then
  "${SED_INPLACE[@]}" "/$BEGIN_MARK/,/$END_MARK/d" "$GITIGNORE_FILE"
fi

cat >> "$GITIGNORE_FILE" <<GITIGNORE_END
$BEGIN_MARK
# Meta-agent runtime markers（ローカル実行状態。チーム共有は logs/reviews/YYYY-Www-*.jsonl のみ）
Agent-team/logs/reviews/.pending/
Agent-team/logs/reviews/.last-run-*

# Per-agent input/output（schema は例外）
Agent-team/agents/*/input/*
!Agent-team/agents/*/input/schema.json
Agent-team/agents/*/output/*
!Agent-team/agents/*/output/schema.json
Agent-team/agents/*/done/

# agent-call cache
Agent-team/tools/agent-call/.cache/

# peer-inbox messages
Agent-team/tools/peer-inbox/inbox/

# Local workspace
local-workspace/
$END_MARK
GITIGNORE_END
```

**設計意図**：
- `.pending/` と `.last-run-*` は **ローカル実行状態**。SessionStart hook が端末ごとに作成・更新するため、Git に乗せると端末間で衝突する
- メタエージェントの**レビュー結果本体**（`Agent-team/logs/reviews/YYYY-Www-{reviewer,scout,lab,janitor}.jsonl`）は Git 管理対象。チーム共有が必要なのはこちら
- `local-workspace/` は scratch / 一時ファイル領域

---

## 9. 追加スクリプトの作成（オプション）

### 9-1. 同梱済み（再実装不要）

以下は Section 7-1 で完全実装が配置済です。**新規実装しないでください**：

- `Agent-team/tools/agent-call/agent-call.sh`
- `Agent-team/tools/peer-inbox/peer-inbox.sh`
- `Agent-team/agents/.claude/scripts/meta-check.sh`

### 9-2. 必要に応じて組織側で実装

以下は配布パッケージに含まれていません。必要になったら実装してください：

- `Agent-team/tools/codex/setup.sh` + `codex-ask`（ChatGPT 第二意見・任意）
- `Agent-team/skills/compress_logs.py`（current.jsonl → _recent.jsonl 圧縮）
- `Agent-team/skills/append_dev_log.py`（メタエージェント週次サマリー追記）
- `Agent-team/skills/sync_tasks.py`（backlog → active 抽出）

`tools/README.md` の「含まれていないスクリプト」セクションに仕様メモがあります。

---

## 10. scout_sources.json の作成（scout 使用時）

scout を使う場合は、ホワイトリストを `$REFERENCE_ROOT/config-templates/scout_sources.json.template` から作成してください：

```bash
cp "$REFERENCE_ROOT/config-templates/scout_sources.json.template" \
   "$ORG_REPO_PATH/Agent-team/skills/scout_sources.json"

# 事務的な置換を自動化（YYYY-MM-DD と ORG_NAME）
TODAY="$(date +%F)"   # ローカル TZ。UTC 統一なら $(date -u +%F)
python3 - <<'PY'
import pathlib, os
p = pathlib.Path(os.environ["ORG_REPO_PATH"]) / "Agent-team" / "skills" / "scout_sources.json"
s = p.read_text(encoding="utf-8")
s = (s.replace("YYYY-MM-DD",  os.environ["TODAY"])
      .replace("<ORG_NAME>",  os.environ["ORG_NAME"]))
p.write_text(s, encoding="utf-8")
PY
```

残るのは手編集対象：

1. **`<example-org>/<example-repo>`** → tier 3 例を実在の curated OSS に置き換える、または該当ソースごと削除
2. **`<example.com>` `<rejected.example.com>`** → `proposed_sources` `rejected_candidates` の例エントリを削除して空配列にする

最小構成（tier 1 の 5 件のみで開始）にする場合は、tier 2/3 のサンプルエントリと proposed_sources / rejected_candidates の例エントリを削除して空配列にしてください：

```json
"proposed_sources": [],
"rejected_candidates": []
```

scout の動作は `meta-agents/scout.md` G11（ホワイトリファレンスリスト）参照。
ホワイトリスト未設定で scout を起動すると findings 0 件で正常終了します（安全側に倒す設計）。

---

## 11. 動作確認

### 11-1. ルールが読まれているか（期待文字列ベース）

`coding-style.md` の冒頭にある「Immutability (CRITICAL)」ヘッダの内容を Claude が引用できるかで判定します（曖昧判定を避ける）。Claude Code 起動 cwd は `$ORG_REPO_PATH` に固定してください（project-local rules を読ませるため）：

```bash
cd "$ORG_REPO_PATH"
claude --print "あなたが従う coding-style ルールの中で、Immutability セクションが指示している内容を、ファイル名と該当キーワードを引用しつつ要約してください。"
```

→ `coding-style.md` の `Immutability` セクションのキーワード（"create new objects", "NEVER mutate" など）を含む応答が返れば OK。  
→ 一般論しか返らない場合は rules が読まれていない（`$CLAUDE_RULES_DIR` の場所と起動 cwd を再確認）。

### 11-2. メタエージェントの状態確認

Claude Code セッション内で：
```
/meta
```

→ 各メタエージェントの「未起動」状態が表示されればOK

### 11-3. メタエージェント起動テスト

```
/meta janitor
```

→ janitor が起動して `Agent-team/logs/reviews/YYYY-Www-janitor.jsonl` に findings が追記されればOK

### 11-4. agent-call テスト

```
/agent-call list
```

→ `{{TEAM_AGENTS}}` で定義した業務エージェント一覧が返れば OK。

### 11-5. プレースホルダ置換漏れチェック（**MANDATORY**）

セットアップ完了後、必ず **`--receiver` モード**で実行してください：

```bash
bash "$REFERENCE_ROOT/_scripts/check-placeholders.sh" --receiver --target "$ORG_REPO_PATH"
```

→ exit 0 なら全プレースホルダが置換済み。
→ exit 1 なら未置換あり。出力された `[STRICT] <file>:<line> 未置換: {{...}}` を一つずつ手動置換してください。

`--receiver` モードはすべての `{{...}}` を「未置換」として検出し、LEAK パターン（メール・絶対パス）はスキップします。受け取り側の正常な絶対パス（自分のホームディレクトリへの埋め込み）が LEAK 誤検出されません。

**`--strict`** は旧名で、`--receiver` と同義です（互換性のため残置）。

スクリプトの 2 モード：

| モード | 検出対象 | 用途 |
|---|---|---|
| 引数なし（送り手モード） | 未定義 `{{...}}` + LEAK パターン（メール・個人パス） | 配布前の clean 確認（パッケージ作成側）|
| `--receiver`（受け手モード）| すべての `{{...}}` 未置換 | 導入後の最終 verification（受け取り側）|

---

## 12. 完了報告

ユーザーに以下を報告してください（$CLAUDE_RULES_DIR は Section 0-1 で確定したスコープに置換）：

```
セットアップ完了しました。

配置済み：
- ルール 8 個 → $CLAUDE_RULES_DIR（project-local or global、Section 0-1 で確定したスコープ）
- メタエージェント 4 個 → Agent-team/.claude/agents/
- スキル 8 個 → Agent-team/agents/.claude/skills/
- ワークフローテンプレート 6 個 → Agent-team/skills/
- 設定ファイル → Agent-team/{AGENTS.md, spec.json}
- 業務エージェントテンプレ → Agent-team/agents/<各エージェント>/
- 同梱スクリプト（完全実装）→
    Agent-team/tools/agent-call/agent-call.sh
    Agent-team/tools/peer-inbox/peer-inbox.sh
    Agent-team/agents/.claude/scripts/meta-check.sh
- SessionStart hook 登録済み（WORKPLACE_ROOT / META_CHECK_REPO_NAME を env で渡す）

次のステップ：
1. spec.json の agents[] / data_flows[] 定義を業務に合わせて完成させてください
2. 各業務エージェントの CLAUDE.md と rules.json を編集してください
3. ChatGPT 第二意見が必要なら Agent-team/tools/codex/setup.sh + codex-ask を実装してください
   （仕様は tools/README.md「含まれていないスクリプト」参照）
4. 新しいターミナルで claude を起動して、SessionStart hook が動作するか確認してください

全体構造は ARCHITECTURE.md、運用ガイドは README.md を参照してください。
```

---

## トラブルシューティング

### Q: メタエージェントが自動起動しない

- `$ORG_REPO_PATH/.claude/settings.json`（または `~/.claude/settings.json`）の SessionStart hook が登録されているか確認
- 直接実行で動作確認：
  ```bash
  WORKPLACE_ROOT="$ORG_REPO_PATH" \
  META_CHECK_REPO_NAME="$ORG_REPO_NAME" \
  bash "$ORG_REPO_PATH/Agent-team/agents/.claude/scripts/meta-check.sh"
  ```
- `Agent-team/logs/reviews/.pending/` に marker が作られているか確認
- AGENTS.md の「メタエージェント自動起動」指示が CLAUDE.md または AGENTS.md に書かれているか確認

### Q: agent-call が動かない

- `Agent-team/tools/agent-call/agent-call.sh` が配置済みか（Section 7-1）
- `chmod +x` 済みか
- `WORKPLACE_ROOT` が export されているか（または cwd が git repo 内か）
- claude CLI が PATH に通っているか（`which claude`）

### Q: ルールが効いていない

- `$CLAUDE_RULES_DIR` 配下に配置済みか
- ファイル名が `.md` で終わっているか
- project-local 配置の場合、Claude Code 起動 cwd が `$ORG_REPO_PATH` か（外から起動するとプロジェクトルールが読まれない）
- Claude Code を再起動してから確認

### Q: プレースホルダの置換漏れ

```bash
bash "$REFERENCE_ROOT/_scripts/check-placeholders.sh" --receiver --target "$ORG_REPO_PATH"
```

→ exit 1 で出力された箇所が置換漏れ。一つずつ手動 or Python で置換してください。
