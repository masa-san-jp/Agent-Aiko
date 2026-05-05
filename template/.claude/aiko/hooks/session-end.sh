#!/bin/bash
# Aiko SessionEnd hook
# 現状はスケルトン。将来、override モード時に会話差分から proposals を生成する。
# 自動で人格を書き換えることは絶対にしない。提案ファイルの作成のみ。

# ロゴ表示（作業終了時のアバター）
LOGO_FILE=".claude/aiko/logo.txt"
[ -r "$LOGO_FILE" ] && cat "$LOGO_FILE" && echo

MODE_FILE=".claude/aiko/mode"
[ -r "$MODE_FILE" ] || exit 0
MODE=$(tr -d '[:space:]' < "$MODE_FILE")
[ "$MODE" = "override" ] || exit 0

# 現状は何もしない（将来拡張用のフック点）
exit 0
