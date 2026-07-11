#!/bin/bash
# meta-check.sh — メタエージェント（reviewer/scout/lab/janitor）の overdue 検出
#
# 役割:
#   - 各メタエージェントの最終起動時刻を確認
#   - 24h 以上経過していれば pending マーカーを作成
#   - Claude は CLAUDE.md の指示に従って pending を検知し、対応エージェントを起動する
#
# 設計:
#   - 失敗しても session 継続を阻害しない（exit 0）
#   - クラウド cron / 外部 scheduler は使わない（コスト合理性）
#
# 配置先:
#   <ORG_REPO_PATH>/Agent-team/agents/.claude/scripts/meta-check.sh
#
# 登録方法:
#   ~/.claude/settings.json または <ORG_REPO_PATH>/.claude/settings.json の
#   SessionStart hook として登録（tools/README.md 参照）
#
# Env:
#   META_CHECK_REPO_NAME   設定すると basename(REPO_ROOT) と一致するリポでのみ動作。
#                          未設定/空文字なら全リポで動作（既定）。

set -u

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$REPO_ROOT" ]; then
  exit 0
fi

# 自組織のリポジトリ名で絞り込み（環境変数で制御。sed による分岐改変は不要）
if [ -n "${META_CHECK_REPO_NAME:-}" ] && [ "$(basename "$REPO_ROOT")" != "$META_CHECK_REPO_NAME" ]; then
  exit 0
fi

cd "$REPO_ROOT" || exit 0

REVIEWS_DIR="Agent-team/logs/reviews"
PENDING_DIR="$REVIEWS_DIR/.pending"
THRESHOLD_SEC=86400  # 24h
NOW=$(date +%s)
OVERDUE=()

mkdir -p "$PENDING_DIR" 2>/dev/null || exit 0

for ROLE in reviewer scout lab janitor; do
  LAST_FILE="$REVIEWS_DIR/.last-run-$ROLE"
  if [ -f "$LAST_FILE" ]; then
    LAST_TS=$(cat "$LAST_FILE" 2>/dev/null)
    if [ -n "$LAST_TS" ] && [ "$LAST_TS" -gt 0 ] 2>/dev/null; then
      AGE=$((NOW - LAST_TS))
      if [ "$AGE" -lt "$THRESHOLD_SEC" ]; then
        continue
      fi
    fi
  fi
  touch "$PENDING_DIR/$ROLE" 2>/dev/null
  OVERDUE+=("$ROLE")
done

if [ ${#OVERDUE[@]} -gt 0 ]; then
  echo "[meta-check] 24h 以上未起動のメタエージェント: ${OVERDUE[*]}（CLAUDE.md の指示で自動起動されます）" >&2
fi

exit 0
