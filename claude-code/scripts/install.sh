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

cleanup_temp_dir() {
  local tmp_root="${TMPDIR:-/tmp}"
  [ "$CLEANUP_TEMP" = true ] || return 0
  [ -n "$TEMP_DIR" ] || return 0
  [ -d "$TEMP_DIR" ] || return 0
  case "$TEMP_DIR" in
    /tmp/*|/private/tmp/*|"$tmp_root"/*) ;;
    *) return 0 ;;
  esac
  find "$TEMP_DIR" -depth -mindepth 1 -delete 2>/dev/null || true
  rmdir "$TEMP_DIR" 2>/dev/null || true
}

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
  CLEANUP_TEMP=true
  if git clone --depth=1 --quiet https://github.com/masa-san-jp/Agent-Aiko.git "$TEMP_DIR" 2>/dev/null; then
    printf "%s✓%s\n" "$CYAN" "$RESET"
  else
    printf "\n  %sエラー: リポジトリの取得に失敗しました%s\n" "$BOLD" "$RESET"
    cleanup_temp_dir
    exit 1
  fi
  TEMPLATE_DIR="$TEMP_DIR/claude-code/template/.claude"
fi

PROJECT_CLAUDE_DIR="$(pwd)/.claude"
AIKO_HOME="${AIKO_HOME:-$HOME/.aiko}"

case "$AIKO_HOME" in
  ""|"/"|"$HOME")
    printf "  %sエラー: AIKO_HOME が危険なパスです: %s%s\n" "$BOLD" "$AIKO_HOME" "$RESET" >&2
    cleanup_temp_dir
    exit 1
    ;;
esac

# ─────────────────────────────────────
# インストール先の確認
# ─────────────────────────────────────
if [ "$(pwd)" = "$HOME" ]; then
  printf "  %sエラー: ホームディレクトリ直下にはインストールできません%s\n" "$BOLD" "$RESET"
  printf "  Claude Code を使う対象プロジェクトへ移動してから実行してください\n\n"
  cleanup_temp_dir
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
    cleanup_temp_dir
    exit 1
  fi

  case "$CONFIRM" in
    [nN]|[nN][oO])
      printf "\n  インストールをキャンセルしました\n\n"
      cleanup_temp_dir
      exit 0
      ;;
  esac
fi
echo ""

# ─────────────────────────────────────
# インストール実行
# ─────────────────────────────────────
HAD_PROJECT_CLAUDE_MD=0
[ -e "$PROJECT_CLAUDE_DIR/CLAUDE.md" ] && HAD_PROJECT_CLAUDE_MD=1
HAD_PROJECT_SETTINGS=0
[ -e "$PROJECT_CLAUDE_DIR/settings.json" ] && HAD_PROJECT_SETTINGS=1

mkdir -p "$PROJECT_CLAUDE_DIR" "$AIKO_HOME"

copy_template_item_to_project() {
  local rel="$1"
  local src="$TEMPLATE_DIR/$rel"
  local dst="$PROJECT_CLAUDE_DIR/$rel"

  [ -e "$src" ] || return 0
  mkdir -p "$(dirname "$dst")"
  if [ -d "$src" ]; then
    mkdir -p "$dst"
    cp -R "$src/." "$dst/"
  else
    cp "$src" "$dst"
  fi
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
    local dst_child="$dst_dir/$(basename "$child")"
    if [ -d "$child" ]; then
      mkdir -p "$dst_child"
      cp -R "$child/." "$dst_child/"
    else
      cp "$child" "$dst_child"
    fi
  done
}

STATE_SOURCE="$AIKO_HOME"
if [ ! -e "$AIKO_HOME/mode" ] && [ -d "$PROJECT_CLAUDE_DIR/aiko" ]; then
  STATE_SOURCE="$PROJECT_CLAUDE_DIR/aiko"
fi

copy_state_if_missing() {
  local rel="$1"
  [ -e "$STATE_SOURCE/$rel" ] || return 0
  [ ! -e "$AIKO_HOME/$rel" ] || return 0
  mkdir -p "$(dirname "$AIKO_HOME/$rel")"
  cp -R "$STATE_SOURCE/$rel" "$AIKO_HOME/$rel"
  printf "  %s· %s を保持%s\n" "$DIM" "$rel" "$RESET"
}

USER_HAD_OVERRIDE=0
[ -e "$STATE_SOURCE/persona/aiko-override.md" ] && USER_HAD_OVERRIDE=1
USER_HAD_MODE=0
[ -e "$STATE_SOURCE/mode" ] && USER_HAD_MODE=1

copy_aiko_template_tree() {
  local item rel src dst

  mkdir -p "$AIKO_HOME"
  ( cd "$TEMPLATE_DIR/aiko" && find . -mindepth 1 -print ) | while IFS= read -r item; do
    rel="${item#./}"
    case "$rel" in
      mode|user.md|override-history.jsonl|active-persona|persona/aiko-override.md|persona/overrides|persona/overrides/*|persona/proposals|persona/proposals/*|capability/rules/rules-base.md)
        continue
        ;;
    esac

    src="$TEMPLATE_DIR/aiko/$rel"
    dst="$AIKO_HOME/$rel"
    if [ -d "$src" ]; then
      mkdir -p "$dst"
    elif [ -f "$src" ]; then
      mkdir -p "$(dirname "$dst")"
      [ -f "$dst" ] && chmod 644 "$dst" 2>/dev/null || true
      cp "$src" "$dst"
    fi
  done
}

copy_state_if_missing "mode"
copy_state_if_missing "user.md"
copy_state_if_missing "override-history.jsonl"
copy_state_if_missing "active-persona"
copy_state_if_missing "persona/aiko-override.md"
copy_state_if_missing "persona/overrides"
copy_state_if_missing "persona/proposals"
copy_state_if_missing "capability/skills"
copy_state_if_missing "capability/rules/rules-base.md"
copy_aiko_template_tree

copy_project_children "skills"
copy_project_children "scripts"
copy_template_item_to_project "session-state/current.md.example"
if [ "$HAD_PROJECT_CLAUDE_MD" -eq 0 ]; then
  copy_template_item_to_project "CLAUDE.md"
fi
if [ "$HAD_PROJECT_SETTINGS" -eq 0 ]; then
  copy_template_item_to_project "settings.json"
fi

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

mkdir -p "$PROJECT_CLAUDE_DIR/aiko"
if [ -d "$AIKO_HOME/hooks" ]; then
  if [ -e "$PROJECT_CLAUDE_DIR/aiko/hooks" ] && [ ! -L "$PROJECT_CLAUDE_DIR/aiko/hooks" ]; then
    mv "$PROJECT_CLAUDE_DIR/aiko/hooks" "$PROJECT_CLAUDE_DIR/aiko/hooks.bak.$(date +%s)"
  fi
  [ -L "$PROJECT_CLAUDE_DIR/aiko/hooks" ] && rm "$PROJECT_CLAUDE_DIR/aiko/hooks"
  ln -s "$AIKO_HOME/hooks" "$PROJECT_CLAUDE_DIR/aiko/hooks"
fi

if [ "$HAD_PROJECT_CLAUDE_MD" -eq 1 ]; then
  printf "  %s· .claude/CLAUDE.md は既存のため変更しません%s\n" "$DIM" "$RESET"
fi
if [ "$HAD_PROJECT_SETTINGS" -eq 1 ]; then
  printf "  %s· .claude/settings.json は既存のため変更しません%s\n" "$DIM" "$RESET"
fi

cleanup_temp_dir

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
