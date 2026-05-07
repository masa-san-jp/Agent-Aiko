#!/bin/bash
# Aiko PostToolUse hook
# Edit / Write / MultiEdit / NotebookEdit / Bash の使用を session-state/auto.jsonl に1行追記する。
# 自動層（取りこぼし防止）の生ログ。
#
# このフックは「後処理ログ」の位置づけで、失敗してもユーザー操作を止めない。
# したがって set -e は使わず、最後は必ず exit 0 する。
#
# 入力は Claude Code が stdin に渡す JSON。値の取り出し・整形・出力は Python
# 側で完結させる（sed 抽出は \" や改行入りの値で破綻するため使わない）。
#
# session-state はプロジェクトローカル（.claude/session-state/）に置く。
# /aiko-migrate-to-shared 実行後に .claude/aiko/ が ~/.aiko/ への symlink に
# なってもプロジェクト間で混ざらないようにするため、aiko 配下から外している。

INPUT=$(cat)

LOG_DIR=".claude/session-state"
LOG_FILE="$LOG_DIR/auto.jsonl"

mkdir -p "$LOG_DIR" 2>/dev/null || exit 0

TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# stdin の JSON を Python で完全パース → 1 行 JSON を生成
# Bash の description は秘匿情報（API キー / トークン / パスワード）を redact してから保存する
LINE=$(TS="$TS" python3 -c '
import json, os, re, sys

ts = os.environ.get("TS", "")
try:
    data = json.loads(sys.stdin.read())
except Exception:
    sys.exit(1)

tool = data.get("tool_name", "")
if tool not in ("Edit", "Write", "MultiEdit", "NotebookEdit", "Bash"):
    sys.exit(2)  # 対象外ツールはログに残さない

tool_input = data.get("tool_input") or {}

# よくある秘匿情報パターンの redact（誤検知より過剰検知を優先）
# NOTE: より具体的なプレフィックス（sk-ant-）を、より一般的なパターン（sk-）より先に置く。
# 順序を逆にすると Anthropic キー (sk-ant-...) が openai-key として誤ラベルされる。
SECRET_PATTERNS = [
    (re.compile(r"sk-ant-[A-Za-z0-9_-]{16,}"), "[REDACTED:anthropic-key]"),
    (re.compile(r"sk-[A-Za-z0-9_-]{16,}"), "[REDACTED:openai-key]"),
    (re.compile(r"ghp_[A-Za-z0-9]{20,}"), "[REDACTED:github-token]"),
    (re.compile(r"github_pat_[A-Za-z0-9_]{20,}"), "[REDACTED:github-token]"),
    (re.compile(r"gho_[A-Za-z0-9]{20,}"), "[REDACTED:github-oauth]"),
    (re.compile(r"AKIA[0-9A-Z]{16}"), "[REDACTED:aws-key]"),
    (re.compile(r"AIza[0-9A-Za-z_-]{20,}"), "[REDACTED:google-key]"),
    (re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}"), "[REDACTED:slack-token]"),
    (re.compile(r"(?i)(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|bearer)\s*[=:]\s*\S+"), r"\1=[REDACTED]"),
]

def redact(s: str) -> str:
    if not s:
        return s
    for pat, repl in SECRET_PATTERNS:
        s = pat.sub(repl, s)
    # description は長すぎる場合に切り詰める（巨大コマンドラインで auto.jsonl が膨らむのを防ぐ）
    if len(s) > 500:
        s = s[:497] + "..."
    return s

if tool == "Bash":
    obj = {"ts": ts, "tool": tool, "desc": redact(tool_input.get("description", ""))}
else:
    file_val = tool_input.get("file_path") or tool_input.get("notebook_path") or ""
    obj = {"ts": ts, "tool": tool, "file": file_val}

print(json.dumps(obj, ensure_ascii=False))
' <<<"$INPUT" 2>/dev/null)

# auto.jsonl への追記と切り詰めは並列セッション/フックで競合し得るため、
# mkdir-lock（POSIX で atomic）で append + tail+mv を同一クリティカル
# セクションにする。flock は macOS 標準に無いため mkdir で代替。
# ロック取得に失敗（5 秒タイムアウト）した場合は今回のログを諦めて hook は止めない。
LOCK_DIR="$LOG_DIR/.lock"
ATTEMPTS=0
while ! mkdir "$LOCK_DIR" 2>/dev/null; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -gt 50 ]; then
    exit 0
  fi
  sleep 0.1
done
trap 'rmdir "$LOCK_DIR" 2>/dev/null; exit 0' EXIT INT TERM

if [ -n "$LINE" ]; then
  printf '%s\n' "$LINE" >> "$LOG_FILE" 2>/dev/null || true
fi

# 500 行を超えたら古い分を切り詰める（失敗しても無視）
if [ -f "$LOG_FILE" ]; then
  LINES=$(wc -l < "$LOG_FILE" 2>/dev/null | tr -d ' ')
  if [ -n "$LINES" ] && [ "$LINES" -gt 500 ] 2>/dev/null; then
    tail -n 500 "$LOG_FILE" > "$LOG_FILE.tmp" 2>/dev/null && mv "$LOG_FILE.tmp" "$LOG_FILE" 2>/dev/null || true
  fi
fi

rmdir "$LOCK_DIR" 2>/dev/null
exit 0
