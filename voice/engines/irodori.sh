#!/bin/bash
# irodori.sh — Irodori-TTS-Server TTS エンジン（Phase 5載せ替え先）
# engine契約: stdin からテキストを受け取り、音声再生して終了する
#
# 依存: Irodori-TTS-Server（OpenAI互換API）が起動中であること
#   https://github.com/Aratako/Irodori-TTS-Server
# 環境変数:
#   AIKO_IRODORI_URL   (デフォルト: http://localhost:8000)
#   AIKO_IRODORI_VOICE (デフォルト: aiko。Speaker Inversion で学習したアイコ専用音声)
#
# 有効化: echo "irodori" > ~/.claude/voice/engine
#
# --- D3 後期: Speaker Inversion セットアップ手順 ---
# 1. アイコの参照音声（10〜30秒程度のクリーン音声）を用意する
# 2. Irodori-TTS-Server の Speaker Inversion 機能で話者 "aiko" を学習させる
#    例: POST /v1/speakers/inversion  {"name":"aiko","audio":"<base64>"}
# 3. 以降は AIKO_IRODORI_VOICE=aiko（デフォルト）でそのまま動作する
#
# 話者未作成の場合: サーバーが 404 / エラーを返す。別の登録済み話者名を
# AIKO_IRODORI_VOICE=<name> で指定すれば即切替可能。

set -euo pipefail

IRODORI_URL="${AIKO_IRODORI_URL:-http://localhost:8000}"
VOICE="${AIKO_IRODORI_VOICE:-aiko}"

TEXT="$(cat)"
[ -z "$TEXT" ] && exit 0

# Irodori-TTS-Server の起動確認
if ! curl -sf "${IRODORI_URL}/health" >/dev/null 2>&1 && \
   ! curl -sf "${IRODORI_URL}/v1/models" >/dev/null 2>&1; then
  echo "[aiko-voice] Irodori-TTS-Server が起動していません。${IRODORI_URL} を確認してください。" >&2
  exit 1
fi

# 一時ファイル（trap で確実に削除）
TMP_AUDIO="$(mktemp /tmp/aiko-irodori-XXXXXX.mp3)"
trap 'rm -f "$TMP_AUDIO"' EXIT

# OpenAI互換 /v1/audio/speech エンドポイントに POST
curl -sf -X POST "${IRODORI_URL}/v1/audio/speech" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c "
import json, sys
print(json.dumps({'model': 'tts-1', 'input': sys.argv[1], 'voice': sys.argv[2]}))
" "$TEXT" "$VOICE")" \
  -o "$TMP_AUDIO" || { echo "[aiko-voice] Irodori synthesis 失敗" >&2; exit 1; }

# 再生
if [[ "$(uname)" == "Darwin" ]]; then
  afplay "$TMP_AUDIO"
elif command -v paplay >/dev/null 2>&1; then
  paplay "$TMP_AUDIO"
elif command -v aplay >/dev/null 2>&1; then
  aplay "$TMP_AUDIO"
else
  echo "[aiko-voice] 音声プレイヤーが見つかりません（afplay/paplay/aplay）" >&2
  exit 1
fi
