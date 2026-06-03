#!/bin/bash
# stop.sh — 音声読み上げ Stop hook（共有版）
# Claude Code が応答を完了したとき発火し、音声モードON時のみ読み上げを行う
# いかなる場合も Claude Code の動作を阻害してはならない（エラー時は exit 0）
# Note: set -e を使わない。予期しない終了が Claude Code の動作を止めるため。

HOOK_DIR="$(cd "$(dirname "$0")" && pwd 2>/dev/null)" || exit 0
ENGINES_DIR="$HOOK_DIR/../engines"

# 設定ファイルは VOICE_CONFIG_DIR 環境変数 → ~/.claude/voice/ の順で探す
VOICE_CONFIG_DIR="${VOICE_CONFIG_DIR:-$HOME/.claude/voice}"
STATE_FILE="$VOICE_CONFIG_DIR/state"
ENGINE_FILE="$VOICE_CONFIG_DIR/engine"

# 1. state ファイル確認。"on" でなければ即終了
[ -f "$STATE_FILE" ] || exit 0
STATE="$(tr -d '[:space:]' < "$STATE_FILE" 2>/dev/null)" || exit 0
[ "$STATE" = "on" ] || exit 0

# 2. stdin の JSON から transcript_path を取り出す
INPUT="$(cat 2>/dev/null)" || exit 0
TRANSCRIPT_PATH="$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('transcript_path', ''))
except Exception:
    print('')
" 2>/dev/null)" || exit 0

# 3. transcript_path が存在しなければ終了
[ -n "$TRANSCRIPT_PATH" ] || exit 0
[ -f "$TRANSCRIPT_PATH" ] || exit 0

# 4 & 5. transcript.jsonl 末尾から最後の assistant テキストを取得 + Markdown 除去
TEXT="$(python3 - "$TRANSCRIPT_PATH" 2>/dev/null <<'PYEOF'
import sys, json, re

path = sys.argv[1]
last_text = ""

try:
    with open(path, "r", encoding="utf-8") as f:
        from collections import deque
        lines = deque(f, maxlen=200)

    for line in reversed(lines):
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue

        # role / type で assistant 判定
        role = entry.get("role") or entry.get("type") or ""
        if role != "assistant":
            # message ネスト形式にフォールバック
            msg = entry.get("message", {})
            if isinstance(msg, dict):
                role = msg.get("role", "")
            if role != "assistant":
                continue

        # content 抽出（文字列 / リスト / ネスト の 3形式に対応）
        content = entry.get("content") or entry.get("message", {}).get("content", "")
        if isinstance(content, str):
            last_text = content
        elif isinstance(content, list):
            parts = []
            for c in content:
                if isinstance(c, dict) and c.get("type") == "text":
                    parts.append(c.get("text", ""))
                elif isinstance(c, str):
                    parts.append(c)
            last_text = "\n".join(parts)
        if last_text:
            break

except Exception:
    pass

if not last_text:
    sys.exit(0)

# Markdown 除去・整形
text = last_text

# 1. コードブロック
text = re.sub(r"```[\s\S]*?```", "コードを書きました。", text)
# 2. インラインコード
text = re.sub(r"`[^`]*`", "", text)
# 3. 見出し
text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
# 4. 箇条書き
text = re.sub(r"^[\-\*•]\s+", "、", text, flags=re.MULTILINE)
# 5. 番号リスト
text = re.sub(r"^\d+\.\s+", "、", text, flags=re.MULTILINE)
# 6. テーブル行
text = re.sub(r"^\|.*\|.*$", "", text, flags=re.MULTILINE)
# 7. 強調
text = re.sub(r"\*{1,2}([^*]+)\*{1,2}", r"\1", text)
# 8. URL
text = re.sub(r"https?://\S+", "", text)
# 9. 3連続以上の改行を2改行に圧縮
text = re.sub(r"\n{3,}", "\n\n", text)
# 10. 500文字超なら切り詰め
text = text.strip()
if len(text) > 500:
    text = text[:500] + "…続きがあります。"

print(text)
PYEOF
)" || exit 0

# 6. 整形後テキストが空なら終了
[ -n "$TEXT" ] || exit 0

# 7. エンジン選択・起動
ENGINE="say"
if [ -f "$ENGINE_FILE" ]; then
  ENGINE="$(tr -d '[:space:]' < "$ENGINE_FILE" 2>/dev/null)" || ENGINE="say"
fi

case "$ENGINE" in
  say|voicevox|irodori|avatar|auto) ;;
  *) ENGINE="say" ;;
esac

ENGINE_SCRIPT="$ENGINES_DIR/${ENGINE}.sh"

if [ -f "$ENGINE_SCRIPT" ]; then
  printf '%s' "$TEXT" | bash "$ENGINE_SCRIPT" &
elif command -v say >/dev/null 2>&1; then
  say "$TEXT" &
fi

exit 0
