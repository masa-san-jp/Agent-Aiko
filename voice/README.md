# voice — 音声読み上げインフラ

Claude Code の Stop イベントで応答テキストを自動的に TTS 読み上げする機能。
Agent-Aiko に同梱された汎用 TTS インフラ。

## ディレクトリ構成

```
voice/
  hooks/
    stop.sh          # Claude Code Stop hook のエントリーポイント
  engines/
    say.sh           # macOS say コマンド（デフォルト）
    voicevox.sh      # VOICEVOX HTTP API
    irodori.sh       # Irodori TTS API
    avatar.sh        # Electron アバターアプリ経由（WebSocket）
    auto.sh          # OS を自動判別して適切なエンジンを選択
  desktop/
    main.js          # Electron アバターアプリ本体
    preload.js
    renderer/        # アバター描画・口パク・吹き出し
    assets/aiko/     # キャラクター画像（感情別 PNG）
    package.json
```

## セットアップ

```bash
mkdir -p ~/.claude/voice
echo "off"    > ~/.claude/voice/state    # on にすると読み上げ開始
echo "avatar" > ~/.claude/voice/engine   # 使用エンジン
```

## `/voice` コマンド

| コマンド | 動作 |
|---|---|
| `/voice on` | 読み上げ ON |
| `/voice off` | 読み上げ OFF |
| `/voice status` | 現在の状態を表示 |
| `/voice <engine>` | エンジン切替（say / voicevox / irodori / avatar / auto） |
| `/voice emotion on\|off` | 感情表現フラグ |
| `/voice lipsync on\|off` | 口パクフラグ |
| `/voice bubble on\|off` | セリフ吹き出しフラグ |
| `/voice always-on-top on\|off` | ウィンドウ最前面フラグ |

設定は `~/.claude/voice/` に保存される（リポジトリには含まれない）。

## アバターアプリの起動

```bash
cd voice/desktop
npm install
npm start
```

アバターアプリが起動した状態で `/voice on` + engine を `avatar` に設定すると、
応答のたびにキャラクターが喋り、感情表現・口パク・吹き出しが動作する。

**必要な環境変数（avatar エンジン使用時）：**

| 変数 | デフォルト | 説明 |
|---|---|---|
| `AIKO_IRODORI_URL` | `http://localhost:8000` | Irodori-TTS-Server のベース URL |
| `AIKO_IRODORI_VOICE` | `aiko` | 使用する話者名 |
| `AIKO_AVATAR_PORT` | `7749` | アバターアプリの WebSocket ポート |

`AIKO_` プレフィックスは preload.js が参照する既存の変数名で、互換性のためそのまま使用しています。

音声合成には Irodori-TTS-Server（または OpenAI 互換 TTS エンドポイント）が必要。
起動方法は [Irodori-TTS-Server のドキュメント](https://github.com/masa-san-jp/irodori-tts-server) を参照。

## Claude Code への hook 登録

エージェントの `settings.json` の Stop hook に以下を追加することで有効になる：

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [{ "type": "command", "command": "bash <path-to>/voice/hooks/stop.sh" }] }
    ]
  }
}
```

`.aiko/settings.json` で登録済み（このリポジトリに同梱）。

## 感情別アバター画像

`desktop/assets/aiko/` の PNG は [masa-san-jp/Agent-Aiko](https://github.com/masa-san-jp/Agent-Aiko)
リポジトリの `pets/aiko/master/` フレームを使用（個人利用・同リポ内配布の範囲で利用）：

| ファイル | 元画像 | 使用場面 |
|---|---|---|
| neutral.png | aiko_idle_01.png | デフォルト |
| happy.png | aiko_happy_01.png | 完了・感謝 |
| thinking.png | aiko_thinking_01.png | 検討・確認中 |
| apologetic.png | aiko_failed_01.png | エラー・謝罪 |
| excited.png | aiko_walking_01.png | 高評価・感嘆 |
