---
name: tailnet-expose
description: "TRIGGER: このマシンで動く／作ったもの（静的ファイル・ディレクトリ・ローカルで稼働中のサーバやアプリのポート）を、別端末（スマホ等）から見れる「tailnet 内だけの URL」で出したいとき。「Tailscale で出して」「別端末で見れる URL にして」「このポートを外から」「/tailnet-expose」等。SKIP: インターネット公開（funnel・外部ホスティングは対象外＝本スキルは tailnet 内のみ）、画像 1 枚で足りる場合（チャットに添付）、本人がこのマシン上で直接開ける場合。"
---

# /tailnet-expose

ローカルのもの（静的成果物・稼働中サービスのポート）を、tailnet 内だけの URL で出す汎用スキル。

## 何のためか

ユーザーが別端末（スマホ等）から成果物を見たい場合、`file://` や `localhost` は別端末からは届かない。[Tailscale](https://tailscale.com/) の tailnet に出せば、**同じ tailnet に属する端末からだけ** URL で見れて、外部には出ない。これを「静的成果物」でも「稼働中サービス」でも 1 コマンドで出せる共通の土台にする。

## 2 つのモード

同梱スクリプト `{{ORG_REPO_PATH}}/Agent-team/tools/tailnet-expose/tailnet-expose.sh` を呼ぶ。

```bash
SK={{ORG_REPO_PATH}}/Agent-team/tools/tailnet-expose/tailnet-expose.sh

# 1) 静的ファイル/ディレクトリを配信
bash "$SK" serve <path-to-file-or-dir> [--port N]
#   → http://<host>.<tailnet>.ts.net:<port>/[file]

# 2) 既にローカルで動いてるサービス(127.0.0.1:M)を tailnet に転送
bash "$SK" port <N> [--target M]      # 既定 M=N
#   → http://<host>.<tailnet>.ts.net:<N>/   （例: dev server localhost:3000 を port 3000 で出す）

bash "$SK" status                      # 出してるもの一覧
bash "$SK" stop [--port N|--all]       # 片付け（使い終わったら必ず）
```

返ってきた URL をそのままユーザーの端末へ（チャット等で）送る。

## 仕組み（sudo 不要）

- `serve`: `python3 -m http.server` を **tailscale IP に bind** して配信する。
- `port`: 同梱の `tcp_relay.py`（依存なしの小さな TCP リレー）で **tailscale IP:N → 127.0.0.1:M** を中継する。
- どちらも `tailscale serve`／証明書／operator 設定／sudo は不要。bind 先を tailscale IP に限定するので LAN・インターネットには出ない。

## 不可侵ルール

1. **tailnet 内のみ。`tailscale funnel`（インターネット公開）は絶対に使わない。** 成果物には未公開情報が含まれうる。
2. **bind 先は tailscale IP に限定**（`0.0.0.0`／LAN IP に bind しない）。
3. **使い終わったら `stop`。** 出しっぱなしにしない。
4. 第三者の実名・機微は成果物自体に入れない。

## 有効化（allowlist のみ）

ネットワーク配信を伴うため、本スクリプトをエージェントの権限 allowlist に入れる。設定ファイル（例: `{{ORG_REPO_PATH}}/.claude/settings.json` の `permissions.allow`）に、自分の配置に合わせた絶対パスで登録する:

```
"Bash(bash {{ORG_REPO_PATH}}/Agent-team/tools/tailnet-expose/tailnet-expose.sh:*)"
```

## 検証状況

- `serve`（静的配信）・`port`（既存サービス転送）とも tailscale IP 経由で HTTP 200 到達を実機検証済み。

## 関連

- HTML 特化版：`{{ORG_REPO_PATH}}/Agent-team/reference/skills/live-preview/SKILL.md`（`/live-preview`。内部で本スキルの `serve` を呼ぶ）
- 実装本体：`{{ORG_REPO_PATH}}/Agent-team/tools/tailnet-expose/tailnet-expose.sh`
