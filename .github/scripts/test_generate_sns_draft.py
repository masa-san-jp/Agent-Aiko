#!/usr/bin/env python3
"""generate_sns_draft.py のユニットテスト（外部 API 呼び出しはすべてモック）"""
import os
import sys
import unittest
from io import BytesIO
from unittest.mock import MagicMock, patch
import urllib.error

# anthropic をモックしてからインポート（パッケージ未インストールでもテスト可能）
if "anthropic" not in sys.modules:
    sys.modules["anthropic"] = MagicMock()

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate_sns_draft import _BODY_MAX_CHARS, generate_sns_drafts, main, post_github_comment


class TestPostGithubComment(unittest.TestCase):
    def _urlopen_mock(self, mock_urlopen, status=201):
        resp = MagicMock()
        resp.status = status
        mock_urlopen.return_value.__enter__.return_value = resp
        mock_urlopen.return_value.__exit__.return_value = False

    @patch("generate_sns_draft.urllib.request.urlopen")
    def test_url_construction(self, mock_urlopen):
        self._urlopen_mock(mock_urlopen)
        post_github_comment("owner/repo", "42", "body", "tok")
        req = mock_urlopen.call_args[0][0]
        self.assertEqual(
            req.full_url,
            "https://api.github.com/repos/owner/repo/issues/42/comments",
        )

    @patch("generate_sns_draft.urllib.request.urlopen")
    def test_required_headers_present(self, mock_urlopen):
        self._urlopen_mock(mock_urlopen)
        post_github_comment("owner/repo", "1", "body", "tok")
        req = mock_urlopen.call_args[0][0]
        headers_lower = {k.lower(): v for k, v in req.headers.items()}
        self.assertIn("user-agent", headers_lower)
        self.assertIn("authorization", headers_lower)

    @patch("generate_sns_draft.urllib.request.urlopen")
    def test_http_error_includes_response_body(self, mock_urlopen):
        err = urllib.error.HTTPError(
            url="https://api.github.com/test",
            code=403,
            msg="Forbidden",
            hdrs=None,
            fp=BytesIO(b'{"message":"Resource not accessible"}'),
        )
        mock_urlopen.side_effect = err
        with self.assertRaises(RuntimeError) as ctx:
            post_github_comment("owner/repo", "1", "body", "bad")
        self.assertIn("403", str(ctx.exception))
        self.assertIn("Resource not accessible", str(ctx.exception))


class TestGenerateSnsDrafts(unittest.TestCase):
    def _make_client(self, texts):
        blocks = []
        for t in texts:
            b = MagicMock()
            b.type = "text"
            b.text = t
            blocks.append(b)
        msg = MagicMock()
        msg.content = blocks
        client = MagicMock()
        client.messages.create.return_value = msg
        return client

    @patch("generate_sns_draft.anthropic.Anthropic")
    def test_empty_body_becomes_placeholder(self, mock_cls):
        mock_cls.return_value = self._make_client(["x"])
        generate_sns_drafts("title", "")
        _, kwargs = mock_cls.return_value.messages.create.call_args
        self.assertIn("(本文なし)", kwargs["messages"][0]["content"])

    @patch("generate_sns_draft.anthropic.Anthropic")
    def test_long_body_is_truncated(self, mock_cls):
        mock_cls.return_value = self._make_client(["x"])
        generate_sns_drafts("title", "a" * (_BODY_MAX_CHARS + 100))
        _, kwargs = mock_cls.return_value.messages.create.call_args
        self.assertIn("以下省略", kwargs["messages"][0]["content"])

    @patch("generate_sns_draft.anthropic.Anthropic")
    def test_multiple_text_blocks_joined(self, mock_cls):
        mock_cls.return_value = self._make_client(["part1", "part2"])
        result = generate_sns_drafts("title", "body")
        self.assertEqual(result, "part1\npart2")

    @patch("generate_sns_draft.anthropic.Anthropic")
    def test_non_text_blocks_skipped(self, mock_cls):
        non_text = MagicMock()
        non_text.type = "tool_use"
        text = MagicMock()
        text.type = "text"
        text.text = "hello"
        msg = MagicMock()
        msg.content = [non_text, text]
        client = MagicMock()
        client.messages.create.return_value = msg
        mock_cls.return_value = client
        self.assertEqual(generate_sns_drafts("title", "body"), "hello")


class TestMain(unittest.TestCase):
    def test_exits_zero_without_api_key(self):
        with patch.dict(os.environ, {"PR_TITLE": "t", "PR_NUMBER": "1"}, clear=True):
            with self.assertRaises(SystemExit) as ctx:
                main()
        self.assertEqual(ctx.exception.code, 0)

    @patch("generate_sns_draft.post_github_comment")
    @patch("generate_sns_draft.generate_sns_drafts", return_value="draft text")
    def test_comment_contains_draft(self, mock_gen, mock_post):
        env = {
            "ANTHROPIC_API_KEY": "key",
            "PR_TITLE": "My PR",
            "PR_BODY": "body",
            "PR_NUMBER": "7",
            "GH_TOKEN": "ghtoken",
            "REPO": "owner/repo",
        }
        with patch.dict(os.environ, env, clear=True):
            main()
        mock_gen.assert_called_once_with("My PR", "body")
        comment = mock_post.call_args[0][2]
        self.assertIn("draft text", comment)
        self.assertIn("SNS 投稿案", comment)


if __name__ == "__main__":
    unittest.main()
