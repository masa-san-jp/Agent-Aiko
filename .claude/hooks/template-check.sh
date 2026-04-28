#!/bin/bash
# PreToolUse hook: agent-aiko への git push 前に template/ を検査する
# dev-docs への push は対象外

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null || echo "")

# git push でなければスキップ
echo "$COMMAND" | grep -q "git push" || exit 0

# dev-docs 向け push はスキップ
echo "$COMMAND" | grep -qE "dev-docs|agent-aiko-dev" && exit 0

# template/ に dev-docs 参照がないか検査
VIOLATIONS=$(grep -r "dev-docs" template/ --include="*.md" --include="*.sh" --include="*.json" -l 2>/dev/null)

if [ -n "$VIOLATIONS" ]; then
  echo "⛔ [template-check] 配布用 template/ に dev-docs/ 参照が含まれています："
  echo "$VIOLATIONS"
  echo ""
  echo "配布用ファイルから開発者固有のパスを削除してから push してください。"
  echo "詳細は /dev-check スキルで確認できます。"
  exit 2
fi

exit 0
