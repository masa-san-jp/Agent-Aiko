#!/usr/bin/env bash
# install.sh — Agent-Aiko installer for Gemini CLI / Antigravity
# Usage: bash antigravity/scripts/install.sh [options]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
EXT_DIR="${REPO_ROOT}/antigravity"

AIKO_HOME="${HOME}/.aiko"
BIN_DIR="${HOME}/.local/bin"
GEMINI_EXT_DIR="${HOME}/.gemini/extensions/agent-aiko"

SKIP_GEMINI_CHECK=false
LINK_ONLY=false
HELP=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --aiko-home)
      [[ $# -ge 2 ]] || { echo "ERROR: --aiko-home requires a path" >&2; exit 1; }
      AIKO_HOME="$2"; shift 2
      ;;
    --bin-dir)
      [[ $# -ge 2 ]] || { echo "ERROR: --bin-dir requires a path" >&2; exit 1; }
      BIN_DIR="$2"; shift 2
      ;;
    --skip-gemini-check) SKIP_GEMINI_CHECK=true; shift ;;
    --link-only)   LINK_ONLY=true; shift ;;
    --help|-h)     HELP=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if $HELP; then
  cat <<'EOF'
Usage: bash antigravity/scripts/install.sh [options]

Options:
  --aiko-home <path>      Set ~/.aiko location (default: $HOME/.aiko)
  --bin-dir <path>        Set bin directory (default: $HOME/.local/bin)
  --skip-gemini-check     Skip Gemini CLI presence check (for sandbox/CI)
  --link-only             Only update the extension link, skip ~/.aiko init
  --help                  Show this help
EOF
  exit 0
fi

case "$AIKO_HOME" in
  ""|"/"|"$HOME")
    echo "ERROR: AIKO_HOME is a dangerous path: ${AIKO_HOME}" >&2
    exit 1
    ;;
esac

echo "=== Agent-Aiko installer (Antigravity / Gemini CLI) ==="
echo "AIKO_HOME : ${AIKO_HOME}"
echo "BIN_DIR   : ${BIN_DIR}"
echo "EXT_DIR   : ${EXT_DIR}"
echo ""

# --- 1. Check Node.js ---
if ! command -v node &>/dev/null; then
  echo "ERROR: node not found. Install Node.js 20+." >&2
  exit 1
fi
NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "ERROR: Node.js 20+ required. Current: $(node --version)" >&2
  exit 1
fi
echo "✓ Node.js $(node --version)"

# --- 2. Check Gemini CLI ---
if $SKIP_GEMINI_CHECK; then
  echo "  (skipping Gemini CLI check)"
else
  if ! command -v gemini &>/dev/null; then
    echo "WARNING: gemini command not found. Install Gemini CLI first." >&2
    echo "  See: https://github.com/google-gemini/gemini-cli"
  else
    echo "✓ Gemini CLI found"
  fi
fi

# --- 3. Locate template .aiko source ---
TEMPLATE_AIKO_DIR=""
for candidate in \
  "${REPO_ROOT}/claude-code/template/.claude/aiko" \
  "${REPO_ROOT}/Agent-team/agents/aiko/.aiko" \
  "${REPO_ROOT}/.aiko"; do
  if [[ -d "$candidate" ]]; then
    TEMPLATE_AIKO_DIR="$candidate"
    break
  fi
done

if [[ -z "$TEMPLATE_AIKO_DIR" ]]; then
  echo "WARNING: could not find Aiko template directory." >&2
fi

if ! $LINK_ONLY; then
  # --- 4. Init ~/.aiko ---
  echo ""
  echo "--- Initializing ${AIKO_HOME} ---"
  mkdir -p "${AIKO_HOME}/persona/origin"
  mkdir -p "${AIKO_HOME}/persona/override"
  mkdir -p "${AIKO_HOME}/persona/overrides"
  mkdir -p "${AIKO_HOME}/capability/rules"
  mkdir -p "${AIKO_HOME}/capability/skills"

  if [[ -n "$TEMPLATE_AIKO_DIR" ]]; then
    # Always overwrite: origin persona
    for src in \
      "${TEMPLATE_AIKO_DIR}/persona/origin/persona.md" \
      "${TEMPLATE_AIKO_DIR}/persona/aiko-origin.md"; do
      if [[ -f "$src" ]]; then
        filename="$(basename "$src")"
        dest="${AIKO_HOME}/persona/origin/${filename}"
        if [[ "$filename" == "aiko-origin.md" ]]; then
          dest="${AIKO_HOME}/persona/${filename}"
        fi
        cp -f "$src" "$dest"
        echo "✓ copied $(basename "$src")"
      fi
    done

    # Always overwrite: INVARIANTS
    for src in \
      "${TEMPLATE_AIKO_DIR}/persona/INVARIANTS.md" \
      "${TEMPLATE_AIKO_DIR}/INVARIANTS.md"; do
      if [[ -f "$src" ]]; then
        cp -f "$src" "${AIKO_HOME}/persona/INVARIANTS.md"
        echo "✓ copied INVARIANTS.md"
        break
      fi
    done

    # Preserve if exists: user.md, override, overrides, rules-base
    if [[ ! -f "${AIKO_HOME}/user.md" && -f "${TEMPLATE_AIKO_DIR}/user.md" ]]; then
      cp "${TEMPLATE_AIKO_DIR}/user.md" "${AIKO_HOME}/user.md"
      echo "✓ created user.md"
    fi

    if [[ ! -f "${AIKO_HOME}/capability/rules/rules-base.md" && -f "${TEMPLATE_AIKO_DIR}/capability/rules/rules-base.md" ]]; then
      cp "${TEMPLATE_AIKO_DIR}/capability/rules/rules-base.md" "${AIKO_HOME}/capability/rules/rules-base.md"
      echo "✓ created rules-base.md"
    fi
  fi

  # Initialize mode if not set
  if [[ ! -f "${AIKO_HOME}/mode" ]]; then
    echo -n "origin" > "${AIKO_HOME}/mode"
    echo "✓ mode = origin"
  fi

  # Initialize active-persona if not set
  if [[ ! -f "${AIKO_HOME}/active-persona" ]]; then
    echo -n "" > "${AIKO_HOME}/active-persona"
    echo "✓ active-persona = (none)"
  fi

  # Initialize override persona from origin if not set
  ORIGIN_PERSONA="${AIKO_HOME}/persona/origin/persona.md"
  if [[ ! -f "${AIKO_HOME}/persona/override/persona.md" && -f "$ORIGIN_PERSONA" ]]; then
    cp "$ORIGIN_PERSONA" "${AIKO_HOME}/persona/override/persona.md"
    echo "✓ override/persona.md initialized from origin"
  fi
  if [[ ! -f "${AIKO_HOME}/persona/aiko-override.md" && -f "$ORIGIN_PERSONA" ]]; then
    cp "$ORIGIN_PERSONA" "${AIKO_HOME}/persona/aiko-override.md"
    echo "✓ aiko-override.md initialized from origin"
  fi

  # chmod protected files
  for protected in \
    "${AIKO_HOME}/persona/origin/persona.md" \
    "${AIKO_HOME}/persona/aiko-origin.md" \
    "${AIKO_HOME}/persona/INVARIANTS.md"; do
    if [[ -f "$protected" ]]; then
      chmod 444 "$protected"
    fi
  done
  echo "✓ protected files chmod 444"
fi

# --- 5. Install aiko-gemini shim ---
echo ""
echo "--- Installing aiko-gemini shim to ${BIN_DIR} ---"
mkdir -p "${BIN_DIR}"
cat > "${BIN_DIR}/aiko-gemini" <<SHIM
#!/usr/bin/env bash
export AIKO_HOME="${AIKO_HOME}"
exec node "${EXT_DIR}/scripts/aiko-gemini.mjs" "\$@"
SHIM
chmod +x "${BIN_DIR}/aiko-gemini"
echo "✓ aiko-gemini shim installed"

# --- 6. Link extension ---
echo ""
echo "--- Linking Gemini CLI extension ---"
mkdir -p "$(dirname "${GEMINI_EXT_DIR}")"
if [[ -L "${GEMINI_EXT_DIR}" ]]; then
  rm "${GEMINI_EXT_DIR}"
elif [[ -d "${GEMINI_EXT_DIR}" ]]; then
  echo "WARNING: ${GEMINI_EXT_DIR} は既存ディレクトリです。バックアップします。"
  mv "${GEMINI_EXT_DIR}" "${GEMINI_EXT_DIR}.bak.$(date +%s)"
fi
ln -s "${EXT_DIR}" "${GEMINI_EXT_DIR}"
echo "✓ extension linked: ${GEMINI_EXT_DIR} -> ${EXT_DIR}"

# --- 7. gemini extensions link (if available and not skip) ---
if ! $SKIP_GEMINI_CHECK && command -v gemini &>/dev/null; then
  echo ""
  echo "--- Registering extension with Gemini CLI ---"
  gemini extensions link "${EXT_DIR}" 2>/dev/null && echo "✓ gemini extensions link succeeded" || echo "  (gemini extensions link failed — may need manual registration)"
fi

# --- 8. PATH check ---
echo ""
if [[ ":$PATH:" != *":${BIN_DIR}:"* ]]; then
  echo "WARNING: ${BIN_DIR} is not in PATH."
  echo "  Add the following to your shell profile (~/.bashrc or ~/.zshrc):"
  echo '  export PATH="'"${BIN_DIR}"':$PATH"'
fi

# --- Done ---
echo ""
echo "=== Agent-Aiko installation complete ==="
echo ""
echo "Next steps:"
echo "  1. Start Gemini CLI:  gemini"
echo "  2. Load Aiko context: /aiko"
echo "  3. Check commands:    /commands list"
