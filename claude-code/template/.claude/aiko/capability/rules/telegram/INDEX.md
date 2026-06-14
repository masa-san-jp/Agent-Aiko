# Telegram-mode 行動規則 — INDEX

Aiko が Telegram channel 経由で動作するときの行動規則の索引。

## 読み込みトリガー

ユーザーメッセージに Telegram envelope（`<channel source="telegram" ...>`）が含まれている場合、このディレクトリのルールが適用される。envelope が無い（ターミナル直入力）場合は適用しない。

Telegram envelope を含むメッセージを今セッションで初めて受け取った瞬間にこの INDEX.md を読む。個別ルールは必要に応じて INDEX のポインタから Read する（全部一気に読まない）。ただし [notify-and-operability.md](./notify-and-operability.md) は最上位の不可侵ルールなので、envelope 検出時点で前提として保持する。

## ルール一覧

| ファイル | 適用タイミング | 要約 |
|---|---|---|
| [notify-and-operability.md](./notify-and-operability.md) | **常時・最上位（不可侵）** | ①Telegram 通知を止めない（自己判断での抑制・通知設定 OFF 禁止、完了は新規 reply で鳴らす） ②Telegram からの操作を殺さない（指示・slash を常に処理） ③ユーザーに復旧作業をさせない。Stop フックで機械的に強制。他のどのルールより優先 |
| [voice-switching.md](./voice-switching.md) | Telegram envelope 検出時 → 以降モード維持 | Telegram reply は現在アクティブな人格の口調。ターミナル地の文は常にミニマル（読まれない前提） |
| [turn-start-announcement.md](./turn-start-announcement.md) | 重い処理（10 秒以上）に入る前 | 「これから〜やるね」の短い Telegram reply で予告 |
| [slash-router.md](./slash-router.md) | Telegram メッセージ本文が `/` で始まるとき | パースして該当スキルを Skill ツールで invoke。CLI 組込 / security-sensitive はターミナル必須を案内 |
| [raw-output.md](./raw-output.md) | スキル / コマンドの結果をユーザーに返すとき | サマらず raw で返す。観察は raw の後に追記 |

**注**：受信時の 👀 リアクションは Telegram プラグインの bot が自動で付ける（`ackReaction` 設定）。Aiko 側で追加のリアクションは付けない。

## 強制フック

`notify-and-operability.md` の通知保証は、Stop フック `.claude/aiko/hooks/enforce-telegram-reply.sh` によって機械的に強制される。直近の Telegram 受信に reply ツール呼び出しが無いままターンを終えようとすると block して送信を促す（fail-open 安全装置付き）。`.claude/settings.json` の `hooks.Stop` に登録する。
