#!/usr/bin/env python3
"""PR マージ時に SNS 投稿案を生成し、PR コメントとして投稿する。"""
import json
import os
import sys
import urllib.error
import urllib.request

import anthropic

SYSTEM_PROMPT = (
    "あなたは「Agent-Aiko」プロジェクトの広報担当者です。"
    "マージされたプルリクエストの内容を元に、SNS 投稿案を日本語で作成してください。"
)

# PR 本文の最大送信文字数（公開リポジトリだが過大なペイロードを避ける）
_BODY_MAX_CHARS = 2000


def post_github_comment(repo: str, pr_number: str, body: str, token: str) -> None:
    url = f"https://api.github.com/repos/{repo}/issues/{pr_number}/comments"
    payload = json.dumps({"body": body}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "agent-aiko-sns-bot/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            if resp.status not in (200, 201):
                raise RuntimeError(f"GitHub API error: {resp.status}")
    except urllib.error.HTTPError as exc:
        body_text = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"GitHub API error {exc.code}: {body_text}") from exc


def generate_sns_drafts(pr_title: str, pr_body: str) -> str:
    client = anthropic.Anthropic()
    pr_body_text = pr_body.strip()
    if not pr_body_text:
        pr_body_text = "(本文なし)"
    elif len(pr_body_text) > _BODY_MAX_CHARS:
        pr_body_text = pr_body_text[:_BODY_MAX_CHARS] + "\n…（以下省略）"

    user_content = f"""以下の PR がマージされました。SNS 投稿案を生成してください。

## PR タイトル
{pr_title}

## PR 本文
{pr_body_text}

---

以下の形式で、それぞれの投稿案を生成してください：

### X（旧 Twitter）投稿案
- 日本語で 140 文字以内
- ハッシュタグ 2〜3 個を末尾に追加（例: #AgentAiko #AIエージェント）
- 変更内容を簡潔に伝える

### Threads / note 投稿案
- 日本語で 400 字程度
- 変更の背景・意図・読者へのメリットを含める
- 親しみやすいトーンで
"""
    message = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=1024,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": user_content}],
    )
    return "\n".join(
        block.text for block in message.content if block.type == "text"
    )


def main() -> None:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("ANTHROPIC_API_KEY が設定されていません。スキップします。")
        sys.exit(0)

    pr_title = os.environ["PR_TITLE"]
    pr_body = os.environ.get("PR_BODY", "")
    pr_number = os.environ["PR_NUMBER"]
    token = os.environ["GH_TOKEN"]
    repo = os.environ["REPO"]

    print(f"PR #{pr_number} 「{pr_title}」の SNS 投稿案を生成中...")
    drafts = generate_sns_drafts(pr_title, pr_body)
    comment = (
        "## 📣 SNS 投稿案（Aiko 自動生成）\n\n"
        f"{drafts}\n\n"
        "---\n"
        "*このコメントは GitHub Actions + Claude API により自動生成されました。*"
    )
    post_github_comment(repo, pr_number, comment, token)
    print("SNS 投稿案を PR コメントに投稿しました。")


if __name__ == "__main__":
    main()
