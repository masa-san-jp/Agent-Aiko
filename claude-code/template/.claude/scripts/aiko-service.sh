#!/bin/sh
# aiko-service.sh — Aiko systemd ユーザーサービス管理
# 使い方:
#   bash .claude/scripts/aiko-service.sh install [--telegram]
#   bash .claude/scripts/aiko-service.sh uninstall
#   bash .claude/scripts/aiko-service.sh start
#   bash .claude/scripts/aiko-service.sh stop
#   bash .claude/scripts/aiko-service.sh status
#   bash .claude/scripts/aiko-service.sh log

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
BOOT_SCRIPT="$SCRIPT_DIR/aiko-boot.sh"
INSTANCE_DIR=$(cd "$SCRIPT_DIR/../.." && pwd)
_proj=$(basename "$INSTANCE_DIR" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g;s/^-//;s/-$//')
SERVICE_NAME="aiko-${_proj}"
SERVICE_FILE="$HOME/.config/systemd/user/${SERVICE_NAME}.service"

_require_systemd() {
  if ! command -v systemctl > /dev/null 2>&1; then
    echo "エラー: systemd が見つかりません（macOS の場合は --daemon フラグを使用してください）"
    exit 1
  fi
}

usage() {
  echo "使い方: aiko-service.sh <command>"
  echo ""
  echo "  install [--telegram]  systemd ユーザーサービスを登録して有効化"
  echo "  uninstall             サービスを停止・削除"
  echo "  start                 サービスを起動"
  echo "  stop                  サービスを停止"
  echo "  status                サービスの状態確認"
  echo "  log                   最新ログを表示（journalctl -f）"
  echo ""
  echo "環境変数:"
  echo "  AIKO_RESTART_DELAY    install 時に unit の RestartSec へ反映（デフォルト: 5）。変更時は reinstall が必要"
}

COMMAND="${1:-}"
TELEGRAM_FLAG=""
[ $# -ge 1 ] && shift

for _arg in "$@"; do
  case "$_arg" in
    --telegram) TELEGRAM_FLAG=" --telegram" ;;
    *) echo "エラー: 不明なオプション: $_arg" >&2; usage; exit 1 ;;
  esac
done

if [ -n "$TELEGRAM_FLAG" ] && [ "$COMMAND" != "install" ]; then
  echo "エラー: --telegram フラグは install コマンドでのみ使用できます" >&2
  usage
  exit 1
fi

case "$COMMAND" in
  install)
    _require_systemd
    if [ ! -f "$BOOT_SCRIPT" ]; then
      echo "エラー: boot スクリプトが見つかりません: $BOOT_SCRIPT"
      exit 1
    fi
    if [ ! -x "$BOOT_SCRIPT" ]; then
      echo "エラー: boot スクリプトに実行権限がありません: $BOOT_SCRIPT"
      exit 1
    fi
    mkdir -p "$HOME/.config/systemd/user"
    mkdir -p "$HOME/.aiko"
    case "${AIKO_RESTART_DELAY:-}" in
      ''|*[!0-9]*) _restart_sec=5 ;;
      *) _restart_sec=$AIKO_RESTART_DELAY ;;
    esac
    TELEGRAM_ENV_FILE="$HOME/.aiko/telegram.env"
    if [ -n "$TELEGRAM_FLAG" ]; then
      if [ -z "${AIKO_TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${AIKO_TELEGRAM_CHAT_ID:-}" ]; then
        echo "⚠ AIKO_TELEGRAM_BOT_TOKEN / AIKO_TELEGRAM_CHAT_ID が未設定です"
        echo "  install 前に export で設定するか、後で $TELEGRAM_ENV_FILE を直接編集してください"
        echo "  編集後は: bash $SCRIPT_DIR/$(basename "$0") start"
      fi
      printf 'AIKO_TELEGRAM_BOT_TOKEN=%s\nAIKO_TELEGRAM_CHAT_ID=%s\n' \
        "${AIKO_TELEGRAM_BOT_TOKEN:-}" "${AIKO_TELEGRAM_CHAT_ID:-}" > "$TELEGRAM_ENV_FILE"
      chmod 600 "$TELEGRAM_ENV_FILE"
    fi
    _env_file_line=""
    [ -n "$TELEGRAM_FLAG" ] && _env_file_line="EnvironmentFile=-$TELEGRAM_ENV_FILE"
    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Aiko Claude Code Agent

[Service]
WorkingDirectory="$INSTANCE_DIR"
ExecStart="$BOOT_SCRIPT"$TELEGRAM_FLAG
Environment=AIKO_RESTART_DELAY=$_restart_sec
${_env_file_line}
Restart=on-failure
RestartSec=$_restart_sec
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
EOF
    systemctl --user daemon-reload || { echo "⚠ daemon-reload に失敗しました"; exit 1; }
    systemctl --user enable "$SERVICE_NAME" || { echo "⚠ サービスの有効化に失敗しました"; exit 1; }
    if systemctl --user is-active --quiet "$SERVICE_NAME"; then
      systemctl --user restart "$SERVICE_NAME" || { echo "⚠ サービスの再起動に失敗しました"; exit 1; }
    else
      systemctl --user start "$SERVICE_NAME" || { echo "⚠ サービスの起動に失敗しました"; exit 1; }
    fi
    echo "✓ Aiko サービスを登録・起動しました"
    echo "  ステータス: systemctl --user status $SERVICE_NAME"
    echo "  ログ:       journalctl --user -u $SERVICE_NAME -f"
    ;;
  uninstall)
    _require_systemd
    systemctl --user disable --now "$SERVICE_NAME" 2>/dev/null || true
    rm -f "$SERVICE_FILE"
    systemctl --user daemon-reload
    echo "✓ Aiko サービスを削除しました"
    ;;
  start)   _require_systemd; systemctl --user start "$SERVICE_NAME" ;;
  stop)    _require_systemd; systemctl --user stop "$SERVICE_NAME" ;;
  status)  _require_systemd; systemctl --user status "$SERVICE_NAME" ;;
  log)     _require_systemd; journalctl --user -u "$SERVICE_NAME" -f ;;
  *)       usage; exit 1 ;;
esac
