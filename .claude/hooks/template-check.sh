#!/bin/bash
# claude-code/template/ に dev-docs/ 参照が混入していないかチェックする
# Phase 0 のリポ構造リネームで template/ → claude-code/template/ に移動した。

TEMPLATE_DIR="claude-code/template"

[ -d "$TEMPLATE_DIR" ] || exit 0

VIOLATIONS=$(grep -rl "dev-docs" "$TEMPLATE_DIR/" \
  --include="*.md" --include="*.sh" --include="*.json" 2>/dev/null)

[ -n "$VIOLATIONS" ] || exit 0

echo "⛔ [template-check] 配布用 $TEMPLATE_DIR/ に dev-docs/ 参照が含まれています：" >&2
echo "$VIOLATIONS" >&2
echo "" >&2
echo "配布用ファイルから開発者固有のパスを削除してから push してください。" >&2
echo "詳細は /dev-check スキルで確認できます。" >&2
exit 2
