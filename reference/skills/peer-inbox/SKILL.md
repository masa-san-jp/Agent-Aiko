---
name: peer-inbox
description: "TRIGGER: ユーザーが「<peer> にレビュー依頼」「<peer> に完了通知」「<peer> に並行作業頼んで」「メッセージ届いてる？」「受信箱見て」「既読にして」のような peer-inbox 関連の自然文を発した場合、または /peer-inbox を明示入力した場合。複数ターミナルで並行起動している Claude Code セッション間の非同期メッセージング（送信・受信・既読化）を行う。SKIP: 同セッション内のサブエージェント呼び出し（/agent-call）、subprocess 1 ターン委譲、外部チャネル通信（Slack/Discord/メール）."
---

# /peer-inbox — 複数ターミナル間 Claude Code 非同期メッセージング

複数の Claude Code セッションが別ターミナルで並行稼働しているとき、互いに作業依頼・レビュー依頼・完了通知を送り合うための薄いラッパー。実装は `{{ORG_REPO_PATH}}/Agent-team/tools/peer-inbox/peer-inbox.sh`。

## 識別子（PEER_NAME）の解決

各セッションの「自分の名前」は以下の順で自動解決される：

1. 環境変数 `PEER_NAME`（明示設定）
2. cwd basename がエージェント名（`{{TEAM_AGENTS}}` のいずれか）→ そのまま採用
3. cwd basename がパッケージ管理エージェント名（`<persona>*`）→ マッピング
4. 解決失敗時はエラー（ユーザーに `export PEER_NAME=<name>` を促す）

## 自然文 → コマンドのマッピング

ユーザーの発話から intent と peer 名を抽出して以下のサブコマンドを叩く。実行時は **絶対パス** を使う：

```
SCRIPT={{ORG_REPO_PATH}}/Agent-team/tools/peer-inbox/peer-inbox.sh
```

### 送信系

| 発話パターン | 実行 |
|---|---|
| 「`<peer>` にレビュー依頼」「`<peer>` にレビュー頼んで」「`<peer>` に PR `<N>` レビュー」 | `bash $SCRIPT review <peer> "<topic>"` |
| 「`<peer>` に完了通知」「終わったって `<peer>` に伝えて」「`<peer>` に done」 | `bash $SCRIPT done <peer> "<what>"` |
| 「`<peer>` に並行で `<task>` 頼んで」「並行作業 `<peer>`」 | `bash $SCRIPT parallel <peer> "<task>"` |
| 「`<peer>` に `<message>` って送って」「`<peer>` に伝えて：`<message>`」 | `bash $SCRIPT send <peer> "<message>"` |

`<topic>` `<what>` `<task>` `<message>` はユーザーの発話から文脈に応じて構成する。明示されていない場合はユーザーに 1 行確認する。

### 受信系

| 発話パターン | 実行 |
|---|---|
| 「メッセージ届いてる？」「受信箱見て」「inbox」「何か来てる？」「未読確認」 | `bash $SCRIPT check` |
| 「既読にして」「全部読んだ」「mark-read」 | `bash $SCRIPT mark-read` |
| 「`<N>` 番だけ既読」 | `bash $SCRIPT mark-read <N>` |

### 状態確認

| 発話パターン | 実行 |
|---|---|
| 「peer 一覧」「誰がいる？」「list」 | `bash $SCRIPT list` |
| 「自分の名前」「whoami」「私は誰？」 | `bash $SCRIPT whoami` |

## 実行手順

1. 発話から intent（送信／受信／状態確認）を判定
2. 送信系なら peer 名と message 部分を抽出
   - peer 名が曖昧なら `bash $SCRIPT list` で候補を見せて確認
3. `bash $SCRIPT <subcommand>` を実行
4. 結果を簡潔に報告：
   - 送信：「`<peer>` に送信完了」
   - 受信：未読件数と最初の数件を要約
   - 既読：何件既読化したか

## メッセージ保管場所

`$PEER_INBOX_ROOT/<peer>/inbox.jsonl`（既定 `~/.peer-inbox/`）に **JSONL**（1 行 1 メッセージ）で追記。既定はリポ外のため通常 `.gitignore` 不要（リポ配下に置く運用にした場合のみ、そのパスを gitignore する）。

1 行のエントリ形式：
```json
{"ts": "2026-05-10T14:30:00+09:00", "from": "<sender>", "to": "<recipient>", "message": "レビュー依頼: ...", "read": false}
```

`review` / `done` / `parallel` は `message` の先頭に `レビュー依頼: ` / `完了通知: ` / `並行作業依頼: ` を付けて送るだけで、スキーマは `send` と同一。

## 実装ヒント

`peer-inbox.sh` は基本的に以下の構造：

```bash
case "$1" in
  send|review|done|parallel)
    # 受信側の inbox.jsonl に 1 行 JSON (JSONL) を追記
    ;;
  check)
    # 自分の inbox.jsonl を read=false 優先で列挙
    ;;
  mark-read)
    # 指定ファイル（or 全件）の read を true に書き換え
    ;;
  list)
    # 全 peer ディレクトリを列挙
    ;;
  whoami)
    # PEER_NAME 解決ロジックを実行して結果出力
    ;;
esac
```

## 制約

- **同セッション内**の協調には `/agent-call` を使う（1 プロセスで 1 ターン委譲）
- 外部チャネル（Slack / Discord / メール）には触らない（別プロトコル）
- 機密情報を inbox に書かない（gitignore でも push 事故を防ぐため）
