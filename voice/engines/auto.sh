#!/bin/bash
# auto.sh — プラットフォーム自動判定 TTS エンジン（Phase 3）
# engine契約: stdin からテキストを受け取り、音声再生して終了する
#
# macOS: say コマンドを使用（AIKO_VOICE_NAME / AIKO_VOICE_RATE 有効）
# Linux/WSL: VOICEVOX Engine が起動中なら voicevox.sh、未起動なら exit 1
#
# 有効化: echo "auto" > .claude/aiko/voice/engine

ENGINES_DIR="$(cd "$(dirname "$0")" && pwd 2>/dev/null)" || exit 1

TEXT="$(cat 2>/dev/null)"
[ -z "$TEXT" ] && exit 0

case "$(uname -s 2>/dev/null)" in
  Darwin)
    echo "$TEXT" | bash "$ENGINES_DIR/say.sh"
    ;;
  Linux)
    echo "$TEXT" | bash "$ENGINES_DIR/voicevox.sh"
    ;;
  *)
    echo "[aiko-voice] auto エンジン: 未対応の OS ($(uname -s))" >&2
    exit 1
    ;;
esac
