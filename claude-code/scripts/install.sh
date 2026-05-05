#!/bin/bash
# Agent-Aiko Claude Code 版 installer
# 経路：
#   curl -fsSL https://raw.githubusercontent.com/masa-san-jp/Agent-Aiko/main/scripts/install.sh | bash   # 互換ラッパー経由（推奨）
#   bash scripts/install.sh                                                                              # 互換ラッパー経由
#   bash claude-code/scripts/install.sh                                                                  # 直接実行

set -e

# ─────────────────────────────────────
# カラー設定
# ─────────────────────────────────────
if [ -t 1 ]; then
  CYAN=$'\033[36m'
  WHITE=$'\033[97m'
  BOLD=$'\033[1m'
  DIM=$'\033[2m'
  RESET=$'\033[0m'
else
  CYAN="" WHITE="" BOLD="" DIM="" RESET=""
fi

# ─────────────────────────────────────
# ロゴ表示
# ─────────────────────────────────────
echo ""
printf "%s" "$CYAN"
cat << 'LOGO'
██  ██████████████  ██
██████████████████████
██████████████████████
██████  ██████  ██████
  ████  ██████  ████
  ██████████████████
    ████      ████
LOGO
printf "%s" "$RESET"
echo ""
printf "%s" "$WHITE$BOLD"
cat << 'TITLE'
 ███   ████ █████ █   █ █████
█   █ █     █     ██  █   █
█████ █  ██ ████  █ █ █   █
█   █ █   █ █     █  ██   █
█   █  ████ █████ █   █   █

 ███  ███ █   █  ███
█   █  █  █  █  █   █
█████  █  ████  █   █
█   █  █  █  █  █   █
█   █ ███ █   █  ███
TITLE
printf "%s\n\n" "$RESET"

# ─────────────────────────────────────
# テンプレートの場所を決定
# curl | bash の場合はリポジトリをクローン
# ─────────────────────────────────────
TEMP_DIR=""
CLEANUP_TEMP=false

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-}")" 2>/dev/null && pwd || echo "")"
# claude-code/scripts/install.sh から見て ../template/.claude が同居の template
TEMPLATE_DIR="${SCRIPT_DIR}/../template/.claude"

if [ ! -d "$TEMPLATE_DIR" ]; then
  printf "  リポジトリを取得しています...  "
  TEMP_DIR=$(mktemp -d)
  if git clone --depth=1 --quiet https://github.com/masa-san-jp/Agent-Aiko.git "$TEMP_DIR" 2>/dev/null; then
    printf "%s✓%s\n" "$CYAN" "$RESET"
  else
    printf "\n  %sエラー: リポジトリの取得に失敗しました%s\n" "$BOLD" "$RESET"
    exit 1
  fi
  TEMPLATE_DIR="$TEMP_DIR/claude-code/template/.claude"
  CLEANUP_TEMP=true
fi

DEST_DIR="$(pwd)/.claude"

# ─────────────────────────────────────
# インストール先の確認
# ─────────────────────────────────────
printf "  インストール先: %s%s%s\n\n" "$BOLD" "$(pwd)" "$RESET"
printf "  ここに Agent Aiko をインストールしますか？ [Y/n]: "

if [ -t 0 ]; then
  read -r CONFIRM
else
  read -r CONFIRM < /dev/tty
fi

case "$CONFIRM" in
  [nN]|[nN][oO])
    printf "\n  インストールをキャンセルしました\n\n"
    [ "$CLEANUP_TEMP" = true ] && rm -rf "$TEMP_DIR"
    exit 0
    ;;
esac
echo ""

# ─────────────────────────────────────
# インストール実行
# ─────────────────────────────────────
mkdir -p "$DEST_DIR"

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
stash_if_exists "aiko/persona/proposals"
stash_if_exists "aiko/capability/rules/rules-base.md"

cp -R "$TEMPLATE_DIR/." "$DEST_DIR/"

restore_if_stashed() {
  local rel="$1"
  if [ -e "$STASH/$rel" ]; then
    rm -rf "$DEST_DIR/$rel"
    mkdir -p "$(dirname "$DEST_DIR/$rel")"
    cp -R "$STASH/$rel" "$DEST_DIR/$rel"
    printf "  %s· %s を保持%s\n" "$DIM" "$rel" "$RESET"
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
restore_if_stashed "aiko/persona/proposals"
restore_if_stashed "aiko/capability/rules/rules-base.md"

rm -rf "$STASH"

ORIGIN="$DEST_DIR/aiko/persona/aiko-origin.md"
OVERRIDE="$DEST_DIR/aiko/persona/aiko-override.md"
MODE_FILE="$DEST_DIR/aiko/mode"

if [ "$USER_HAD_OVERRIDE" -eq 0 ]; then
  cp "$ORIGIN" "$OVERRIDE"
fi

if [ "$USER_HAD_MODE" -eq 0 ]; then
  printf 'origin\n' > "$MODE_FILE"
fi

chmod 444 "$ORIGIN" "$DEST_DIR/aiko/persona/INVARIANTS.md" 2>/dev/null || true
find "$DEST_DIR/aiko/hooks" -type f -name '*.sh' -exec chmod +x {} +
[ -d "$DEST_DIR/scripts" ] && find "$DEST_DIR/scripts" -type f -name '*.sh' -exec chmod +x {} +

[ "$CLEANUP_TEMP" = true ] && rm -rf "$TEMP_DIR"

# ─────────────────────────────────────
# 完了メッセージ
# ─────────────────────────────────────
printf "  %s✓ インストール完了！%s\n\n" "$CYAN$BOLD" "$RESET"

# コマンド一覧
printf "  %s── コマンド一覧 ────────────────────────────%s\n" "$CYAN" "$RESET"
printf "\n"
printf "  %s/aiko-or%s                  アイコ（カスタマイズ）に切り替える\n" "$BOLD" "$RESET"
printf "  %s/aiko-or <カスタマイズ内容>%s Aiko の性格を変える（自動で保存）\n" "$BOLD" "$RESET"
printf "  %s/aiko-origin%s (%s/aiko-org%s)  オリジナルの Aiko に戻す\n" "$BOLD" "$RESET" "$BOLD" "$RESET"
printf "  %s/aiko-reset%s               自分用 Aiko をリセット（確認あり）\n" "$BOLD" "$RESET"
printf "  %s/aiko-export%s              自分用 Aiko を書き出す（共有・移行用）\n" "$BOLD" "$RESET"
printf "  %s/aiko-diff%s                オリジナルとの差分を確認\n" "$BOLD" "$RESET"
printf "\n"
printf "  %s────────────────────────────────────────────%s\n\n" "$CYAN" "$RESET"

# 開始手順
printf "  次の手順で Aiko と話し始められます：\n\n"
printf "  %s1.%s claude を起動する\n\n" "$BOLD" "$RESET"
printf "     %sclaude%s\n\n" "$CYAN$BOLD" "$RESET"
printf "  %s2.%s チャットに話しかける（例）\n\n" "$BOLD" "$RESET"
printf "     %sはじめまして%s\n\n" "$CYAN$BOLD" "$RESET"
printf "  Aiko があなたの名前を聞くので、答えると使い始められます。\n\n"
