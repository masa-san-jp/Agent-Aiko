# ChatGPTへの接続で次に確認すること

2026-10-24時点。公式資料を確認した結果、ChatGPT向けには、PCのMCPサーバーをインターネットへ直接公開しないSecure MCP Tunnelを先に検討する。

公式資料: [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)、[ChatGPTでの接続手順](https://developers.openai.com/plugins/deploy/connect-chatgpt)。

この方式はOpenAIへの外向き接続を使う。利用にはPlatform側のトンネル設定・利用権限・実行用APIキーと、対象ChatGPTワークスペースへの関連付けが必要になる。利用可否・費用はこのアカウントではまだ確認できていない。
PCを公開しない方式でも、呼び出したツールの返す人格や設定はChatGPT側へ送られる。最初の接続確認には配布人格とテスト用ユーザー情報だけを使う。

## 完了した準備

- localhost限定・認証必須・読み取り専用のMCP接続。
- テスト専用HTTPS認証サーバーによるログイン・同意・PKCE交換からMCP呼び出しまでのローカル統合試験。
- 不正なPKCE verifierと認可コード再利用の拒否。
- ルートissuer URLの末尾スラッシュに関する互換性修正。
- 認証テスト用サーバーと鍵がnpm配布物に含まれないことの確認。

## 実アカウントで必要な確認

Platformの[トンネル設定](https://platform.openai.com/settings/organization/tunnels)を開いたところ、ログインが必要だった。アカウント・権限・既存トンネルをまだ確認できていない。

ログイン後に、既存トンネルと対象ワークスペースの利用権限を読み取り確認する。
新規トンネル作成やChatGPTからPCのデータへアクセスさせる設定は、対象データとアクセス範囲を具体化してから利用者に確認する。
この時点ではアカウント作成・APIキー発行・トンネル作成・外部公開・プラグイン登録を行っていない。

この方式の検討対象はChatGPT。Claude.aiへの接続が成立したことを意味しない。
