#!/bin/bash
# claude-code/template/ に開発者専用リポ（dev-docs / Agent-Aiko-dev）への参照が
# 混入していないかチェックする。
# Phase 0 のリポ構造リネームで template/ → claude-code/template/ に移動。
# その後 dev-docs/ は ../Agent-Aiko-dev/ へ兄弟分離（旧名も後方互換で検出）。

set -o pipefail

TEMPLATE_DIR="claude-code/template"

[ -d "$TEMPLATE_DIR" ] || exit 0

# 許容するのは公開アセットの https?://URL のみ。各行から https?:// URL を一旦除去し、
# その上で dev-docs / Agent-Aiko-dev が残ればローカルパス参照とみなして NG。
# これにより file:// 等のローカル依存 URL は許容しないし、URL とローカルパスが
# 同じ行に混在しているケースもローカル側を取りこぼさない。
#
# パイプライン rc:
#   0 → 違反検出あり（VIOLATIONS 非空）
#   1 → grep 段階で「マッチなし」= 違反なし（pipefail 経由で伝播）
#   >=2 → grep の読み取りエラー等の実エラー。検出を信頼できないので失敗終了する。
VIOLATIONS=$(grep -rnE "dev-docs|Agent-Aiko-dev" "$TEMPLATE_DIR/" \
  --include="*.md" --include="*.sh" --include="*.json" 2>/dev/null \
  | sed -E 's|https?://[^[:space:]"<>)]+||g' \
  | grep -E "dev-docs|Agent-Aiko-dev" \
  | cut -d: -f1 | sort -u) || PIPELINE_RC=$?
PIPELINE_RC=${PIPELINE_RC:-0}

if [ "$PIPELINE_RC" -ge 2 ]; then
  echo "⛔ [template-check] パイプライン実行エラー (rc=$PIPELINE_RC)" >&2
  echo "ファイル読み取り等で異常があるため検出を信頼できません。" >&2
  exit "$PIPELINE_RC"
fi

[ -n "$VIOLATIONS" ] || exit 0

echo "⛔ [template-check] 配布用 $TEMPLATE_DIR/ に開発者専用リポ参照が含まれています：" >&2
echo "$VIOLATIONS" >&2
echo "" >&2
echo "配布用ファイルから開発者固有のパス（dev-docs / Agent-Aiko-dev）を削除してから push してください。" >&2
echo "詳細は /dev-check スキルで確認できます。" >&2
exit 2
