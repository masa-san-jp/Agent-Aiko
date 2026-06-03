#!/bin/bash
# avatar.sh — デスクトップアバター連携エンジン
# engine契約: stdin からテキストを受け取り、WebSocket でアバターアプリに送信して終了する
#
# 依存: voice/desktop/ のアバターアプリが起動中であること
# 環境変数:
#   AIKO_AVATAR_PORT (デフォルト: 7749)
#
# アバターアプリ起動: cd Agent-team/voice/desktop && npm start

set -euo pipefail

AVATAR_PORT="${AIKO_AVATAR_PORT:-7749}"
AVATAR_WS="ws://localhost:${AVATAR_PORT}"
VOICE_CONFIG_DIR="${VOICE_CONFIG_DIR:-$HOME/.claude/voice}"
FEATURES_FILE="$VOICE_CONFIG_DIR/features"

TEXT="$(cat)"
[ -z "$TEXT" ] && exit 0

# features ファイルから個別フラグを読む（不在・行なし → デフォルト on）
read_feature() {
  local name="$1"
  if [ ! -f "$FEATURES_FILE" ]; then echo "on"; return; fi
  local val
  val="$(grep -m1 "^${name}=" "$FEATURES_FILE" 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')" || val=""
  [ -z "$val" ] && echo "on" || echo "$val"
}

# 感情検出（キーワードマッチ）
detect_emotion() {
  local t="$1"
  if printf '%s' "$t" | grep -qE "できました|完了|よかった|ありがとう|成功"; then echo "happy"
  elif printf '%s' "$t" | grep -qE "すみません|ごめん|失敗|エラー|申し訳"; then echo "apologetic"
  elif printf '%s' "$t" | grep -qE "検討|考えて|わかりません|難しい|確認"; then echo "thinking"
  elif printf '%s' "$t" | grep -qE "最高|すごい|！！|素晴らしい|完璧"; then echo "excited"
  else echo "neutral"; fi
}

FEAT_EMOTION="$(read_feature emotion)"
if [ "$FEAT_EMOTION" = "on" ]; then
  EMOTION="$(detect_emotion "$TEXT")"
else
  EMOTION="neutral"
fi

FEAT_ALWAYS_ON_TOP="$(read_feature always-on-top)"
FEAT_LIPSYNC="$(read_feature lipsync)"
FEAT_BUBBLE="$(read_feature bubble)"

PAYLOAD="$(python3 -c "
import json, sys
feat_always_on_top = sys.argv[3] == 'on'
feat_lipsync       = sys.argv[4] == 'on'
feat_bubble        = sys.argv[5] == 'on'
print(json.dumps({
    'type': 'speak',
    'text': sys.argv[1],
    'emotion': sys.argv[2],
    'features': {
        'always_on_top': feat_always_on_top,
        'lipsync':       feat_lipsync,
        'bubble':        feat_bubble,
    },
}))
" "$TEXT" "$EMOTION" "$FEAT_ALWAYS_ON_TOP" "$FEAT_LIPSYNC" "$FEAT_BUBBLE")"

# websocat（優先）または Python websockets で送信
if command -v websocat >/dev/null 2>&1; then
  echo "$PAYLOAD" | websocat "$AVATAR_WS" 2>/dev/null || {
    echo "[voice] アバターアプリに接続できません（${AVATAR_WS}）" >&2
    echo "[voice] cd Agent-team/voice/desktop && npm start で起動してください。" >&2
    exit 1
  }
else
  python3 - "$AVATAR_WS" "$PAYLOAD" <<'PYEOF'
import asyncio, sys
try:
    import websockets
except ImportError:
    print("[voice] websockets が未インストールです: pip install websockets", file=sys.stderr)
    sys.exit(1)

async def send(uri, msg):
    try:
        async with websockets.connect(uri, open_timeout=2) as ws:
            await ws.send(msg)
            try:
                await asyncio.wait_for(ws.recv(), timeout=2)
            except asyncio.TimeoutError:
                pass  # ack なくても続行
    except Exception as e:
        print(f"[voice] WebSocket エラー: {e}", file=sys.stderr)
        sys.exit(1)

asyncio.run(send(sys.argv[1], sys.argv[2]))
PYEOF
fi
