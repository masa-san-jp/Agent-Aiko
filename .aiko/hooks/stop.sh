#!/bin/bash
# stop.sh — 共有 voice stop hook へのラッパー
# いかなる場合も Claude Code の動作を阻害してはならない（エラー時は exit 0）

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd 2>/dev/null)" || exit 0
SHARED_STOP="$SCRIPT_DIR/../../voice/hooks/stop.sh"

# ~/.claude/voice/ がない場合は .aiko/voice/ をフォールバックとして使用
if [ ! -d "$HOME/.claude/voice" ] && [ -d "$SCRIPT_DIR/../voice" ]; then
  export VOICE_CONFIG_DIR="$SCRIPT_DIR/../voice"
fi

[ -f "$SHARED_STOP" ] || exit 0
exec bash "$SHARED_STOP"
