#!/bin/sh
# aiko-boot.sh — Aiko 自動再起動ラッパー
# 使い方:
#   bash .claude/scripts/aiko-boot.sh                  # 通常モード（自動再起動、Ctrl+C で停止）
#   bash .claude/scripts/aiko-boot.sh --telegram       # Telegram ボットモード（自動再起動）
#   bash .claude/scripts/aiko-boot.sh --daemon         # デーモンモード（バックグラウンド）
#   bash .claude/scripts/aiko-boot.sh --daemon --telegram
#   bash .claude/scripts/aiko-boot.sh --stop           # デーモン停止
#   bash .claude/scripts/aiko-boot.sh --status         # 起動状態確認
# 注: claude は & + wait で起動し SIGTERM/INT を子プロセスに転送します（daemon 時は HUP 無視）

case "${AIKO_RESTART_DELAY:-}" in
  ''|*[!0-9]*) RESTART_DELAY=5 ;;
  *) RESTART_DELAY=$AIKO_RESTART_DELAY ;;
esac
AIKO_PID_FILE="${AIKO_PID_FILE:-$HOME/.aiko/aiko.pid}"
AIKO_LOG_FILE="${AIKO_LOG_FILE:-$HOME/.aiko/aiko.log}"

MODE="normal"
DAEMON=false

SCRIPT_PATH=$(cd "$(dirname "$0")" && pwd)/$(basename "$0")

CHILD_PID=""
_cleanup() {
  if [ -n "$CHILD_PID" ] && kill -0 "$CHILD_PID" 2>/dev/null; then
    kill "$CHILD_PID" 2>/dev/null || true
    wait "$CHILD_PID" 2>/dev/null || true
  fi
  exit 0
}
trap '_cleanup' TERM INT
[ -z "${AIKO_DAEMON:-}" ] && trap '_cleanup' HUP

for arg in "$@"; do
  case "$arg" in
    --telegram) MODE="telegram" ;;
    --daemon)   DAEMON=true ;;
    --stop)
      if [ -f "$AIKO_PID_FILE" ]; then
        PID=$(cat "$AIKO_PID_FILE")
        case "$PID" in
          ''|*[!0-9]*)
            echo "⚠ PID ファイルの値が不正です。削除します: $AIKO_PID_FILE"
            rm -f "$AIKO_PID_FILE"
            ;;
          *)
            if ! kill -0 "$PID" 2>/dev/null; then
              echo "○ プロセスは既に終了しています。PID ファイルを削除します"
              rm -f "$AIKO_PID_FILE"
            elif ! ps -p "$PID" -o args= 2>/dev/null | grep -qF "/aiko-boot.sh"; then
              echo "⚠ PID $PID は aiko-boot.sh のプロセスではありません。PID ファイルを保持します"
              echo "  手動確認: ps -p $PID -o args="
            else
              if kill "$PID" 2>/dev/null; then
                i=0
                while kill -0 "$PID" 2>/dev/null && [ "$i" -lt 3 ]; do
                  sleep 1
                  i=$((i + 1))
                done
                if kill -0 "$PID" 2>/dev/null; then
                  echo "⚠ プロセスが終了しませんでした (PID: $PID)。PID ファイルを保持します"
                else
                  echo "◼ Aiko を停止しました (PID: $PID)"
                  rm -f "$AIKO_PID_FILE"
                fi
              else
                echo "⚠ 停止に失敗しました (PID: $PID)。PID ファイルを保持します"
              fi
            fi
            ;;
        esac
      else
        echo "Aiko は起動していません（PID ファイルなし: $AIKO_PID_FILE）"
      fi
      exit 0
      ;;
    --status)
      if [ -f "$AIKO_PID_FILE" ]; then
        PID=$(cat "$AIKO_PID_FILE")
        case "$PID" in
          ''|*[!0-9]*) echo "⚠ PID ファイルが不正: $AIKO_PID_FILE"; rm -f "$AIKO_PID_FILE" ;;
          *)
            if ! kill -0 "$PID" 2>/dev/null; then
              echo "○ Aiko は停止しています（古い PID ファイルを削除: $AIKO_PID_FILE）"
              rm -f "$AIKO_PID_FILE"
            elif ! ps -p "$PID" -o args= 2>/dev/null | grep -qF "/aiko-boot.sh"; then
              echo "⚠ PID $PID は aiko-boot.sh のプロセスではありません（PID 再利用の可能性）"
              echo "  手動確認: ps -p $PID -o args="
            else
              echo "● Aiko 起動中 (PID: $PID, log: $AIKO_LOG_FILE)"
            fi
            ;;
        esac
      else
        echo "○ Aiko は停止しています"
      fi
      exit 0
      ;;
    --*)
      echo "エラー: 不明なオプション: $arg" >&2
      echo "使い方: aiko-boot.sh [--telegram] [--daemon] [--stop] [--status]" >&2
      exit 1
      ;;
  esac
done

if $DAEMON; then
  if [ -f "$AIKO_PID_FILE" ]; then
    EXISTING_PID=$(cat "$AIKO_PID_FILE")
    case "$EXISTING_PID" in
      ''|*[!0-9]*) rm -f "$AIKO_PID_FILE" ;;
      *)
        if kill -0 "$EXISTING_PID" 2>/dev/null; then
          if ps -p "$EXISTING_PID" -o args= 2>/dev/null | grep -qF "/aiko-boot.sh"; then
            echo "⚠ Aiko は既に起動中です (PID: $EXISTING_PID)"
            echo "  停止するには: bash $SCRIPT_PATH --stop"
            exit 1
          else
            echo "⚠ PID $EXISTING_PID は別プロセスです。古い PID ファイルを削除して起動します"
            rm -f "$AIKO_PID_FILE"
          fi
        else
          rm -f "$AIKO_PID_FILE"
        fi
        ;;
    esac
  fi

  mkdir -p "$(dirname "$AIKO_PID_FILE")"
  mkdir -p "$(dirname "$AIKO_LOG_FILE")"
  DAEMON_ARGS=""
  [ "$MODE" = "telegram" ] && DAEMON_ARGS="--telegram"
  AIKO_DAEMON=1 nohup sh "$SCRIPT_PATH" $DAEMON_ARGS >> "$AIKO_LOG_FILE" 2>&1 &
  DAEMON_PID=$!
  if kill -0 "$DAEMON_PID" 2>/dev/null; then
    echo $DAEMON_PID > "$AIKO_PID_FILE"
    echo "▶ Aiko をバックグラウンドで起動しました (PID: $DAEMON_PID)"
    echo "  ログ:   $AIKO_LOG_FILE"
    echo "  停止:   bash $SCRIPT_PATH --stop"
    echo "  状態:   bash $SCRIPT_PATH --status"
  else
    echo "⚠ Aiko の起動に失敗しました（ログを確認: $AIKO_LOG_FILE）"
    exit 1
  fi
  exit 0
fi

_telegram_notify() {
  if [ -n "${AIKO_TELEGRAM_BOT_TOKEN}" ] && [ -n "${AIKO_TELEGRAM_CHAT_ID}" ]; then
    curl -s --connect-timeout 3 --max-time 5 -X POST \
      "https://api.telegram.org/bot${AIKO_TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${AIKO_TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=$1" \
      > /dev/null 2>&1 || true
  fi
}

_run_claude() {
  if [ "$MODE" = "telegram" ]; then
    _telegram_notify "🤖 Aiko（Telegram モード）起動しました"
    claude --dangerously-skip-permissions \
      --channels plugin:telegram@claude-plugins-official &
  else
    claude -c &
  fi
  CHILD_PID=$!
  wait "$CHILD_PID" 2>/dev/null
  _rc=$?
  CHILD_PID=""
  return $_rc
}

echo "▶ Aiko を起動します (mode: ${MODE})..."

while true; do
  _run_claude
  EXIT_CODE=$?
  [ "$MODE" = "telegram" ] && _telegram_notify "🔄 Aiko セッション終了 (exit: ${EXIT_CODE})。再起動します..."
  echo "◀ セッション終了 (exit: ${EXIT_CODE})"
  echo "  ${RESTART_DELAY}秒後に再起動します... (Ctrl+C で停止)"
  sleep "$RESTART_DELAY"
done
