#!/usr/bin/env bash
# Agent-Aiko for Codex installer
#
# 1 コマンドで Codex 版 Aiko の動作環境を整える。
#
# 使い方：
#   bash codex/scripts/install.sh                       # フルインストール
#   bash codex/scripts/install.sh --skip-build          # 既存 dist/ を流用
#   bash codex/scripts/install.sh --skip-auth-check     # codex login 確認をスキップ
#   bash codex/scripts/install.sh --bin-dir <path>      # aiko shim の設置先を上書き
#   bash codex/scripts/install.sh --aiko-home <path>    # ~/.aiko/ の場所を上書き（テスト用）
#
# 動作（spec §7.1）：
#   1. Node.js >= 20 と codex CLI の存在確認
#   2. codex login 状態の確認（未ログインなら警告のみ）
#   3. codex/ で npm install ＋ npm run build
#   4. ~/.aiko/ を初期化（既存ならユーザーデータ温存、不変ファイルのみ更新）
#   5. ~/.local/bin/aiko に shim を設置
#
# 設計の正本: 非公開設計メモ v0.3.1 §6.5 / §7.1

set -euo pipefail

# ─────────────────────────────────────
# パス解決
# ─────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CODEX_DIR="${REPO_ROOT}/codex"
TEMPLATE_AIKO_DIR="${REPO_ROOT}/claude-code/template/.claude/aiko"

# ─────────────────────────────────────
# オプション
# ─────────────────────────────────────
AIKO_HOME="${HOME}/.aiko"
BIN_DIR="${HOME}/.local/bin"
SKIP_BUILD=false
SKIP_AUTH_CHECK=false

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-build) SKIP_BUILD=true ;;
    --skip-auth-check) SKIP_AUTH_CHECK=true ;;
    --bin-dir)
      shift
      [ $# -gt 0 ] || { echo "ERROR: --bin-dir requires a path" >&2; exit 1; }
      BIN_DIR="$1"
      ;;
    --aiko-home)
      shift
      [ $# -gt 0 ] || { echo "ERROR: --aiko-home requires a path" >&2; exit 1; }
      AIKO_HOME="$1"
      ;;
    -h|--help)
      sed -n '2,18p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
  shift
done

# ─────────────────────────────────────
# カラー
# ─────────────────────────────────────
if [ -t 1 ]; then
  CYAN=$'\033[36m'
  GREEN=$'\033[32m'
  YELLOW=$'\033[33m'
  RED=$'\033[31m'
  BOLD=$'\033[1m'
  RESET=$'\033[0m'
else
  CYAN="" GREEN="" YELLOW="" RED="" BOLD="" RESET=""
fi

ok()    { printf "  %s✓%s %s\n" "$GREEN" "$RESET" "$*"; }
warn()  { printf "  %s!%s %s\n" "$YELLOW" "$RESET" "$*"; }
fail()  { printf "  %s✗%s %s\n" "$RED" "$RESET" "$*" >&2; }
step()  { printf "%s%s%s\n" "$BOLD" "$*" "$RESET"; }

# ─────────────────────────────────────
# 1/6 Node.js
# ─────────────────────────────────────
step "[1/6] Node.js を確認しています..."
if ! command -v node >/dev/null 2>&1; then
  fail "node コマンドが見つかりません。Node.js 20+ をインストールしてから再実行してください。"
  exit 1
fi
NODE_VERSION="$(node -v)"
NODE_MAJOR=$(printf '%s' "$NODE_VERSION" | sed 's/^v\([0-9]*\)\..*/\1/')
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "Node.js >= 20 が必要です（検出: ${NODE_VERSION}）。"
  exit 1
fi
ok "Node.js ${NODE_VERSION}"

# ─────────────────────────────────────
# 2/6 codex CLI
# ─────────────────────────────────────
step "[2/6] codex CLI を確認しています..."
if ! command -v codex >/dev/null 2>&1; then
  fail "codex コマンドが見つかりません。OpenAI Codex CLI をインストールしてから再実行してください。"
  fail "  例: npm install -g @openai/codex   （あるいは公式の手順に従う）"
  exit 1
fi
CODEX_VERSION="$(codex --version 2>&1 | head -1 || echo "unknown")"
ok "${CODEX_VERSION}"

# ─────────────────────────────────────
# 3/6 codex login 状態
# ─────────────────────────────────────
step "[3/6] codex login 状態を確認しています..."
if [ "$SKIP_AUTH_CHECK" = true ]; then
  warn "スキップ（--skip-auth-check）"
elif codex login status 2>&1 | grep -qiE "logged in|authenticated|chatgpt"; then
  ok "認証済み"
else
  warn "codex は未認証のようです。インストール後に '${BOLD}codex login${RESET}' を実行してください。"
fi

# ─────────────────────────────────────
# 4/6 npm build
# ─────────────────────────────────────
step "[4/6] codex/ パッケージをビルドしています..."
if [ "$SKIP_BUILD" = true ]; then
  warn "スキップ（--skip-build）"
else
  if [ ! -d "$CODEX_DIR" ]; then
    fail "codex/ ディレクトリが見つかりません: ${CODEX_DIR}"
    exit 1
  fi
  ( cd "$CODEX_DIR" && {
    if [ -f package-lock.json ]; then
      npm ci --silent
    else
      npm install --silent
    fi
    npm run build --silent
  } )
fi
if [ ! -f "${CODEX_DIR}/dist/aiko-shell.js" ]; then
  fail "${CODEX_DIR}/dist/aiko-shell.js が見つかりません。--skip-build を使う場合は事前に npm run build してください。"
  exit 1
fi
ok "dist/aiko-shell.js"

# ─────────────────────────────────────
# 5/6 ~/.aiko/ 初期化
# ─────────────────────────────────────
step "[5/6] ${AIKO_HOME} を初期化しています..."
if [ ! -d "$TEMPLATE_AIKO_DIR" ]; then
  fail "テンプレートが見つかりません: ${TEMPLATE_AIKO_DIR}"
  fail "  リポジトリ構造が壊れている可能性があります（claude-code/template/.claude/aiko/ が必要）"
  exit 1
fi

# 不在 / 既存にかかわらず一貫したルールで初期化する（spec §5.2）：
#   不変ファイル（persona/origin/persona.md / aiko-origin.md / INVARIANTS.md / capability/skills/）は常に上書き
#   ユーザーデータ（mode / user.md / aiko-override.md / capability/rules/rules-base.md）は
#     既存があれば温存、無ければテンプレからコピー（mode は不在なら "origin" で初期化、
#     override は不在なら origin と同内容で初期化）
mkdir -p "$AIKO_HOME"

# 必須テンプレファイルの存在確認（不在ならここで明示的に fail）
for required in "persona/origin/persona.md" "persona/aiko-origin.md" "persona/INVARIANTS.md"; do
  if [ ! -f "$TEMPLATE_AIKO_DIR/$required" ]; then
    fail "必須テンプレートファイルが見つかりません: $TEMPLATE_AIKO_DIR/$required"
    fail "  リポジトリの claude-code/template/.claude/aiko/ が壊れている可能性があります。"
    exit 1
  fi
done

copy_overwrite() {
  local src="$1"
  local dst="$2"
  mkdir -p "$(dirname "$dst")"
  # 書込権限が無い既存ファイル（chmod 444）に上書きするため一度 chmod する
  [ -f "$dst" ] && chmod 644 "$dst" 2>/dev/null || true
  cp -R "$src" "$dst"
}

# 不変ファイルは常に上書き
copy_overwrite "$TEMPLATE_AIKO_DIR/persona/origin/persona.md" "$AIKO_HOME/persona/origin/persona.md"
if [ -f "$TEMPLATE_AIKO_DIR/persona/origin/user.md" ] && [ ! -f "$AIKO_HOME/persona/origin/user.md" ]; then
  mkdir -p "$AIKO_HOME/persona/origin"
  cp "$TEMPLATE_AIKO_DIR/persona/origin/user.md" "$AIKO_HOME/persona/origin/user.md"
fi
copy_overwrite "$TEMPLATE_AIKO_DIR/persona/aiko-origin.md" "$AIKO_HOME/persona/aiko-origin.md"
copy_overwrite "$TEMPLATE_AIKO_DIR/persona/INVARIANTS.md"  "$AIKO_HOME/persona/INVARIANTS.md"

# capability/skills/ も template が真ソースなので上書き（個別ユーザースキルは
# spec §5.4 で別パス想定なので一旦シンプルに replace）
if [ -d "$TEMPLATE_AIKO_DIR/capability/skills" ]; then
  rm -rf "$AIKO_HOME/capability/skills"
  mkdir -p "$AIKO_HOME/capability"
  cp -R "$TEMPLATE_AIKO_DIR/capability/skills" "$AIKO_HOME/capability/skills"
fi

# capability/rules/rules-base.md は ユーザーデータなので「無ければ作る」のみ
if [ ! -f "$AIKO_HOME/capability/rules/rules-base.md" ] \
   && [ -f "$TEMPLATE_AIKO_DIR/capability/rules/rules-base.md" ]; then
  mkdir -p "$AIKO_HOME/capability/rules"
  cp "$TEMPLATE_AIKO_DIR/capability/rules/rules-base.md" "$AIKO_HOME/capability/rules/rules-base.md"
fi

# user.md / mode / aiko-override.md は ユーザーデータ：無ければ初期化
if [ ! -f "$AIKO_HOME/user.md" ] && [ -f "$TEMPLATE_AIKO_DIR/user.md" ]; then
  cp "$TEMPLATE_AIKO_DIR/user.md" "$AIKO_HOME/user.md"
fi
if [ ! -f "$AIKO_HOME/mode" ]; then
  printf 'origin\n' > "$AIKO_HOME/mode"
fi
if [ ! -f "$AIKO_HOME/persona/aiko-override.md" ]; then
  cp "$AIKO_HOME/persona/origin/persona.md" "$AIKO_HOME/persona/aiko-override.md"
fi

# 不変ファイルを 444 に固める（書込時は chmod で一時昇格する設計）
chmod 444 "$AIKO_HOME/persona/origin/persona.md" 2>/dev/null || true
chmod 444 "$AIKO_HOME/persona/aiko-origin.md" 2>/dev/null || true
chmod 444 "$AIKO_HOME/persona/INVARIANTS.md"  2>/dev/null || true

ok "${AIKO_HOME}"

# ─────────────────────────────────────
# 6/6 aiko shim
# ─────────────────────────────────────
step "[6/6] aiko コマンドの shim を設置しています..."
mkdir -p "$BIN_DIR"
SHIM="$BIN_DIR/aiko"
cat > "$SHIM" <<SHIM_EOF
#!/usr/bin/env bash
# Agent-Aiko for Codex shim
# Auto-generated by codex/scripts/install.sh on $(date -u "+%Y-%m-%dT%H:%M:%SZ")
# Edit-warning: re-running the installer will overwrite this file.
exec node "${CODEX_DIR}/dist/aiko-shell.js" "\$@"
SHIM_EOF
chmod +x "$SHIM"
ok "${SHIM}"

# PATH 確認
case ":$PATH:" in
  *":$BIN_DIR:"*) : ;;
  *)
    warn "${BIN_DIR} が PATH に含まれていません。シェルの設定ファイルに以下を追記してください："
    printf "    %sexport PATH=\"%s:\$PATH\"%s\n" "$BOLD" "$BIN_DIR" "$RESET"
    ;;
esac

# ─────────────────────────────────────
# 完了
# ─────────────────────────────────────
echo ""
printf "%s✓ セットアップ完了！%s\n\n" "$GREEN$BOLD" "$RESET"
echo "次の一歩："
printf "  %s%saiko%s          # 対話シェルを起動\n" "$BOLD" "$CYAN" "$RESET"
echo ""
printf "  シェル内で： %s/aiko-mode%s, %s/aiko-or%s, %s/aiko-diff%s, %s/exit%s など\n" \
  "$BOLD" "$RESET" "$BOLD" "$RESET" "$BOLD" "$RESET" "$BOLD" "$RESET"
echo ""
