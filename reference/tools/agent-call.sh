#!/bin/bash
# agent-call.sh — Delegate a single-turn query to another agent.
#
# Loads the target agent's CLAUDE.md and skills via `claude --print` by
# changing cwd to the agent's directory before invocation.
#
# 配置先:
#   <ORG_REPO>/Agent-team/tools/agent-call/agent-call.sh
#
# Usage:
#   agent-call.sh <agent-name> "<prompt>"
#   agent-call.sh list
#   agent-call.sh status
#
# Env:
#   AGENT_CALL_MODEL   Model used by the delegated session (default: claude-sonnet-4-6)
#   WORKPLACE_ROOT     Absolute path to the org repo root.
#                      If unset, auto-detected via `git rev-parse --show-toplevel`.
#   AGENT_CALL_LOG     1=write meta log (default), 0=disable
#   AGENT_CALL_CACHE   1=use agents-list cache (default), 0=always rescan
#
# Exit codes:
#   0  success
#   1  claude CLI missing or runtime failure
#   2  invalid arguments
#   3  agent-name not found

set -euo pipefail

# ----- リポルートの解決 -----
if [ -n "${WORKPLACE_ROOT:-}" ]; then
    WORKPLACE="$WORKPLACE_ROOT"
else
    WORKPLACE=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
    if [ -z "$WORKPLACE" ]; then
        echo "ERROR: WORKPLACE_ROOT not set and not in a git repo." >&2
        echo "  Set: export WORKPLACE_ROOT=/path/to/your/org/repo" >&2
        exit 2
    fi
fi

AGENTS_DIR="$WORKPLACE/Agent-team/agents"
DEFAULT_MODEL="${AGENT_CALL_MODEL:-claude-sonnet-4-6}"
LOG_DIR="$WORKPLACE/Agent-team/logs/agent-call"
CACHE_DIR="$WORKPLACE/Agent-team/tools/agent-call/.cache"
CACHE_FILE="$CACHE_DIR/agents.json"

now_ms() {
    if command -v python3 >/dev/null 2>&1; then
        python3 -c 'import time; print(int(time.time()*1000))'
    else
        echo "$(($(date +%s) * 1000))"
    fi
}

write_meta_log() {
    [ "${AGENT_CALL_LOG:-1}" = "0" ] && return 0
    local agent="$1" model="$2" duration_ms="$3" exit_code="$4"
    local prompt_chars="$5" response_bytes="$6"
    mkdir -p "$LOG_DIR" 2>/dev/null || return 0
    local log_file="$LOG_DIR/$(date +%Y-%m-%d).jsonl"
    local ts
    ts=$(date +%Y-%m-%dT%H:%M:%S%z)
    printf '{"ts":"%s","agent":"%s","model":"%s","duration_ms":%d,"exit_code":%d,"prompt_chars":%d,"response_bytes":%d}\n' \
        "$ts" "$agent" "$model" "$duration_ms" "$exit_code" "$prompt_chars" "$response_bytes" \
        >> "$log_file" 2>/dev/null || true
}

usage() {
    cat <<EOF >&2
Usage:
  $(basename "$0") <agent-name> "<prompt>"
  $(basename "$0") list
  $(basename "$0") status

Hint: run '$(basename "$0") status' to verify claude CLI and list agents.
EOF
    exit 2
}

suggest_similar() {
    local needle="$1"
    list_agents 2>/dev/null | awk -v n="$needle" '
        BEGIN { nl = tolower(n); ns = nl; gsub(/-/, "", ns) }
        {
            cl = tolower($0); cs = cl; gsub(/-/, "", cs)
            if (index(cl, nl) > 0 || index(nl, cl) > 0 || \
                index(cs, ns) > 0 || index(ns, cs) > 0) print "  - " $0
        }
    '
}

list_agents_scan() {
    if [ ! -d "$AGENTS_DIR" ]; then
        echo "ERROR: agents dir not found: $AGENTS_DIR" >&2
        return 1
    fi
    find "$AGENTS_DIR" -mindepth 1 -maxdepth 1 -type d \
        ! -name '.*' ! -name '_*' \
        -exec basename {} \; | sort
}

mtime_of() {
    stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null || echo 0
}

cache_valid() {
    [ -f "$CACHE_FILE" ] || return 1
    [ -d "$AGENTS_DIR" ] || return 1
    local cache_mtime agents_mtime
    cache_mtime=$(mtime_of "$CACHE_FILE")
    agents_mtime=$(mtime_of "$AGENTS_DIR")
    [ "$cache_mtime" -ge "$agents_mtime" ]
}

cache_read() {
    sed -e 's/^\[//' -e 's/\]$//' -e 's/","/\n/g' -e 's/^"//' -e 's/"$//' "$CACHE_FILE" \
        | grep -v '^$'
}

cache_write() {
    local items="$1"
    mkdir -p "$CACHE_DIR" 2>/dev/null || return 0
    local json
    json=$(printf '%s\n' "$items" | awk '
        BEGIN { printf "[" }
        NF == 0 { next }
        { if (n++) printf ","; printf "\"%s\"", $0 }
        END { printf "]" }
    ')
    printf '%s\n' "$json" > "$CACHE_FILE" 2>/dev/null || true
}

list_agents() {
    if [ "${AGENT_CALL_CACHE:-1}" = "0" ]; then
        list_agents_scan
        return $?
    fi
    if cache_valid; then
        cache_read
        return 0
    fi
    local items
    items=$(list_agents_scan) || return $?
    cache_write "$items"
    printf '%s\n' "$items"
}

cmd="${1:-}"
[ -z "$cmd" ] && usage

case "$cmd" in
    -h|--help|help)
        usage
        ;;
    list)
        list_agents
        exit 0
        ;;
    status)
        if ! command -v claude >/dev/null 2>&1; then
            echo "claude CLI: NOT FOUND"
            exit 1
        fi
        echo "claude CLI: $(claude --version)"
        echo "workplace:  $WORKPLACE"
        echo "agents dir: $AGENTS_DIR"
        echo "default model: $DEFAULT_MODEL"
        echo "available agents:"
        list_agents | sed 's/^/  - /'
        exit 0
        ;;
esac

AGENT="$cmd"
shift
PROMPT="${*:-}"

if [ -z "$PROMPT" ] && [ ! -t 0 ]; then
    PROMPT=$(cat)
fi

if [ -z "$PROMPT" ]; then
    echo "ERROR: prompt is required (provide as argument or via stdin)" >&2
    exit 2
fi

AGENT_DIR="$AGENTS_DIR/$AGENT"
if [ ! -d "$AGENT_DIR" ]; then
    echo "ERROR: agent '$AGENT' not found at $AGENT_DIR" >&2
    similar=$(suggest_similar "$AGENT")
    if [ -n "$similar" ]; then
        echo "Did you mean:" >&2
        echo "$similar" >&2
    fi
    echo "Available agents:" >&2
    list_agents | sed 's/^/  - /' >&2
    exit 3
fi

if ! command -v claude >/dev/null 2>&1; then
    cat <<EOF >&2
ERROR: claude CLI not installed
  Install: npm install -g @anthropic-ai/claude-code
  Docs:    https://docs.claude.com/en/docs/claude-code
EOF
    exit 1
fi

cd "$AGENT_DIR"

PROMPT_CHARS=${#PROMPT}
RESP_SIZE_FILE=$(mktemp)
trap 'rm -f "$RESP_SIZE_FILE"' EXIT

START_MS=$(now_ms)
set +e
claude --print --no-session-persistence --model "$DEFAULT_MODEL" "$PROMPT" \
    | tee >(wc -c > "$RESP_SIZE_FILE")
EXIT_CODE=${PIPESTATUS[0]}
set -e
END_MS=$(now_ms)

DURATION_MS=$(( END_MS - START_MS ))
RESPONSE_BYTES=$(tr -d ' \n' < "$RESP_SIZE_FILE" 2>/dev/null || echo 0)
[ -z "$RESPONSE_BYTES" ] && RESPONSE_BYTES=0

write_meta_log "$AGENT" "$DEFAULT_MODEL" "$DURATION_MS" "$EXIT_CODE" "$PROMPT_CHARS" "$RESPONSE_BYTES"

if [ "$EXIT_CODE" -ne 0 ]; then
    cat <<EOF >&2

[agent-call] hint: claude exited with code $EXIT_CODE (duration: ${DURATION_MS}ms)
  - Auth?       run: claude  (interactive) and verify login
  - Rate limit? wait, or switch model: AGENT_CALL_MODEL=claude-haiku-4-5-20251001
  - Meta log:   $LOG_DIR/$(date +%Y-%m-%d).jsonl
EOF
fi

exit "$EXIT_CODE"
