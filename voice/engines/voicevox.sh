#!/bin/bash
# voicevox.sh — VOICEVOX Engine TTS エンジン（Phase 3本命）
# engine契約: stdin からテキストを受け取り、音声再生して終了する
#
# 依存: VOICEVOX Engine が起動中であること
# 環境変数:
#   AIKO_VOICEVOX_URL     (デフォルト: http://localhost:50021)
#   AIKO_VOICEVOX_SPEAKER (デフォルト: 2 = 四国めたん ノーマル)
#
# セットアップ: https://voicevox.hiroshiba.jp/ から Engine をダウンロード・起動
# 有効化: echo "voicevox" > ~/.claude/voice/engine
#
# --- 話者選定ガイド（D1: オーナーが試聴して AIKO_VOICEVOX_SPEAKER を決定）---
# 試聴コマンド（Engine 起動後に実行）:
#   echo "こんにちは、アイコです。よろしくお願いします。" | AIKO_VOICEVOX_SPEAKER=<ID> bash voicevox.sh
#
# 採用: 2 = 四国めたん ノーマル（D1 決定済み）
# スタイル一覧（四国めたん）: 0=あまあま / 2=ノーマル / 4=セクシー / 6=ツンツン
#
# 全話者一覧の確認: curl -s http://localhost:50021/speakers | python3 -m json.tool | grep -A1 '"name"'
# 決定後は AIKO_VOICEVOX_SPEAKER=<ID> を ~/.zshrc / ~/.zshenv に追記して固定する。

set -euo pipefail

VOICEVOX_URL="${AIKO_VOICEVOX_URL:-http://localhost:50021}"
SPEAKER_ID="${AIKO_VOICEVOX_SPEAKER:-2}"

TEXT="$(cat)"
[ -z "$TEXT" ] && exit 0

# VOICEVOX Engine の起動確認
if ! curl -sf "${VOICEVOX_URL}/version" >/dev/null 2>&1; then
  echo "[aiko-voice] VOICEVOX Engine が起動していません。${VOICEVOX_URL} を確認してください。" >&2
  exit 1
fi

# 一時ファイル（trap で確実に削除）
TMP_WAV="$(mktemp /tmp/aiko-voicevox-XXXXXX.wav)"
trap 'rm -f "$TMP_WAV"' EXIT

# テキストを URL エンコード
ENCODED="$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1]))" "$TEXT")"

# audio_query → synthesis
QUERY="$(curl -sf -X POST "${VOICEVOX_URL}/audio_query?text=${ENCODED}&speaker=${SPEAKER_ID}" \
  -H "Content-Type: application/json")" || { echo "[aiko-voice] VOICEVOX audio_query 失敗" >&2; exit 1; }

curl -sf -X POST "${VOICEVOX_URL}/synthesis?speaker=${SPEAKER_ID}" \
  -H "Content-Type: application/json" \
  -d "$QUERY" \
  -o "$TMP_WAV" || { echo "[aiko-voice] VOICEVOX synthesis 失敗" >&2; exit 1; }

# 再生
if [[ "$(uname)" == "Darwin" ]]; then
  afplay "$TMP_WAV"
elif command -v paplay >/dev/null 2>&1; then
  paplay "$TMP_WAV"
elif command -v aplay >/dev/null 2>&1; then
  aplay "$TMP_WAV"
else
  echo "[aiko-voice] 音声プレイヤーが見つかりません（afplay/paplay/aplay）" >&2
  exit 1
fi
