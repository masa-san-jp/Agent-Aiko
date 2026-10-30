#!/bin/bash
# Agent-Aiko Claude Code 版 installer
# 経路：
#   curl -fsSL https://raw.githubusercontent.com/masa-san-jp/Agent-Aiko/v0.3.5/scripts/install.sh | bash   # 互換ラッパー経由（推奨）
#   ラッパーの PINNED_REF は、そのリリースのタグに合わせる。
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
# curl | bash の場合は Release を取得する。main の clone には落ちない。
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

# 取得元。テストから file:// を指せるように変数にしてある。
RELEASE_API="${AGENT_AIKO_RELEASE_API:-https://api.github.com/repos/masa-san-jp/Agent-Aiko/releases}"
RELEASE_DL="${AGENT_AIKO_RELEASE_DL:-https://github.com/masa-san-jp/Agent-Aiko/releases/download}"
RELEASE_CHANNEL="${AGENT_AIKO_CHANNEL:-stable}"

# sha256 を取る道具は OS で名前が違う。無ければ「検証できない」と言って止まる——
# 検証を飛ばして入れるくらいなら入れないほうがいい。
sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    return 1
  fi
}

# JSON から tag_name を1つ取る。jq を要求しない（入っていない環境がある）。
first_tag_name() {
  grep -o '"tag_name"[[:space:]]*:[[:space:]]*"[^"]*"' "$1" | head -1 |
    sed 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/'
}

resolve_release_tag() {
  local out="$1" url
  if [ -n "${AGENT_AIKO_VERSION:-}" ]; then
    printf '%s' "$AGENT_AIKO_VERSION"
    return 0
  fi
  # stable は latest（GitHub は prerelease を latest に含めない）。
  # beta は一覧の先頭＝最新の公開。
  if [ "$RELEASE_CHANNEL" = "beta" ]; then url="${RELEASE_API}"; else url="${RELEASE_API}/latest"; fi
  curl -fsSL "$url" -o "$out" 2>/dev/null || return 1
  local tag
  tag="$(first_tag_name "$out")"
  [ -n "$tag" ] || return 1
  printf '%s' "$tag"
}

# Release を取って checksum を照合してから展開する。
# **照合に失敗したら fallback しない。** 落ちたものを別経路で入れ直すのは、
# 検証していないものを入れるのと同じ。
fetch_verified_release() {
  # local は1文の中で左から順に代入されるだけで、同じ文の中の変数はまだ見えない。
  # 1文にまとめると name が "agent-aiko-" になる（実際にそう書いて踏んだ）。
  local dest="$1"
  local tag="$2"
  local name="agent-aiko-${tag}"
  local work="${dest}/.download"
  mkdir -p "$work"
  curl -fsSL "${RELEASE_DL}/${tag}/${name}.tar.gz" -o "${work}/${name}.tar.gz" 2>/dev/null || return 2
  curl -fsSL "${RELEASE_DL}/${tag}/SHA256SUMS" -o "${work}/SHA256SUMS" 2>/dev/null || return 2

  local actual expected
  actual="$(sha256_of "${work}/${name}.tar.gz")" || return 3
  expected="$(grep -F "${name}.tar.gz" "${work}/SHA256SUMS" | awk '{print $1}' | head -1)"
  [ -n "$expected" ] || return 4
  [ "$actual" = "$expected" ] || return 4
  # file:// は試験用。https の Release は checksum のあと attestation も見る。
  verify_release_attestation "${work}/${name}.tar.gz" || return 6

  tar -xzf "${work}/${name}.tar.gz" -C "$dest" || return 5
  printf '%s' "${dest}/${name}"
}

verify_release_attestation() {
  case "$RELEASE_DL" in
    file:*) return 0 ;;
  esac
  if ! command -v gh >/dev/null 2>&1; then
    return 6
  fi
  gh attestation verify "$1" --repo masa-san-jp/Agent-Aiko >/dev/null 2>&1 || return 6
}

if [ ! -d "$TEMPLATE_DIR" ]; then
  TEMP_DIR=$(mktemp -d)
  CLEANUP_TEMP=true
  RELEASE_TAG=""
  EXTRACTED=""

  if [ -n "${AGENT_AIKO_REF:-}" ]; then
    case "$AGENT_AIKO_REF" in
      v*)
        RELEASE_TAG="$AGENT_AIKO_REF"
        ;;
      *)
        printf "  %sエラー: AGENT_AIKO_REF はリリースタグ（v...）だけです: %s%s\n" "$BOLD" "$AGENT_AIKO_REF" "$RESET" >&2
        printf "  ブランチの取得はしません。\n" >&2
        cleanup_temp_dir
        exit 1
        ;;
    esac
  fi

  printf "  配布物を取得しています...  "
  if [ -z "$RELEASE_TAG" ]; then
    RELEASE_TAG="$(resolve_release_tag "${TEMP_DIR}/releases.json" || true)"
  fi
  if [ -z "$RELEASE_TAG" ]; then
    printf "\n  %s· %s の配布物が見つかりません。リポジトリからの取得はしません%s\n" "$DIM" "$RELEASE_CHANNEL" "$RESET" >&2
    printf "  %s（beta を使うなら AGENT_AIKO_CHANNEL=beta）%s\n" "$DIM" "$RESET" >&2
    cleanup_temp_dir
    exit 1
  fi

  set +e
  EXTRACTED="$(fetch_verified_release "$TEMP_DIR" "$RELEASE_TAG")"
  fetch_status=$?
  set -e
  case "$fetch_status" in
    0) printf "%s✓%s %s（checksum 照合済み）\n" "$CYAN" "$RESET" "$RELEASE_TAG" ;;
    3)
      printf "\n  %sエラー: sha256 を計算する道具がありません（sha256sum / shasum）%s\n" "$BOLD" "$RESET" >&2
      printf "  検証できないものは入れません。\n" >&2
      cleanup_temp_dir; exit 1 ;;
    4)
      printf "\n  %sエラー: 配布物の checksum が一致しません（%s）%s\n" "$BOLD" "$RELEASE_TAG" "$RESET" >&2
      printf "  取得したものが壊れているか、途中で差し替えられています。中止します。\n" >&2
      cleanup_temp_dir; exit 1 ;;
    6)
      printf "\n  %sエラー: 配布物の attestation を検証できません（%s）%s\n" "$BOLD" "$RELEASE_TAG" "$RESET" >&2
      printf "  https の Release には gh attestation verify が要ります。\n" >&2
      cleanup_temp_dir; exit 1 ;;
    *)
      printf "\n  %sエラー: 配布物を取得できませんでした（%s）%s\n" "$BOLD" "$RELEASE_TAG" "$RESET" >&2
      printf "  リポジトリからの取得はしません。\n" >&2
      cleanup_temp_dir; exit 1 ;;
  esac
  TEMPLATE_DIR="$EXTRACTED/claude-code/template/.claude"
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
# シンボリックリンクを解いてから比べる。macOS の $TMPDIR は /var/folders/... で、
# pwd が返すのは /private/var/folders/... ——文字列のまま比べると一致せず、
# ホーム直下でも素通りする（macOS を CI に足して判明。2026-08-01）。
CURRENT_REAL="$(pwd -P)"
HOME_REAL="$(cd "$HOME" 2>/dev/null && pwd -P || printf '%s' "$HOME")"
if [ "$CURRENT_REAL" = "$HOME_REAL" ]; then
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
if [ -L "$PROJECT_CLAUDE_DIR" ]; then
  printf "  %sエラー: .claude がシンボリックリンクです。中止します。%s\n" "$BOLD" "$RESET" >&2
  exit 1
fi

path_exists() {
  [ -e "$1" ] || [ -L "$1" ]
}

backup_existing_path() {
  local dst="$1"
  local backup="${dst}.bak.$(date +%s)"

  while path_exists "$backup"; do
    backup="${dst}.bak.$(date +%s).$RANDOM"
  done
  mv "$dst" "$backup"
  printf "  %s· %s を %s に退避%s\n" "$DIM" "$dst" "$backup" "$RESET"
}

# 親がシンボリックリンクだと、その先（ホームのファイルなど）へ書いてしまう。
# 見るのはインストール先の根から下だけ。/tmp 自体がリンクの環境で全部止まらないようにする。
assert_parents_are_not_symlinks() {
  local path="$1"
  local stop="$2"
  local walk
  walk=$(dirname "$path")
  while [ "$walk" != "$stop" ] && [ "$walk" != "/" ] && [ "$walk" != "." ]; do
    if [ -L "$walk" ]; then
      printf "  %sエラー: インストール先の親がシンボリックリンクです: %s%s\n" "$BOLD" "$walk" "$RESET" >&2
      printf "  リンク先のファイルをテンプレートで上書きしないため、中止します。\n" >&2
      exit 1
    fi
    walk=$(dirname "$walk")
  done
}

prepare_destination_for_template() {
  local src="$1"
  local dst="$2"
  local stop="/"

  case "$dst" in
    "$PROJECT_CLAUDE_DIR"/*) stop="$PROJECT_CLAUDE_DIR" ;;
    "$AIKO_HOME"/*) stop="$AIKO_HOME" ;;
  esac
  assert_parents_are_not_symlinks "$dst" "$stop"

  path_exists "$dst" || return 0

  # chmod も cp もリンクを辿って、指しているファイルを書き換える。
  # リンク自体を退避してから、普通のファイルとして置く。
  if [ -L "$dst" ]; then
    backup_existing_path "$dst"
    return 0
  fi

  if [ -d "$src" ]; then
    if [ ! -d "$dst" ]; then
      backup_existing_path "$dst"
    else
      chmod -R u+w "$dst" 2>/dev/null || true
    fi
  elif [ -d "$dst" ]; then
    backup_existing_path "$dst"
  elif [ -f "$dst" ]; then
    chmod 644 "$dst" 2>/dev/null || true
  fi
}

copy_template_item_to_project() {
  local rel="$1"
  local src="$TEMPLATE_DIR/$rel"
  local dst="$PROJECT_CLAUDE_DIR/$rel"

  [ -e "$src" ] || return 0
  mkdir -p "$(dirname "$dst")"
  prepare_destination_for_template "$src" "$dst"
  if [ -d "$src" ]; then
    mkdir -p "$dst"
    cp -RP "$src/." "$dst/"
  else
    cp -P "$src" "$dst"
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
    prepare_destination_for_template "$child" "$dst_child"
    if [ -d "$child" ]; then
      mkdir -p "$dst_child"
      cp -RP "$child/." "$dst_child/"
    else
      cp -P "$child" "$dst_child"
    fi
  done
}

# プロジェクトの .claude/aiko は、他人のリポジトリに仕込まれた人格であることがある。
# 初回導入で ~/.aiko（全プロジェクト共有）へコピーしない。移すのは
# /aiko-migrate-to-shared を利用者が明示したときだけ。
STATE_SOURCE="$AIKO_HOME"
if [ ! -e "$AIKO_HOME/mode" ] && [ -d "$PROJECT_CLAUDE_DIR/aiko" ]; then
  printf "  %s· プロジェクトの .claude/aiko は共有ストアへ取り込みません。%s\n" "$DIM" "$RESET"
  printf "  %s  中身を確認してから /aiko-migrate-to-shared を実行してください。%s\n" "$DIM" "$RESET"
fi

copy_state_if_missing() {
  local rel="$1"
  [ -e "$STATE_SOURCE/$rel" ] || return 0
  [ ! -e "$AIKO_HOME/$rel" ] || return 0
  mkdir -p "$(dirname "$AIKO_HOME/$rel")"
  cp -RP "$STATE_SOURCE/$rel" "$AIKO_HOME/$rel"
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
      mode|user.md|user-profile.json|user-proposal.md|override-history.jsonl|active-persona|speech-style|speech-style-proposal|speech-styles|speech-styles/*|persona/origin/user.md|persona/aiko-override.md|persona/override|persona/override/*|persona/overrides|persona/overrides/*|persona/proposals|persona/proposals/*|capability/rules/rules-base.md)
        # 利用者のものは上書きせず、uninstall の記録にも残さない。
        # 初期値が必要なファイルは、共有ストアに無いときだけ置く。
        # プロジェクト側の rules-base はコピーしない。
        if { [ "$rel" = "capability/rules/rules-base.md" ] || [ "$rel" = "persona/origin/user.md" ]; } && [ ! -e "$AIKO_HOME/$rel" ] && [ ! -L "$AIKO_HOME/$rel" ]; then
          mkdir -p "$(dirname "$AIKO_HOME/$rel")"
          cp -P "$TEMPLATE_DIR/aiko/$rel" "$AIKO_HOME/$rel"
        fi
        continue
        ;;
    esac

    src="$TEMPLATE_DIR/aiko/$rel"
    dst="$AIKO_HOME/$rel"
    if [ -d "$src" ]; then
      prepare_destination_for_template "$src" "$dst"
      mkdir -p "$dst"
    elif [ -f "$src" ]; then
      mkdir -p "$(dirname "$dst")"
      prepare_destination_for_template "$src" "$dst"
      cp -P "$src" "$dst"
      # 何を置いたかを残す。これが無いと、`aiko uninstall` は「配布物のもの」と
      # 「利用者が後から置いたもの」を推測で分けることになる——推測で消すのは
      # やってはいけないことの筆頭。
      printf '%s\n' "$rel" >> "$MANIFEST_TMP"
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
MANIFEST_TMP="$(mktemp)"
copy_aiko_template_tree
# Release archives omit this seed so older updaters cannot overwrite it. A new
# installation still needs the same initial file; never replace an existing
# file or follow a dangling symlink.
ORIGIN_USER="$AIKO_HOME/persona/origin/user.md"
if ! path_exists "$ORIGIN_USER"; then
  assert_parents_are_not_symlinks "$ORIGIN_USER" "$AIKO_HOME"
  mkdir -p "$(dirname "$ORIGIN_USER")"
  ( umask 077; set -o noclobber; printf 'name:\naddress:\n' > "$ORIGIN_USER" )
fi
# 一覧は原子的に置き換える。途中で失敗した一覧を残すと、消してよいものを
# 消し損ねるより悪い（消してはいけないものが一覧に無い状態になる）。
sort -u "$MANIFEST_TMP" > "$AIKO_HOME/.install-manifest"
rm -f "$MANIFEST_TMP"

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

# 設計書 §11.3 が定める権限。指定はあったが一度も設定しておらず、umask 任せに
# なっていた（2026-07-31 実測: ~/.aiko が 0775）。呼び名や関係性は同じ端末の
# 他のユーザーから読めてよいものではない。
chmod 700 "$AIKO_HOME" 2>/dev/null || true
for f in "$AIKO_HOME/user.md" "$AIKO_HOME/user-profile.json"; do
  [ -f "$f" ] && chmod 600 "$f" 2>/dev/null || true
done
find "$AIKO_HOME/hooks" -type f -name '*.sh' -exec chmod +x {} +
[ -d "$PROJECT_CLAUDE_DIR/scripts" ] && find "$PROJECT_CLAUDE_DIR/scripts" -type f -name '*.sh' -exec chmod +x {} +

mkdir -p "$AIKO_HOME/persona/overrides"

# `.claude/aiko` を `~/.aiko` への symlink にする。
#
# 人格の実体は `~/.aiko` に置くが、起動手順を書いた `.claude/CLAUDE.md` は
# `.claude/aiko/...` を読むよう指示している。リンクが無いと、入れた直後の
# `.claude/aiko` は空で、**人格を1つも読めないまま起動する**（2026-08-02 実測。
# 既存環境は /aiko-migrate-to-shared 実行済みのため表面化していなかった）。
#
# 既存の中身は先に `~/.aiko` へ移してある（STATE_SOURCE）。それでも消さずに
# 退避してから張り替える——移し損ねたものがあったとき、消えていたら戻せない。
if [ -L "$PROJECT_CLAUDE_DIR/aiko" ]; then
  rm "$PROJECT_CLAUDE_DIR/aiko"
elif [ -e "$PROJECT_CLAUDE_DIR/aiko" ]; then
  backup_existing_path "$PROJECT_CLAUDE_DIR/aiko"
fi
ln -s "$AIKO_HOME" "$PROJECT_CLAUDE_DIR/aiko"

if [ "$HAD_PROJECT_CLAUDE_MD" -eq 1 ]; then
  printf "  %s· .claude/CLAUDE.md は既存のため変更しません%s\n" "$DIM" "$RESET"
fi
if [ "$HAD_PROJECT_SETTINGS" -eq 1 ]; then
  printf "  %s· .claude/settings.json は既存のため変更しません%s\n" "$DIM" "$RESET"
fi

# ─────────────────────────────────────
# voice モード — ~/.aiko/voice/ にインストール
# ─────────────────────────────────────
REPO_ROOT="$(cd "$TEMPLATE_DIR/../../.." 2>/dev/null && pwd)"
VOICE_SRC="$REPO_ROOT/voice"
VOICE_DST="$AIKO_HOME/voice"
if [ -d "$VOICE_SRC/hooks" ] && [ -d "$VOICE_SRC/engines" ]; then
  mkdir -p "$VOICE_DST/hooks" "$VOICE_DST/engines"
  prepare_destination_for_template "$VOICE_SRC/hooks/stop.sh" "$VOICE_DST/hooks/stop.sh"
  cp -P "$VOICE_SRC/hooks/stop.sh" "$VOICE_DST/hooks/stop.sh"
  chmod +x "$VOICE_DST/hooks/stop.sh"
  for engine in say.sh auto.sh voicevox.sh irodori.sh avatar.sh; do
    [ -f "$VOICE_SRC/engines/$engine" ] || continue
    prepare_destination_for_template "$VOICE_SRC/engines/$engine" "$VOICE_DST/engines/$engine"
    cp -P "$VOICE_SRC/engines/$engine" "$VOICE_DST/engines/$engine"
    chmod +x "$VOICE_DST/engines/$engine"
  done
  printf "  %s· voice モードを %s に配置%s\n" "$DIM" "$VOICE_DST" "$RESET"
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
