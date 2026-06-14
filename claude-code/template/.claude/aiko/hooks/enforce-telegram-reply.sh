#!/bin/bash
# Stop hook: enforce that a Telegram-inbound turn ends with an actual reply.
#
# Failure this prevents: the agent writing its answer only to the CLI transcript
# and never calling the Telegram reply tool, so the user receives nothing —
# equivalent to silencing notifications. This guard was born from a real
# operational failure where a completed turn never reached the user.
#
# Logic: if the most recent genuine inbound Telegram message has NO reply tool
# call after it, block the stop and instruct the model to send the reply.
# Fail-open after repeated blocks to avoid a hard lock, and fail-open on any
# internal error (never trap the agent).
#
# Portability: this hook makes NO assumption about a specific chat id, channel,
# or token location. It detects the Telegram envelope tolerantly (works with both
# the official telegram plugin envelope `source="telegram"` and the longer
# `source="plugin:telegram:telegram"` form), resolves the chat id from the inbound
# message, and resolves the bot token by trying known locations. All of these can
# be overridden by environment variables (TG_GUARD_CHAT / TG_GUARD_TOKEN_ENV).
set -euo pipefail

INPUT=$(cat)

TRANSCRIPT=$(printf '%s' "$INPUT" | jq -r '.transcript_path // empty' 2>/dev/null || true)
SESSION=$(printf '%s' "$INPUT" | jq -r '.session_id // "default"' 2>/dev/null || true)
[ -z "$TRANSCRIPT" ] && exit 0
[ -f "$TRANSCRIPT" ] || exit 0

COUNTER="/tmp/tg-reply-guard-${SESSION}.count"
ALERT="/tmp/tg-reply-guard-${SESSION}.alert"
: > "$ALERT" 2>/dev/null || true

OUT=$(python3 - "$TRANSCRIPT" "$COUNTER" "$ALERT" <<'PY' || true
import json, sys, os, time, re

transcript, counter_path, alert_path = sys.argv[1], sys.argv[2], sys.argv[3]
LOG = os.path.expanduser("~/.claude/aiko/hooks/.telegram-reply-guard.log")

def _agent_id(path):
    # Identify which agent/persona the incident belongs to, so a shared log stays
    # useful across instances. Persona transcripts live under .../overrides/<name>/.
    m = re.search(r"overrides[-/]([a-z0-9]+(?:-[a-z0-9]+)*)", path or "")
    if m:
        return m.group(1)
    parent = os.path.basename(os.path.dirname(path or ""))
    return parent or "unknown"

AGENT = _agent_id(transcript)
CHATFILE = alert_path + ".chat"

def emit_chat(text):
    # Portability: resolve the alert destination from the inbound message itself
    # (no hardcoded chat id), so the self-report works in any environment.
    m = re.search(r'chat_id="?(\d+)"?', text or "")
    if m:
        try:
            with open(CHATFILE, "w", encoding="utf-8") as f:
                f.write(m.group(1))
        except Exception:
            pass

def log(msg, alert=False):
    # Always record to the shared, per-agent incident log. Set alert=True only for
    # degradation (fail-open / drift) — those must also actively notify the user,
    # since a log nobody reads is not enough to make degradation "loud". A normal
    # BLOCK is the guard working correctly, so it is recorded but NOT alerted.
    line = f"{time.strftime('%Y-%m-%dT%H:%M:%S')} agent={AGENT} {msg}"
    try:
        os.makedirs(os.path.dirname(LOG), exist_ok=True)
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass
    if alert:
        try:
            with open(alert_path, "a", encoding="utf-8") as f:
                f.write(f"[{AGENT}] {msg}\n")
        except Exception:
            pass

def content_items(entry):
    msg = entry.get("message") or {}
    c = msg.get("content")
    if isinstance(c, list):
        return c
    if isinstance(c, str):
        return [{"type": "text", "text": c}]
    return []

entries = []
try:
    with open(transcript, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except Exception:
                continue
except Exception as exc:
    log(f"FAIL-OPEN parse-error transcript={transcript} err={exc!r}", alert=True)
    sys.exit(0)  # fail-open

def is_telegram_envelope(text):
    # Tolerant match: accept the official plugin envelope source="telegram" and the
    # longer source="plugin:telegram:..." form. A genuine inbound message also
    # carries a chat_id, which a non-Telegram text would not.
    t = text or ""
    if "chat_id=" not in t:
        return False
    return bool(re.search(r'source="(?:plugin:)?telegram', t))

# Find the last genuine inbound Telegram message (a user-role entry whose text
# carries the channel envelope). Tool results are user-type but lack the envelope.
envelope_idx = -1
for i, e in enumerate(entries):
    if e.get("type") != "user":
        continue
    for it in content_items(e):
        if it.get("type") in ("text", None) and is_telegram_envelope(it.get("text") or ""):
            envelope_idx = i
            break

def is_reply_tool(name):
    n = (name or "").lower()
    return "telegram" in n and "reply" in n

if envelope_idx == -1:
    # No envelope matched. Could be a non-Telegram session (correct), OR the
    # envelope format drifted and we silently stopped enforcing. Distinguish:
    # if this session clearly uses Telegram (reply tool was used) yet the latest
    # user message still smells like a channel message, record a drift warning.
    uses_tg = any(
        it.get("type") == "tool_use" and is_reply_tool(it.get("name"))
        for e in entries if e.get("type") == "assistant"
        for it in content_items(e)
    )
    last_user = next((e for e in reversed(entries) if e.get("type") == "user"), None)
    smells_tg = False
    txt = ""
    if last_user:
        txt = " ".join(str(it.get("text") or "") for it in content_items(last_user))
        smells_tg = "<channel" in txt or "telegram" in txt.lower()
    if uses_tg and smells_tg:
        emit_chat(txt)
        log(f"DRIFT? envelope not matched but session is Telegram-like; "
            f"enforcement skipped. transcript={transcript}", alert=True)
    sys.exit(0)  # allow stop (never false-block on a fuzzy guess)

# Was a Telegram reply tool called after that inbound message AND did it succeed?
# A tool_use alone is not proof of delivery: collect reply tool_use ids, then
# require at least one whose tool_result is not an error (delivery-success check).
reply_ids = []
errored = set()
for e in entries[envelope_idx + 1:]:
    for it in content_items(e):
        if not isinstance(it, dict):
            continue
        if it.get("type") == "tool_use" and is_reply_tool(it.get("name")):
            reply_ids.append(it.get("id"))
        elif it.get("type") == "tool_result":
            rid = it.get("tool_use_id")
            text = json.dumps(it.get("content"), ensure_ascii=False).lower()
            if it.get("is_error") is True or '"error"' in text or "failed to send" in text:
                errored.add(rid)

# Successful if a reply exists whose result is not flagged as an error. A reply
# whose result hasn't arrived yet (id not in errored) still counts, so we never
# false-block a send that is mid-flight.
replied = any(rid not in errored for rid in reply_ids) if reply_ids else False

if replied:
    try:
        os.remove(counter_path)
    except OSError:
        pass
    sys.exit(0)  # reply present -> allow stop

# No reply after the inbound message. Block, but fail-open after 3 blocks so a
# pathological state can never permanently trap the agent.
n = 0
try:
    with open(counter_path) as f:
        n = int(f.read().strip() or "0")
except Exception:
    n = 0
n += 1
try:
    with open(counter_path, "w") as f:
        f.write(str(n))
except Exception:
    pass

if n > 3:
    try:
        os.remove(counter_path)
    except OSError:
        pass
    env_txt = " ".join(str(it.get("text") or "") for it in content_items(entries[envelope_idx]))
    emit_chat(env_txt)
    log(f"FAIL-OPEN gave-up after {n-1} blocks (reply still missing). "
        f"transcript={transcript}", alert=True)
    sys.exit(0)  # fail-open

if reply_ids:
    cause = ("a Telegram reply tool call was made but its result was an error, so "
             "the message did NOT reach the user")
else:
    cause = ("no Telegram reply tool (mcp__plugin_telegram_telegram__reply) was "
             "called, so text written only to the CLI transcript never reached the user")
# Record the incident once (on the first block) so the shared log holds a trail
# of every near-miss per agent, not only outright degradation.
if n == 1:
    kind = "send-failed" if reply_ids else "reply-not-called"
    log(f"BLOCK incident: {kind} (caught, forcing reply). transcript={transcript}")

reason = (
    f"STOP BLOCKED: this turn answered a Telegram message but {cause}. Send your "
    "response to the user now via the reply tool (pass the chat_id from the inbound "
    "message) and confirm it returns success, then stop."
)
print(json.dumps({"decision": "block", "reason": reason}))
sys.exit(0)
PY
)

# --- Active self-report on degradation (portable, no hardcoded chat/token) ----
# If the guard fail-opened or detected drift, it must tell the user — a log is
# not enough. Destination is auto-resolved so this works in any environment:
#   chat  : from the inbound message (written by python to $ALERT.chat), or
#           $TG_GUARD_CHAT, or $AIKO_TELEGRAM_CHAT_ID
#   token : $TG_GUARD_TOKEN_ENV (a file exporting TELEGRAM_BOT_TOKEN=), then each
#           ~/.claude/channels/*/.env, then ~/.aiko/telegram.env, then the
#           AIKO_TELEGRAM_BOT_TOKEN environment variable. First that delivers wins.
# Hourly-throttled, best-effort; alerting failures never affect the stop decision.
if [ -s "$ALERT" ]; then
  THROTTLE="/tmp/tg-reply-guard.alert-throttle"
  now=$(date +%s)
  last=0
  [ -f "$THROTTLE" ] && last=$(cat "$THROTTLE" 2>/dev/null || echo 0)
  if [ $((now - last)) -ge 3600 ]; then
    CHAT="${TG_GUARD_CHAT:-}"
    [ -z "$CHAT" ] && [ -f "$ALERT.chat" ] && CHAT=$(cat "$ALERT.chat" 2>/dev/null || true)
    [ -z "$CHAT" ] && CHAT="${AIKO_TELEGRAM_CHAT_ID:-}"
    if [ -n "$CHAT" ]; then
      body="⚠️ Telegram notify-guard degraded / fail-open. A notification may not have reached you — please verify."$'\n'"$(head -3 "$ALERT")"
      # Build the ordered list of token sources to try.
      tokens=()
      if [ -n "${TG_GUARD_TOKEN_ENV:-}" ] && [ -f "${TG_GUARD_TOKEN_ENV}" ]; then
        t=$(grep -m1 -E '^(TELEGRAM_BOT_TOKEN|AIKO_TELEGRAM_BOT_TOKEN)=' "$TG_GUARD_TOKEN_ENV" 2>/dev/null | cut -d= -f2- || true)
        [ -n "$t" ] && tokens+=("$t")
      fi
      for f in "$HOME"/.claude/channels/*/.env; do
        [ -f "$f" ] || continue
        t=$(grep -m1 '^TELEGRAM_BOT_TOKEN=' "$f" 2>/dev/null | cut -d= -f2- || true)
        [ -n "$t" ] && tokens+=("$t")
      done
      if [ -f "$HOME/.aiko/telegram.env" ]; then
        t=$(grep -m1 '^AIKO_TELEGRAM_BOT_TOKEN=' "$HOME/.aiko/telegram.env" 2>/dev/null | cut -d= -f2- || true)
        [ -n "$t" ] && tokens+=("$t")
      fi
      [ -n "${AIKO_TELEGRAM_BOT_TOKEN:-}" ] && tokens+=("${AIKO_TELEGRAM_BOT_TOKEN}")
      for tok in "${tokens[@]:-}"; do
        [ -z "$tok" ] && continue
        resp=$(curl -sS --max-time 10 -X POST \
          "https://api.telegram.org/bot${tok}/sendMessage" \
          --data-urlencode "chat_id=${CHAT}" \
          --data-urlencode "text=${body}" 2>/dev/null | head -c 2000 || true)
        if printf '%s' "$resp" | grep -q '"ok":true'; then
          echo "$now" > "$THROTTLE"
          break
        fi
      done
    fi
  fi
fi
rm -f "$ALERT" "$ALERT.chat" 2>/dev/null || true

# Pass through the python decision (block JSON) as the hook's stdout, unchanged.
[ -n "$OUT" ] && printf '%s\n' "$OUT"
exit 0
