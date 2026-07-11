---
name: live-preview
description: "TRIGGER: エージェントが作った HTML／静的成果物（着地ページ・レポート・モック・スライド書き出し等）を、ユーザーが別端末（スマホ等）からその場で見れる「ライブ URL」で見せたいとき。「ライブで見せて」「別端末で見れる URL」「プレビュー出して」「/live-preview」等。SKIP: 公開してよい最終成果物の外部公開（外部ホスティングは別途・本スキルは tailnet 内のみ）、画像 1 枚で足りる場合（チャットに画像添付で送ればよい）、file:// で本人がこのマシン上で開ける場合。"
---

# /live-preview

エージェントが作った HTML／静的成果物を、tailnet 内だけで見れる「ライブ URL」として出す共通スキル。汎用スキル `tailnet-expose` の HTML 特化ラッパー。

## 何のためか

ユーザーが別端末（スマホ等）から成果物を見る場合、`file://` パスやこのマシンの `localhost` は届かない。作った HTML を本人の端末から URL で見れて初めて「見て決める」が回る。[Tailscale](https://tailscale.com/) の tailnet 内に出せば、**同じ tailnet の端末からだけ**見れて、外部には出ない。これを全エージェントが 1 コマンドで使える共通スキルにする。

## 不可侵ルール

1. **tailnet 内のみ。`tailscale funnel`（インターネット公開）は絶対に使わない。** 成果物には未公開情報が含まれうる。露出範囲はユーザー本人の tailnet 端末に限定する。
2. **bind 先は tailscale IP に限定する**（`0.0.0.0`／LAN IP に bind しない）。tailnet 外には出さない。
3. **使い終わったら `stop` する。** 配信を出しっぱなしにしない。次の成果物を出す前に前のを片付ける。
4. **個人情報・機微を載せた成果物を渡すときも**、宛先はユーザー本人の端末のみ（tailnet）であることを前提にする。第三者の実名等は成果物自体に入れない。

## 使い方

同梱スクリプト `{{ORG_REPO_PATH}}/Agent-team/tools/live-preview/live-preview.sh` を呼ぶ。

```bash
SK={{ORG_REPO_PATH}}/Agent-team/tools/live-preview/live-preview.sh
bash "$SK" serve <path-to-html-or-dir>   # → ライブ URL(http://<host>.<tailnet>.ts.net:<port>/...) を返す
bash "$SK" status                         # 現在の配信状態
bash "$SK" stop                           # 配信停止（必ず最後に）
```

返ってきた URL をそのままユーザーの端末へ送る。ディレクトリを渡せばその中の `index.html` が入口。ファイルを渡せば `…/<file>` が直接開く。

## 有効化（allowlist のみ・sudo 不要）

tailscale serve を使わず tailscale IP に直接 bind する方式なので **sudo／operator／HTTPS 証明書は不要**。唯一必要なのは、本スクリプトをエージェントの権限 allowlist に入れること（ネットワーク配信を伴うため）。設定ファイル（例: `{{ORG_REPO_PATH}}/.claude/settings.json` の `permissions.allow`）に、自分の配置に合わせた絶対パスで登録する:

```
"Bash(bash {{ORG_REPO_PATH}}/Agent-team/tools/live-preview/live-preview.sh:*)"
```

これで全エージェントが `serve` 一発でライブ URL を出せる。

## URL の形

`http://<host>.<tailnet>.ts.net:<port>/`。MagicDNS が引ければホスト名、引けなければ tailscale IP を使う。HTTP（HTTPS でない）だが tailnet 内に閉じているため preview 用途では十分。

## 制約

- 実体は汎用スキル `tailnet-expose`。本スクリプトはその HTML 特化ラッパーで、内部で `tailnet-expose` の `serve` を呼ぶ。
- 成果物ごとに配信を切り替えるため、前の配信を `stop` してから次を `serve` する。

## 関連

- 汎用版：`{{ORG_REPO_PATH}}/Agent-team/reference/skills/tailnet-expose/SKILL.md`（`/tailnet-expose`）
- 実装本体：`{{ORG_REPO_PATH}}/Agent-team/tools/live-preview/live-preview.sh`
