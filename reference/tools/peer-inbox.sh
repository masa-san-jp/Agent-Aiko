#!/usr/bin/env bash
# peer-inbox.sh — File-based inbox for cross-terminal Claude Code coordination.
#
# 各ターミナルで PEER_NAME を設定して使う。Claude Code セッションが複数の
# ターミナルで並行して動いているとき、互いに作業依頼やレビュー依頼を送る
# ための軽量な非同期メッセージング。tmux 不要・OS 通知のみで届く。
# 受信側は手動で `check` を走らせて読む。
#
# 配置先:
#   <ORG_REPO>/Agent-team/tools/peer-inbox/peer-inbox.sh
#
# Inbox 物理パス:
#   $PEER_INBOX_ROOT/<peer-name>/inbox.jsonl
#   既定: ~/.peer-inbox/
#
# サブコマンド:
#   send <to> "<message>"          Raw send
#   review <to> "<topic>"          "レビュー依頼: <topic>" 形式で送信
#   done <to> "<what>"             "完了通知: <what>" 形式で送信
#   parallel <to> "<task>"         "並行作業依頼: <task>" 形式で送信
#   check                          自分の inbox を表示（未読を上に）
#   mark-read [N]                  インデックス N（省略時は全件）を既読化
#   list                           既知 peer 一覧と未読件数
#   whoami                         解決された PEER_NAME を表示

set -uo pipefail

INBOX_ROOT="${PEER_INBOX_ROOT:-$HOME/.peer-inbox}"

usage() {
    cat <<'EOF'
Usage:
  peer-inbox.sh send <to> "<message>"            Raw send
  peer-inbox.sh review <to> "<topic>"            "レビュー依頼: <topic>" 形式で送信
  peer-inbox.sh done <to> "<what>"               "完了通知: <what>" 形式で送信
  peer-inbox.sh parallel <to> "<task>"           "並行作業依頼: <task>" 形式で送信
  peer-inbox.sh check                            Show own inbox (unread first)
  peer-inbox.sh mark-read [N]                    Mark message N as read (or all)
  peer-inbox.sh list                             List known peers + unread counts
  peer-inbox.sh whoami                           Show resolved PEER_NAME

Identity (PEER_NAME) resolution order:
  1. Explicit: env PEER_NAME (recommended)
  2. cwd basename if it matches one of the agent directories under
     $WORKPLACE_ROOT/Agent-team/agents/ (auto-detected via git rev-parse)
  3. fallback: error (set PEER_NAME explicitly)

Examples:
  peer-inbox.sh review bob "PR #42 focus: src/api/"
  peer-inbox.sh done alice "feature/auth リリース"
  peer-inbox.sh check

Inbox location:
  $PEER_INBOX_ROOT (env override)
  default: ~/.peer-inbox/
EOF
    exit 1
}

# ----- agents/ ディレクトリから既知の peer 名一覧を得る -----
list_known_agents() {
    local repo_root agents_dir
    repo_root="${WORKPLACE_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || echo "")}"
    [ -z "$repo_root" ] && return 1
    agents_dir="$repo_root/Agent-team/agents"
    [ ! -d "$agents_dir" ] && return 1
    find "$agents_dir" -mindepth 1 -maxdepth 1 -type d \
        ! -name '.*' ! -name '_*' \
        -exec basename {} \; 2>/dev/null
}

detect_peer_name() {
    if [ -n "${PEER_NAME:-}" ]; then
        echo "$PEER_NAME"; return 0
    fi
    local cwd_base
    cwd_base=$(basename "$PWD" 2>/dev/null || echo "")
    [ -z "$cwd_base" ] && return 1

    # cwd basename が agents/ 配下のディレクトリ名と一致するか
    local known
    known=$(list_known_agents 2>/dev/null) || return 1
    while IFS= read -r name; do
        [ -z "$name" ] && continue
        if [ "$name" = "$cwd_base" ]; then
            echo "$cwd_base"; return 0
        fi
    done <<< "$known"
    return 1
}

require_peer_name() {
    local resolved
    if resolved=$(detect_peer_name); then
        PEER_NAME="$resolved"
        return 0
    fi
    echo "Error: PEER_NAME could not be resolved." >&2
    echo "Set explicitly: export PEER_NAME=<your-name>" >&2
    echo "Or run from a known agent dir under <repo>/Agent-team/agents/" >&2
    exit 1
}

cmd_send() {
    require_peer_name
    local to="${1:-}"
    local msg="${2:-}"

    if [ -z "$to" ] || [ -z "$msg" ]; then
        echo "Error: <to> and <message> required" >&2
        usage
    fi

    local to_inbox_dir="$INBOX_ROOT/$to"
    mkdir -p "$to_inbox_dir"

    PEER_FROM="$PEER_NAME" PEER_TO="$to" PEER_MSG="$msg" PEER_INBOX="$to_inbox_dir/inbox.jsonl" \
    python3 - <<'PY'
import json, os, datetime
ts = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
entry = {
    "ts": ts,
    "from": os.environ["PEER_FROM"],
    "to": os.environ["PEER_TO"],
    "message": os.environ["PEER_MSG"],
    "read": False,
}
with open(os.environ["PEER_INBOX"], "a", encoding="utf-8") as f:
    f.write(json.dumps(entry, ensure_ascii=False) + "\n")
PY

    # macOS のみ通知（他 OS では黙ってスキップ）
    if command -v osascript >/dev/null 2>&1; then
        osascript -e "display notification \"new message from $PEER_NAME\" with title \"@$to peer-inbox\" sound name \"Glass\"" 2>/dev/null || true
    fi

    echo "Sent: $PEER_NAME -> $to: $msg"
}

cmd_check() {
    require_peer_name
    local my_inbox="$INBOX_ROOT/$PEER_NAME/inbox.jsonl"

    if [ ! -f "$my_inbox" ]; then
        echo "($PEER_NAME has no inbox yet)"
        return 0
    fi

    PEER_INBOX="$my_inbox" PEER_NAME="$PEER_NAME" python3 - <<'PY'
import json, os, sys
inbox = os.environ["PEER_INBOX"]
name = os.environ["PEER_NAME"]
with open(inbox, encoding="utf-8") as f:
    msgs = [json.loads(l) for l in f if l.strip()]
unread = [i for i, m in enumerate(msgs) if not m.get("read")]
total = len(msgs)
if total == 0:
    print(f"({name} has no messages)")
    sys.exit(0)
print(f"=== {name} のメッセージ ({len(unread)} 件未読 / 全 {total} 件) ===")
order = unread + [i for i in range(total) if i not in unread]
for i in order:
    m = msgs[i]
    marker = "📬" if not m.get("read") else "  "
    print(f"{marker} [{i}] {m['ts']}  from {m['from']}: {m['message']}")
print()
print("（全件既読化: peer-inbox.sh mark-read / 個別: peer-inbox.sh mark-read <N>）")
PY
}

cmd_mark_read() {
    require_peer_name
    local my_inbox="$INBOX_ROOT/$PEER_NAME/inbox.jsonl"
    local idx="${1:-all}"

    if [ ! -f "$my_inbox" ]; then
        echo "($PEER_NAME has no inbox)"
        return 0
    fi

    PEER_INBOX="$my_inbox" PEER_IDX="$idx" python3 - <<'PY'
import json, os, sys
inbox = os.environ["PEER_INBOX"]
idx_arg = os.environ["PEER_IDX"]
with open(inbox, encoding="utf-8") as f:
    msgs = [json.loads(l) for l in f if l.strip()]
changed = 0
if idx_arg == "all":
    for m in msgs:
        if not m.get("read"):
            m["read"] = True
            changed += 1
else:
    try:
        n = int(idx_arg)
    except ValueError:
        print(f"Error: invalid index '{idx_arg}'", file=sys.stderr); sys.exit(1)
    if 0 <= n < len(msgs):
        if not msgs[n].get("read"):
            msgs[n]["read"] = True; changed = 1
    else:
        print(f"Error: index {n} out of range (0..{len(msgs)-1})", file=sys.stderr); sys.exit(1)
with open(inbox, "w", encoding="utf-8") as f:
    for m in msgs:
        f.write(json.dumps(m, ensure_ascii=False) + "\n")
print(f"Marked {changed} message(s) as read.")
PY
}

cmd_list() {
    if [ ! -d "$INBOX_ROOT" ]; then
        echo "no peers (inbox root: $INBOX_ROOT)"
        return 0
    fi

    echo "Known peers (root: $INBOX_ROOT):"
    local found=0
    for d in "$INBOX_ROOT"/*/; do
        [ -d "$d" ] || continue
        found=1
        local name
        name=$(basename "$d")
        local inbox="$d/inbox.jsonl"
        if [ -f "$inbox" ]; then
            local total unread
            total=$(grep -c '' "$inbox" 2>/dev/null || echo 0)
            unread=$(grep -c '"read": false' "$inbox" 2>/dev/null || echo 0)
            printf "  %-20s  unread: %s / total: %s\n" "$name" "$unread" "$total"
        else
            printf "  %-20s  (empty)\n" "$name"
        fi
    done
    if [ "$found" = "0" ]; then
        echo "  (none)"
    fi
}

cmd_review() {
    local to="${1:-}"; local topic="${2:-}"
    [ -z "$to" ] || [ -z "$topic" ] && { echo "Usage: peer-inbox.sh review <to> \"<topic>\"" >&2; exit 1; }
    cmd_send "$to" "レビュー依頼: $topic"
}

cmd_done() {
    local to="${1:-}"; local what="${2:-}"
    [ -z "$to" ] || [ -z "$what" ] && { echo "Usage: peer-inbox.sh done <to> \"<what>\"" >&2; exit 1; }
    cmd_send "$to" "完了通知: $what"
}

cmd_parallel() {
    local to="${1:-}"; local task="${2:-}"
    [ -z "$to" ] || [ -z "$task" ] && { echo "Usage: peer-inbox.sh parallel <to> \"<task>\"" >&2; exit 1; }
    cmd_send "$to" "並行作業依頼: $task"
}

cmd_whoami() {
    local resolved
    if resolved=$(detect_peer_name); then
        echo "$resolved"
    else
        echo "(unresolved — set PEER_NAME or run from a known agent dir)" >&2
        exit 1
    fi
}

case "${1:-}" in
    send)         shift; cmd_send "$@" ;;
    review|r)     shift; cmd_review "$@" ;;
    done|d)       shift; cmd_done "$@" ;;
    parallel|p)   shift; cmd_parallel "$@" ;;
    check|c)      cmd_check ;;
    mark-read|mr) shift; cmd_mark_read "$@" ;;
    list|ls)      cmd_list ;;
    whoami)       cmd_whoami ;;
    -h|--help|help|"") usage ;;
    *) echo "Unknown command: $1" >&2; usage ;;
esac
