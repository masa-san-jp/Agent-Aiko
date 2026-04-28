#!/bin/bash
# template/ に dev-docs/ 参照が混入していないかチェックする

[ -d "template" ] || exit 0

VIOLATIONS=$(grep -rl "dev-docs" template/ \
  --include="*.md" --include="*.sh" --include="*.json" 2>/dev/null)

[ -n "$VIOLATIONS" ] || exit 0

echo "⛔ [template-check] 配布用 template/ に dev-docs/ 参照が含まれています：" >&2
echo "$VIOLATIONS" >&2
echo "" >&2
echo "配布用ファイルから開発者固有のパスを削除してから push してください。" >&2
echo "詳細は /dev-check スキルで確認できます。" >&2
exit 2
