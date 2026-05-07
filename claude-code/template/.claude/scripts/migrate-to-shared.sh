#!/usr/bin/env bash
# Agent-Aiko Claude Code 版：v1 → v2 migration スクリプト（spec §9.2）
#
# `${PWD}/.claude/aiko/` の人格データを共通ストア `~/.aiko/` に移行し、
# 元の場所を `~/.aiko/` への symlink に置き換える。
#
# Codex 版と人格を共有したいユーザー向けの任意操作。
# デフォルトでは何も破壊せず、競合時は abort する。

set -euo pipefail

# ─────────────────────────────────────
# 引数パース
# ─────────────────────────────────────

DRY_RUN=0
ON_CONFLICT="abort" # abort | overwrite
SOURCE_DIR=""
TARGET_DIR=""

usage() {
  cat <<'EOF'
Usage: migrate-to-shared.sh [options]

Options:
  --dry-run               実際のファイル操作を行わず、何が起きるかだけ表示する
  --overwrite             ~/.aiko/ が既に存在する場合に上書きする（バックアップは作成）
  --abort-on-conflict     ~/.aiko/ が既に存在する場合に何もせず終了する（default）
  --source <path>         移行元ディレクトリ。default は ${PWD}/.claude/aiko
  --target <path>         移行先ディレクトリ。default は ${HOME}/.aiko
  -h, --help              このヘルプを表示

動作（デフォルト）:
  1. <source>（${PWD}/.claude/aiko/）の存在を確認
  2. <target>（${HOME}/.aiko/）が存在する場合は abort（--overwrite で backup 経由の上書き可）
  3. <source> を <target> に rsync
  4. <source> を <source>.backup-<timestamp> にリネーム（例：${PWD}/.claude/aiko.backup-20260506-090000）
  5. <source> を <target> への symlink に置き換え
  6. 検証：mode / persona / user.md が <target> 経由で読めることを確認

例:
  bash migrate-to-shared.sh --dry-run
  bash migrate-to-shared.sh --overwrite
EOF
}

require_value() {
  # オプションに値が渡されているか確認するヘルパー。
  # set -e 下で `shift 2` が「shift count out of range」で死ぬのを防ぐため、
  # 値欠落を明示的に拾って usage を出してから exit 2 する。
  local opt="$1"
  local val="${2-__MISSING__}"
  if [[ "$val" == "__MISSING__" || "$val" == --* ]]; then
    echo "ERROR: $opt requires a value" >&2
    usage >&2
    exit 2
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)            DRY_RUN=1; shift ;;
    --overwrite)          ON_CONFLICT="overwrite"; shift ;;
    --abort-on-conflict)  ON_CONFLICT="abort"; shift ;;
    --source)             require_value "$1" "${2-__MISSING__}"; SOURCE_DIR="$2"; shift 2 ;;
    --target)             require_value "$1" "${2-__MISSING__}"; TARGET_DIR="$2"; shift 2 ;;
    -h|--help)            usage; exit 0 ;;
    *)                    echo "ERROR: unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

SOURCE_DIR="${SOURCE_DIR:-${PWD}/.claude/aiko}"
TARGET_DIR="${TARGET_DIR:-${HOME}/.aiko}"

# ─────────────────────────────────────
# ヘルパー
# ─────────────────────────────────────

log() {
  if [[ $DRY_RUN -eq 1 ]]; then
    printf '[dry-run] %s\n' "$*"
  else
    printf '%s\n' "$*"
  fi
}

run() {
  if [[ $DRY_RUN -eq 1 ]]; then
    printf '[dry-run] $ %s\n' "$*"
  else
    "$@"
  fi
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

timestamp() {
  date +%Y%m%d-%H%M%S
}

# ─────────────────────────────────────
# 事前検証
# ─────────────────────────────────────

if [[ ! -d "$SOURCE_DIR" ]]; then
  die "source not found: $SOURCE_DIR (Claude Code v1 のインストールが見つかりません)"
fi

if [[ -L "$SOURCE_DIR" ]]; then
  die "source is already a symlink: $SOURCE_DIR (移行は一度だけ実行してください)"
fi

# 必須サブパスが揃っているか確認（人格データの正本判定）
required_paths=("mode" "persona/aiko-origin.md" "persona/INVARIANTS.md")
for p in "${required_paths[@]}"; do
  if [[ ! -e "$SOURCE_DIR/$p" ]]; then
    die "source is incomplete: missing $SOURCE_DIR/$p"
  fi
done

if [[ -e "$TARGET_DIR" ]]; then
  case "$ON_CONFLICT" in
    abort)
      die "target already exists: $TARGET_DIR (--overwrite で backup 経由の上書きが可能です)"
      ;;
    overwrite)
      ;;
  esac
fi

# ─────────────────────────────────────
# 実行
# ─────────────────────────────────────

TS="$(timestamp)"

log "migrate-to-shared:"
log "  source : $SOURCE_DIR"
log "  target : $TARGET_DIR"
log "  policy : on-conflict=$ON_CONFLICT, dry-run=$DRY_RUN"
log ""

# Step 1: target が既存の場合は backup
if [[ -e "$TARGET_DIR" ]]; then
  TARGET_BACKUP="${TARGET_DIR}.backup-${TS}"
  log "Step 1: backing up existing target -> ${TARGET_BACKUP}"
  run mv "$TARGET_DIR" "$TARGET_BACKUP"
fi

# Step 2: source を target に rsync（trailing slash で中身をコピー）
log "Step 2: copying ${SOURCE_DIR}/ -> ${TARGET_DIR}/"
run mkdir -p "$TARGET_DIR"
if command -v rsync >/dev/null 2>&1; then
  run rsync -a "$SOURCE_DIR/" "$TARGET_DIR/"
else
  # rsync が無い環境向けフォールバック。
  # `-p` で permission/owner/timestamps を保持する（aiko-origin.md /
  # INVARIANTS.md の 444 chmod を移行後も維持するため）。
  # `cp -pR` は POSIX 準拠で BSD/GNU 両方で動作する。
  run cp -pR "$SOURCE_DIR/." "$TARGET_DIR/"
fi

# Step 3: source をリネームして backup として保持
SOURCE_BACKUP="${SOURCE_DIR}.backup-${TS}"
log "Step 3: backing up source -> ${SOURCE_BACKUP}"
run mv "$SOURCE_DIR" "$SOURCE_BACKUP"

# Step 4: source を target への symlink に置き換え
log "Step 4: linking ${SOURCE_DIR} -> ${TARGET_DIR}"
run ln -s "$TARGET_DIR" "$SOURCE_DIR"

# ─────────────────────────────────────
# 検証
# ─────────────────────────────────────

log ""
log "Verification:"
# 事前検証で必須扱いしたファイルが、移行後に SOURCE_DIR (symlink 経由) で
# 読めることを確認する。欠けている場合は rsync / symlink の失敗が考えられるため
# エラー終了して人格データが壊れないようにする。
required_after=("mode" "persona/aiko-origin.md" "persona/INVARIANTS.md")
optional_after=("user.md")
if [[ $DRY_RUN -eq 0 ]]; then
  missing_required=()
  for p in "${required_after[@]}"; do
    if [[ -e "$SOURCE_DIR/$p" ]]; then
      log "  ok       $p"
    else
      log "  MISSING  $p (required)"
      missing_required+=("$p")
    fi
  done
  for p in "${optional_after[@]}"; do
    if [[ -e "$SOURCE_DIR/$p" ]]; then
      log "  ok       $p"
    else
      log "  --       $p (optional / not present)"
    fi
  done
  if [[ ${#missing_required[@]} -gt 0 ]]; then
    die "verification failed: required files unreadable through ${SOURCE_DIR} -> ${TARGET_DIR} symlink: ${missing_required[*]}"
  fi
else
  for p in "${required_after[@]}" "${optional_after[@]}"; do
    log "  (would verify) $p"
  done
fi

log ""
log "migrate-to-shared: done."
log "  - 共通ストア : ${TARGET_DIR}"
log "  - 旧データ   : ${SOURCE_BACKUP}（不要になったら削除可）"
if [[ -n "${TARGET_BACKUP:-}" ]]; then
  log "  - 旧 ~/.aiko : ${TARGET_BACKUP}"
fi
