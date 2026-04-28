#!/bin/bash
# Aiko SessionStart hook
# mode=override のとき、未承認 proposals があれば Claude に通知する

MODE_FILE=".claude/aiko/mode"
PROPOSALS_DIR=".claude/aiko/persona/proposals"

[ -r "$MODE_FILE" ] || exit 0
MODE=$(tr -d '[:space:]' < "$MODE_FILE")
[ "$MODE" = "override" ] || exit 0
[ -d "$PROPOSALS_DIR" ] || exit 0

COUNT=$(find "$PROPOSALS_DIR" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')
[ "$COUNT" -gt 0 ] || exit 0

echo "[aiko] mode=override / 未承認 proposals=${COUNT} 件があります（${PROPOSALS_DIR}）。/aiko-override で取り込めます。"
exit 0
