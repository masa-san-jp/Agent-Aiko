#!/bin/bash
# say.sh — macOS say コマンド TTS エンジン
# engine契約: stdin からテキストを受け取り、音声再生して終了する
# 環境変数: AIKO_VOICE_NAME (デフォルト: Kyoko), AIKO_VOICE_RATE (デフォルト: 175)

set -euo pipefail

VOICE="${AIKO_VOICE_NAME:-Kyoko}"
RATE="${AIKO_VOICE_RATE:-175}"

TEXT="$(cat)"

[ -z "$TEXT" ] && exit 0

# 先頭の "-" は say のオプションになる。整形で落とし切れなかった分もここで落とす。
while :; do
  case "$TEXT" in
    -*) TEXT="${TEXT#-}" ;;
    *) break ;;
  esac
done

if ! command -v say >/dev/null 2>&1; then
  echo "[aiko-voice] say コマンドが見つかりません。macOS 以外では使えません。" >&2
  exit 1
fi

# -- より後ろは本文。出力先オプションとして解釈させない。
say -v "$VOICE" -r "$RATE" -- "$TEXT"
