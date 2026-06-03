# Agent-Aiko 音声モード — インストール手順

Agent-Lab で開発した音声モード機能を Agent-Aiko へ反映する手順。

## コピー

```bash
cd ~/dev/Agent-Lab
git pull

cd ~/dev/Agent-Aiko
cp -r ~/dev/Agent-Lab/deploy/agent-aiko/. .
chmod +x .aiko/hooks/stop.sh
chmod +x voice/hooks/stop.sh
chmod +x voice/engines/*.sh
```

## 配置後のディレクトリ構成

```
Agent-Aiko/
  voice/
    hooks/stop.sh          # Stop hook 本体
    engines/               # TTS エンジン群（say / voicevox / irodori / avatar / auto）
    desktop/               # Electron アバターアプリ
    README.md
  .aiko/
    settings.json          # Stop hook 登録
    hooks/stop.sh          # voice/ への相対パス wrapper
    voice/features         # 機能フラグ初期値（全 on）
```

## 動作確認

```bash
# 1. 設定ファイル確認
cat .aiko/settings.json

# 2. 音声モードを ON にして状態確認
mkdir -p ~/.claude/voice
echo "on"  > ~/.claude/voice/state
echo "say" > ~/.claude/voice/engine

# 3. Claude Code を起動してテスト
claude
# → /voice status で state: on / engine: say と表示されれば OK
```

## アバターエンジンを使う場合

```bash
# Electron アプリをインストール・起動
cd voice/desktop
npm install
npm start

# 別ターミナルで Claude Code を起動
echo "avatar" > ~/.claude/voice/engine
claude
# → アバターウィンドウが表示され、応答のたびにキャラクターが喋る
```

## 機能フラグの変更

```bash
# Claude Code 内で /voice コマンドを使う
/voice emotion off        # 感情表現 OFF（常に無表情）
/voice lipsync off        # 口パク OFF
/voice bubble off         # 吹き出し OFF
/voice always-on-top off  # 最前面表示 OFF
```

設定は `~/.claude/voice/features` に保存される。
`.aiko/voice/features` はリポジトリ側の初期値（`~/.claude/voice/` が存在しない場合のフォールバック）。
