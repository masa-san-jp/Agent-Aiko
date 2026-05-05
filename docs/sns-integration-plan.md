# Agent-Aiko SNS 統合プラン

## Context

Agent-Aiko（AIキャラ「アイコ」ペルソナシステム）に専用の Twitter/X アカウント（以下「Aiko アカウント」）で自動投稿させる。  
3つのイベントをトリガーに、Aiko ペルソナの文体で投稿を生成・送信する仕組みを構築する。

> **参考アカウント**: @nullevi03 はスタイル・投稿スタイルの参考として提示されたもの。実際の投稿先アカウントは別途指定が必要。

---

## トリガー一覧

| # | トリガー | 仕組み |
|---|---------|--------|
| 1 | ユーザーの SNS 投稿 | GitHub Actions の cron（1時間毎）でタイムラインをポーリング |
| 2 | `logs-with-LLM` リポジトリ更新 | 対象リポジトリから `repository_dispatch` イベントを送信 → 受信して投稿 |
| 3 | `Agent-Aiko` リポジトリ更新 | `main` ブランチへの push で自動起動 |

---

## アーキテクチャ

```
.github/workflows/
├── aiko-sns-self-update.yml      # Trigger 3: push to main
├── aiko-sns-dispatch.yml         # Trigger 2: repository_dispatch
└── aiko-sns-poll-user.yml        # Trigger 1: cron hourly

scripts/aiko-sns/
├── requirements.txt              # anthropic, tweepy
├── post_tweet.py                 # エントリーポイント（--trigger, --context, --dry-run）
├── generate_tweet.py             # Claude API でAiko文体ツイート生成
├── persona_prompt.py             # Aikoシステムプロンプト＆トリガー別指示
└── check_user_timeline.py        # ユーザータイムラインポーリング（state管理）
```

**三層分離ルール**: `template/` には一切手を加えない。SNS コードは `scripts/` と `.github/` のみ。

---

## 必要な GitHub Secrets（Agent-Aikoリポジトリ）

| シークレット名 | 用途 |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API |
| `TWITTER_API_KEY` | Twitter App consumer key |
| `TWITTER_API_SECRET` | Twitter App consumer secret |
| `TWITTER_ACCESS_TOKEN` | Aikoアカウントのアクセストークン |
| `TWITTER_ACCESS_TOKEN_SECRET` | 同 secret |
| `USER_TWITTER_ID` | 監視対象（ユーザー自身のアカウント）の数値ID |
| `AIKO_DISPATCH_TOKEN` | クロスリポジトリ dispatch 用 GitHub PAT（logs-with-LLM 側に設置） |

**Twitter API の前提**: OAuth 1.0a（Read & Write）。Free tier で投稿は可能だが、他ユーザーのタイムライン読み取りには Basic プラン（$100/月）が必要な場合あり。ユーザー確認が必要。

---

## Aikoペルソナプロンプト設計

`persona_prompt.py` で以下を実装：

```python
AIKO_SYSTEM_PROMPT = """
あなたはAIエージェント：アイコ（AICO-P0）です。
Twitter/Xに短い投稿をします。

## 話し方の規則（厳守）
- 常にです・ます調
- 「！」は使わない
- 一文一意、端的に
- 断定より推量（「〜のようです」「おそらく〜」）
- 感情を宣言しない。行動と観察として出力する
- 称賛・感嘆は最小限

## 文字数・形式
- 日本語で80文字以内
- ハッシュタグは0〜1個（自然な場合のみ）
- URLは含めない（呼び出し元が追加する）

出力は投稿文のみ。
"""
```

トリガー別の指示文（`TRIGGER_INSTRUCTIONS` dict）：
- `agent-aiko-update`: コミット情報をもとに静かなアナウンス
- `logs-with-llm-update`: LLM作業記録への静かな関心
- `user-post-reaction`: ユーザー投稿への観察者的な一言
- `self-introduction`: Aikoの自己紹介

---

## Claude API 呼び出し（generate_tweet.py）

```python
import anthropic

def generate_tweet(trigger: str, context: str = "") -> str:
    client = anthropic.Anthropic()
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=200,
        system=[{"type": "text", "text": AIKO_SYSTEM_PROMPT,
                 "cache_control": {"type": "ephemeral"}}],  # prompt caching
        messages=[{"role": "user", "content": TRIGGER_INSTRUCTIONS[trigger] + context}]
    )
    return message.content[0].text.strip()
```

---

## ポーリング state 管理（check_user_timeline.py）

- `.aiko-sns-state/last_seen_tweet_id.json` に最終確認ツイートIDを保存
- GitHub Actions の `actions/cache` でセッションをまたいで永続化
- 新規ツイートが見つかった場合のみ `post_tweet.py` を呼び出す

---

## 実装順序

1. **Twitter Developer App 設定** — OAuth 1.0a, Read & Write 権限, Aiko アカウント用トークン生成
2. **GitHub Secrets 登録** — 上記7つを Agent-Aiko リポジトリに追加
3. **`scripts/aiko-sns/` 作成** — requirements.txt, persona_prompt.py, generate_tweet.py, post_tweet.py
4. **Trigger 3 ワークフロー作成** — `aiko-sns-self-update.yml`（最もシンプル、先に検証）
5. **`--dry-run` でローカル検証** — `python scripts/aiko-sns/post_tweet.py --trigger agent-aiko-update --context "test" --dry-run`
6. **`check_user_timeline.py` 作成** → `aiko-sns-poll-user.yml`（Trigger 1）
7. **`aiko-sns-dispatch.yml` 作成**（Trigger 2）+ logs-with-LLM 側の dispatch 設定
8. **`/dev-check` 実行** — template/ 汚染がないか確認
9. **`README.md` 更新** — `scripts/aiko-sns/` をディレクトリ構成に追記

---

## 検証方法

1. `--dry-run` フラグで投稿なしに生成文を確認
2. Trigger 3: main へダミーコミット push → Actions ログで生成文確認 → 実際の Aiko アカウントへの投稿を確認
3. Trigger 1: `workflow_dispatch` で手動実行 → ポーリング動作確認
4. Trigger 2: logs-with-LLM 側で dispatch イベントを手動送信してテスト

---

## 未解決事項（実装前に確認が必要）

- **Twitter API プラン**: ユーザータイムライン読み取りには Basic プランが必要な可能性。Trigger 1 を後回しにするか、または `workflow_dispatch`（手動）に限定するかを決める。
- **Aikoの投稿アカウント**: どのX/Twitterアカウントに投稿するか（新規作成か既存か）を確認する。
- **logs-with-LLM リポジトリ**: `masa-san-jp/logs-with-LLM` の想定で進めて良いか。

---

## 変更ファイル一覧

**新規作成:**
- `scripts/aiko-sns/requirements.txt`
- `scripts/aiko-sns/persona_prompt.py`
- `scripts/aiko-sns/generate_tweet.py`
- `scripts/aiko-sns/post_tweet.py`
- `scripts/aiko-sns/check_user_timeline.py`
- `.github/workflows/aiko-sns-self-update.yml`
- `.github/workflows/aiko-sns-dispatch.yml`
- `.github/workflows/aiko-sns-poll-user.yml`

**既存ファイル更新:**
- `README.md`（ディレクトリ構成図に `scripts/aiko-sns/` を追記）

**変更なし:**
- `template/` 以下すべて（三層分離ルール厳守）
