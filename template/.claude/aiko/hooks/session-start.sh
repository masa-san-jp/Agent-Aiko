#!/bin/bash
# Aiko SessionStart hook

MODE_FILE=".claude/aiko/mode"
PROPOSALS_DIR=".claude/aiko/persona/proposals"
USER_FILE=".claude/aiko/user.md"

LOGO_FILE=".claude/aiko/logo.txt"
[ -r "$LOGO_FILE" ] && cat "$LOGO_FILE" && echo

[ -r "$MODE_FILE" ] || exit 0
MODE=$(tr -d '[:space:]' < "$MODE_FILE")

# ユーザー名が未設定なら Claude に初回挨拶を促す
if [ -f "$USER_FILE" ]; then
  NAME=$(grep -A1 "^## 名前" "$USER_FILE" | grep "^name:" | sed 's/^name:[[:space:]]*//')
  if [ -z "$NAME" ]; then
    echo "[aiko] ユーザー名が未設定です。セッション開始時にユーザーへ名前を尋ね、.claude/aiko/user.md の name フィールドに記録してください。"
  fi
fi

# mode=override のとき、未承認 proposals があれば通知
[ "$MODE" = "override" ] || exit 0
[ -d "$PROPOSALS_DIR" ] || exit 0

COUNT=$(find "$PROPOSALS_DIR" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')
[ "$COUNT" -gt 0 ] || exit 0

echo "[aiko] mode=override / 未承認 proposals=${COUNT} 件があります（${PROPOSALS_DIR}）。/aiko-or で取り込めます。"
exit 0
