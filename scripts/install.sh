#!/bin/bash
# Agent-Aiko installer
# Copies template/.claude/ into the current directory's .claude/.
# Re-install safe: never overwrites user-controlled files.
#   user-controlled:
#     - aiko/mode
#     - aiko/persona/aiko-override.md
#     - aiko/persona/profiles/*
#     - aiko/persona/proposals/*
#     - aiko/capability/rules/rules-base.md
#   force-refreshed (always upstream version):
#     - everything else (CLAUDE.md, settings.json, aiko-origin.md, INVARIANTS.md,
#       skills/, hooks/, capability/skills/)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)/template/.claude"

if [ ! -d "$TEMPLATE_DIR" ]; then
  echo "✗ template/.claude が見つかりません: $TEMPLATE_DIR" 1>&2
  exit 1
fi

DEST_DIR="$(pwd)/.claude"

echo "=== Agent-Aiko install ==="
echo "  source: $TEMPLATE_DIR"
echo "  dest  : $DEST_DIR"
echo ""

mkdir -p "$DEST_DIR"

# Stash user-controlled files (if they exist)
STASH=$(mktemp -d)
stash_if_exists() {
  local rel="$1"
  if [ -e "$DEST_DIR/$rel" ]; then
    mkdir -p "$(dirname "$STASH/$rel")"
    cp -R "$DEST_DIR/$rel" "$STASH/$rel"
  fi
}

stash_if_exists "aiko/mode"
stash_if_exists "aiko/user.md"
stash_if_exists "aiko/override-history.jsonl"
stash_if_exists "aiko/persona/aiko-override.md"
stash_if_exists "aiko/persona/profiles"
stash_if_exists "aiko/persona/proposals"
stash_if_exists "aiko/capability/rules/rules-base.md"

# Force-copy entire template (overwrites everything)
cp -R "$TEMPLATE_DIR/." "$DEST_DIR/"

# Restore stashed user-controlled files
restore_if_stashed() {
  local rel="$1"
  if [ -e "$STASH/$rel" ]; then
    rm -rf "$DEST_DIR/$rel"
    mkdir -p "$(dirname "$DEST_DIR/$rel")"
    cp -R "$STASH/$rel" "$DEST_DIR/$rel"
    echo "  · $rel を保持"
  fi
}

USER_HAD_OVERRIDE=0
[ -e "$STASH/aiko/persona/aiko-override.md" ] && USER_HAD_OVERRIDE=1
USER_HAD_MODE=0
[ -e "$STASH/aiko/mode" ] && USER_HAD_MODE=1

restore_if_stashed "aiko/mode"
restore_if_stashed "aiko/user.md"
restore_if_stashed "aiko/override-history.jsonl"
restore_if_stashed "aiko/persona/aiko-override.md"
restore_if_stashed "aiko/persona/profiles"
restore_if_stashed "aiko/persona/proposals"
restore_if_stashed "aiko/capability/rules/rules-base.md"

rm -rf "$STASH"

ORIGIN="$DEST_DIR/aiko/persona/aiko-origin.md"
OVERRIDE="$DEST_DIR/aiko/persona/aiko-override.md"
INVARIANTS="$DEST_DIR/aiko/persona/INVARIANTS.md"
MODE_FILE="$DEST_DIR/aiko/mode"

# Initialize override and mode if this is a fresh install (no stash existed)
if [ "$USER_HAD_OVERRIDE" -eq 0 ]; then
  cp "$ORIGIN" "$OVERRIDE"
  echo "  ✓ aiko-override.md を origin から初期化"
fi

if [ "$USER_HAD_MODE" -eq 0 ]; then
  printf 'origin\n' > "$MODE_FILE"
  echo "  ✓ mode を origin で初期化"
fi

# Protect origin and invariants
chmod 444 "$ORIGIN" "$INVARIANTS" 2>/dev/null || true
echo "  ✓ aiko-origin.md / INVARIANTS.md を 444 に設定"

find "$DEST_DIR/aiko/hooks" -type f -name '*.sh' -exec chmod +x {} +
echo "  ✓ hooks に実行権限を付与"

echo ""
echo "=== ✓ インストール完了 ==="
echo "次の一歩："
echo "  - Claude Code を起動 → /aiko-mode で現在モードを確認"
echo "  - /aiko-mode override に切り替えて自分用の人格を育て始められます"
