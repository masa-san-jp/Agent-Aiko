#!/usr/bin/env bash
# visibility-check — Agent-Aiko
#
# 公開／非公開の境界仕様（VISIBILITY.md）に対する整合性を検証する。
# 配布物（template/）に開発者専用パスが混入していないか、非公開対象が
# 誤って tracked になっていないかを機械的にチェックする。
#
# 使い方: bash .claude/scripts/visibility-check.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." 2>/dev/null && pwd)" || {
  echo "⛔ [visibility-check] REPO_ROOT の算出に失敗しました（スクリプト配置を確認）" >&2
  exit 1
}
cd "$REPO_ROOT" || {
  echo "⛔ [visibility-check] cd $REPO_ROOT に失敗しました" >&2
  exit 1
}

NG=0

print_section() {
  echo ""
  echo "=== $1 ==="
}

check_ok() { echo "  [OK] $1"; }
check_ng() { echo "  [NG] $1"; NG=1; }

print_section "1. 配布物 template/ の汚染チェック"

TEMPLATE_OUTPUT=$(bash .claude/hooks/template-check.sh 2>&1)
TEMPLATE_RC=$?
if [ "$TEMPLATE_RC" -eq 0 ]; then
  check_ok "claude-code/template/ に開発者専用リポ参照なし"
else
  check_ng "claude-code/template/ に違反あり（以下 template-check.sh の出力）"
  if [ -n "$TEMPLATE_OUTPUT" ]; then
    echo "$TEMPLATE_OUTPUT" | sed 's/^/    /'
  fi
fi

print_section "2. .claude/rules/ が tracked に紛れていないか"

RULES=$(git ls-files .claude/rules/ 2>/dev/null || true)
if [ -z "$RULES" ]; then
  check_ok ".claude/rules/ は tracked に存在しない"
else
  check_ng ".claude/rules/ が tracked です:"
  echo "$RULES" | sed 's/^/    /'
fi

print_section "3. settings.local.json が tracked に紛れていないか"

LOCAL_JSON=$(git ls-files | grep -E "settings\.local\.json$" || true)
if [ -z "$LOCAL_JSON" ]; then
  check_ok "settings.local.json は tracked に存在しない"
else
  check_ng "settings.local.json が tracked です:"
  echo "$LOCAL_JSON" | sed 's/^/    /'
fi

print_section "4. images/ が tracked に紛れていないか"

IMAGES=$(git ls-files images/ 2>/dev/null || true)
if [ -z "$IMAGES" ]; then
  check_ok "images/ は tracked に存在しない"
else
  check_ng "images/ が tracked です:"
  echo "$IMAGES" | head -5 | sed 's/^/    /'
fi

print_section "5. session-state 実データが tracked に紛れていないか"

SESSION=$(git ls-files | grep -E "session-state/(auto\.jsonl|current\.md)$" || true)
if [ -z "$SESSION" ]; then
  check_ok "session-state 実データは tracked に存在しない（雛形 .example のみ可）"
else
  check_ng "session-state 実データが tracked です:"
  echo "$SESSION" | sed 's/^/    /'
fi

print_section "6. dev-docs/ ・ Agent-Lab/ が本リポ内に存在しないか（非公開ラボ分離の維持）"

if [ -d "dev-docs" ]; then
  check_ng "dev-docs/ が本リポ内に存在します。../Agent-Lab/Agent-team/agents/aiko/dev-docs/ に統合してください"
else
  check_ok "dev-docs/ は本リポ内に存在しない（非公開ラボ分離 OK）"
fi

if [ -d "Agent-Lab" ]; then
  check_ng "Agent-Lab/ が本リポ内に存在します。../Agent-Lab/（兄弟）として配置し直してください"
else
  check_ok "Agent-Lab/ は本リポ内に存在しない（非公開ラボ分離 OK）"
fi

if [ -d "../Agent-Lab/Agent-team/agents/aiko/dev-docs" ]; then
  check_ok "../Agent-Lab/Agent-team/agents/aiko/dev-docs/ が存在"
else
  echo "  [WARN] ../Agent-Lab/Agent-team/agents/aiko/dev-docs/ が見当たりません。dev-log 操作には Agent-Lab の clone が必要です"
fi

print_section "7. 直近 push 予定（uncommitted を含む）"

CHANGED=$(git status --short | head -20)
if [ -z "$CHANGED" ]; then
  echo "  （変更なし）"
else
  echo "$CHANGED" | sed 's/^/  /'
fi

echo ""
if [ "$NG" -eq 0 ]; then
  echo "✓ visibility-check (Agent-Aiko): すべて OK"
  exit 0
else
  echo "⛔ visibility-check (Agent-Aiko): 違反あり。VISIBILITY.md と .gitignore を確認してください。"
  exit 1
fi
