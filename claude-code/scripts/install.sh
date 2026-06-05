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
ASSUME_YES=false

while [ $# -gt 0 ]; do
  case "$1" in
    -y|--yes)
      ASSUME_YES=true
      ;;
    -h|--help)
      printf "Agent-Aiko Claude Code installer\n\n"
      printf "Usage: bash claude-code/scripts/install.sh [--yes]\n\n"
      printf "Installs Aiko commands into the current project and initializes ~/.aiko.\n"
      printf "Existing .claude/CLAUDE.md and .claude/settings.json are not overwritten.\n"
      exit 0
      ;;
    *)
      printf "  %sエラー: 未知のオプションです: %s%s\n" "$BOLD" "$1" "$RESET" >&2
      exit 1
      ;;
  esac
  shift
done

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

PROJECT_CLAUDE_DIR="$(pwd)/.claude"
AIKO_HOME="${AIKO_HOME:-$HOME/.aiko}"

case "$AIKO_HOME" in
  ""|"/"|"$HOME")
    printf "  %sエラー: AIKO_HOME が危険なパスです: %s%s\n" "$BOLD" "$AIKO_HOME" "$RESET" >&2
    [ "$CLEANUP_TEMP" = true ] && rm -rf "$TEMP_DIR"
    exit 1
    ;;
esac

# ─────────────────────────────────────
# インストール先の確認
# ─────────────────────────────────────
if [ "$(pwd)" = "$HOME" ]; then
  printf "  %sエラー: ホームディレクトリ直下にはインストールできません%s\n" "$BOLD" "$RESET"
  printf "  Claude Code を使う対象プロジェクトへ移動してから実行してください\n\n"
  [ "$CLEANUP_TEMP" = true ] && rm -rf "$TEMP_DIR"
  exit 1
fi

printf "  インストール先: %s%s%s\n\n" "$BOLD" "$(pwd)" "$RESET"
printf "  Aiko 共有ストア: %s%s%s\n\n" "$BOLD" "$AIKO_HOME" "$RESET"

if [ "$ASSUME_YES" != true ]; then
  printf "  ここに Agent Aiko をインストールしますか？ [Y/n]: "
  if [ -t 0 ]; then
    read -r CONFIRM
  elif [ -r /dev/tty ]; then
    read -r CONFIRM < /dev/tty
  else
    printf "\n  %sエラー: 非対話環境では --yes を指定してください%s\n" "$BOLD" "$RESET"
    [ "$CLEANUP_TEMP" = true ] && rm -rf "$TEMP_DIR"
    exit 1
  fi

  case "$CONFIRM" in
    [nN]|[nN][oO])
      printf "\n  インストールをキャンセルしました\n\n"
      [ "$CLEANUP_TEMP" = true ] && rm -rf "$TEMP_DIR"
      exit 0
      ;;
  esac
fi
echo ""

# ─────────────────────────────────────
# インストール実行
# ─────────────────────────────────────
mkdir -p "$PROJECT_CLAUDE_DIR" "$AIKO_HOME"

copy_template_item_to_project() {
  local rel="$1"
  local src="$TEMPLATE_DIR/$rel"
  local dst="$PROJECT_CLAUDE_DIR/$rel"

  [ -e "$src" ] || return 0
  rm -rf "$dst"
  mkdir -p "$(dirname "$dst")"
  cp -R "$src" "$dst"
}

copy_project_children() {
  local rel="$1"
  local src_dir="$TEMPLATE_DIR/$rel"
  local dst_dir="$PROJECT_CLAUDE_DIR/$rel"
  local child

  [ -d "$src_dir" ] || return 0
  mkdir -p "$dst_dir"
  for child in "$src_dir"/*; do
    [ -e "$child" ] || continue
    rm -rf "$dst_dir/$(basename "$child")"
    cp -R "$child" "$dst_dir/"
  done
}

STASH=$(mktemp -d)
STATE_SOURCE="$AIKO_HOME"
if [ ! -e "$AIKO_HOME/mode" ] && [ -d "$PROJECT_CLAUDE_DIR/aiko" ]; then
  STATE_SOURCE="$PROJECT_CLAUDE_DIR/aiko"
fi

stash_if_exists() {
  local rel="$1"
  if [ -e "$STATE_SOURCE/$rel" ]; then
    mkdir -p "$(dirname "$STASH/$rel")"
    cp -R "$STATE_SOURCE/$rel" "$STASH/$rel"
  fi
}

stash_if_exists "mode"
stash_if_exists "user.md"
stash_if_exists "override-history.jsonl"
stash_if_exists "active-persona"
stash_if_exists "persona/aiko-override.md"
stash_if_exists "persona/overrides"
stash_if_exists "persona/proposals"
stash_if_exists "capability/skills"
stash_if_exists "capability/rules/rules-base.md"

rm -rf "$AIKO_HOME"
mkdir -p "$(dirname "$AIKO_HOME")"
cp -R "$TEMPLATE_DIR/aiko" "$AIKO_HOME"

copy_project_children "skills"
copy_project_children "scripts"
copy_template_item_to_project "session-state/current.md.example"

restore_if_stashed() {
  local rel="$1"
  if [ -e "$STASH/$rel" ]; then
    rm -rf "$AIKO_HOME/$rel"
    mkdir -p "$(dirname "$AIKO_HOME/$rel")"
    cp -R "$STASH/$rel" "$AIKO_HOME/$rel"
    printf "  %s· %s を保持%s\n" "$DIM" "$rel" "$RESET"
  fi
}

USER_HAD_OVERRIDE=0
[ -e "$STASH/persona/aiko-override.md" ] && USER_HAD_OVERRIDE=1
USER_HAD_MODE=0
[ -e "$STASH/mode" ] && USER_HAD_MODE=1

restore_if_stashed "mode"
restore_if_stashed "user.md"
restore_if_stashed "override-history.jsonl"
restore_if_stashed "active-persona"
restore_if_stashed "persona/aiko-override.md"
restore_if_stashed "persona/overrides"
restore_if_stashed "persona/proposals"
restore_if_stashed "capability/skills"
restore_if_stashed "capability/rules/rules-base.md"

rm -rf "$STASH"

ORIGIN="$AIKO_HOME/persona/origin/persona.md"
LEGACY_ORIGIN="$AIKO_HOME/persona/aiko-origin.md"
OVERRIDE="$AIKO_HOME/persona/aiko-override.md"
MODE_FILE="$AIKO_HOME/mode"

if [ "$USER_HAD_OVERRIDE" -eq 0 ]; then
  if [ -f "$ORIGIN" ]; then
    cp "$ORIGIN" "$OVERRIDE"
  else
    cp "$LEGACY_ORIGIN" "$OVERRIDE"
  fi
fi

if [ "$USER_HAD_MODE" -eq 0 ]; then
  printf 'origin\n' > "$MODE_FILE"
fi

chmod 444 "$ORIGIN" "$LEGACY_ORIGIN" "$AIKO_HOME/persona/INVARIANTS.md" 2>/dev/null || true
find "$AIKO_HOME/hooks" -type f -name '*.sh' -exec chmod +x {} +
[ -d "$PROJECT_CLAUDE_DIR/scripts" ] && find "$PROJECT_CLAUDE_DIR/scripts" -type f -name '*.sh' -exec chmod +x {} +

mkdir -p "$AIKO_HOME/persona/overrides"

if [ -e "$PROJECT_CLAUDE_DIR/CLAUDE.md" ]; then
  printf "  %s· .claude/CLAUDE.md は既存のため変更しません%s\n" "$DIM" "$RESET"
fi
if [ -e "$PROJECT_CLAUDE_DIR/settings.json" ]; then
  printf "  %s· .claude/settings.json は既存のため変更しません%s\n" "$DIM" "$RESET"
fi

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
printf "  %s/aiko-personas%s            利用可能な人格の一覧を表示\n" "$BOLD" "$RESET"
printf "  %s/aiko-new <名前>%s          新しい人格を作成してアクティブにする\n" "$BOLD" "$RESET"
printf "  %s/aiko-select <名前>%s       人格を切り替える\n" "$BOLD" "$RESET"
printf "  %s/aiko-delete%s              現在の人格にお別れを告げて削除する（確認あり）\n" "$BOLD" "$RESET"
printf "\n"
printf "  %s────────────────────────────────────────────%s\n\n" "$CYAN" "$RESET"

# 開始手順
printf "  次の手順で Aiko と話し始められます：\n\n"
printf "  %s1.%s claude を起動する\n\n" "$BOLD" "$RESET"
printf "     %sclaude%s\n\n" "$CYAN$BOLD" "$RESET"
printf "  %s2.%s チャットで Aiko を起動する\n\n" "$BOLD" "$RESET"
printf "     %s/aiko%s\n\n" "$CYAN$BOLD" "$RESET"
printf "  Aiko があなたの名前を聞くので、答えると使い始められます。\n\n"
