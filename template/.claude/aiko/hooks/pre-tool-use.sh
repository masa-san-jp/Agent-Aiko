#!/bin/bash
# Aiko PreToolUse hook
# Origin / INVARIANTS の書き換えをブロックする

set -e

# stdin から JSON を読む（Claude Code が渡す）
INPUT=$(cat)

# ツール名とパスを取り出す
TOOL=$(printf '%s' "$INPUT" | sed -n 's/.*"tool_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
PATH_VAL=$(printf '%s' "$INPUT" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
NOTEBOOK_PATH=$(printf '%s' "$INPUT" | sed -n 's/.*"notebook_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')

[ -z "$PATH_VAL" ] && PATH_VAL="$NOTEBOOK_PATH"

case "$TOOL" in
  Edit|Write|MultiEdit|NotebookEdit) ;;
  *) exit 0 ;;
esac

[ -z "$PATH_VAL" ] && exit 0

case "$PATH_VAL" in
  *.claude/aiko/persona/aiko-origin.md|*aiko-origin.md)
    echo "Refused: aiko-origin.md is protected. Use /aiko-override or /aiko-reset to change override persona instead." 1>&2
    exit 2
    ;;
  *.claude/aiko/persona/INVARIANTS.md|*INVARIANTS.md)
    echo "Refused: INVARIANTS.md is protected and cannot be edited via tool calls." 1>&2
    exit 2
    ;;
esac

exit 0
