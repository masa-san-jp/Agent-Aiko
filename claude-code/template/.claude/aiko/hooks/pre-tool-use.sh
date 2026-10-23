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

AIKO_HOME="${AIKO_HOME:-$HOME/.aiko}"
AIKO_HOME="${AIKO_HOME%/}"

# ~ と ./ と .. とシンボリックリンクを解く。文字列の一致だけだと
# `.claude/aiko/persona/INVARIANTS.md`（~/.aiko へのリンク）や `../` を通す。
# 守るのは origin と不変条項だけ。persona/overrides は対象にしない。
normalize_path() {
  python3 - "$1" <<'PY'
import os, sys
raw = sys.argv[1]
if raw.startswith("~/"):
    raw = os.path.join(os.path.expanduser("~"), raw[2:])
raw = os.path.abspath(raw)
missing = []
current = raw
while True:
    if os.path.lexists(current):
        real = os.path.realpath(current)
        rebuilt = real
        for part in reversed(missing):
            rebuilt = os.path.normpath(os.path.join(rebuilt, part))
        print(rebuilt)
        sys.exit(0)
    parent = os.path.dirname(current)
    if parent == current:
        print(os.path.normpath(raw))
        sys.exit(0)
    missing.append(os.path.basename(current))
    current = parent
PY
}

PATH_VAL="$(normalize_path "$PATH_VAL")" || {
  echo "Refused: could not normalize the tool path." 1>&2
  exit 2
}

is_protected() {
  local candidate="$1" target normalized
  for target in \
    "$AIKO_HOME/persona/origin/persona.md" \
    "$AIKO_HOME/persona/aiko-origin.md" \
    "$AIKO_HOME/persona/INVARIANTS.md" \
    "$AIKO_HOME/INVARIANTS.md" \
    "$PWD/.claude/aiko/persona/origin/persona.md" \
    "$PWD/.claude/aiko/persona/aiko-origin.md" \
    "$PWD/.claude/aiko/persona/INVARIANTS.md"
  do
    normalized="$(normalize_path "$target")" || return 0
    [ "$candidate" = "$normalized" ] && return 0
  done
  return 1
}

if is_protected "$PATH_VAL"; then
  echo "Refused: origin persona and INVARIANTS.md are protected. Use /aiko-override or /aiko-reset. Overrides are not blocked." 1>&2
  exit 2
fi

exit 0
