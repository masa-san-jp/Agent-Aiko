# /voice — 音声読み上げモード制御コマンド

## 概要

Claude Code の応答を TTS で読み上げる機能を制御する。
Aiko とは独立した汎用機能で、どの人格・エージェントからでも使える。

設定ファイルは `~/.claude/voice/` に置く（ユーザーレベル）。
Stop hook の登録は `settings.json` の `hooks.Stop` で行う（初回セットアップ時のみ手動）。

## コマンド仕様

| コマンド | 動作 |
|---|---|
| `/voice` | 状態確認（status と同義） |
| `/voice on` | 音声モードON |
| `/voice off` | 音声モードOFF |
| `/voice status` | state と engine を報告 |
| `/voice feature` | 拡張機能フラグの一覧表示 |
| `/voice <name> on\|off` | 拡張機能フラグを個別 ON/OFF |
| `/voice <engine>` | エンジン切替 |

拡張機能フラグ名（`<name>`）: `always-on-top`, `emotion`, `lipsync`, `bubble`
エンジン名: `say`, `auto`, `voicevox`, `irodori`, `avatar`

## 各サブコマンドの実行手順

### on

1. `Bash: mkdir -p ~/.claude/voice && echo "on" > ~/.claude/voice/state`
2. 「音声モードをオンにしました。」と応答する

### off

1. `Bash: echo "off" > ~/.claude/voice/state`
2. 「音声モードをオフにしました。」と応答する

### status / 引数なし

1. `Bash: cat ~/.claude/voice/state 2>/dev/null || echo "off"`
2. `Bash: cat ~/.claude/voice/engine 2>/dev/null || echo "say"`
3. 現在の状態とエンジン名を報告する

### feature（引数なし）

1. `~/.claude/voice/features` が存在しない場合はデフォルト値（全 on）で表示する
2. 存在する場合は各行を読んで以下の 4 フラグを表示する:
   - `always-on-top` … アバターウィンドウが常に最前面に表示されるか
   - `emotion` … 感情表現（笑顔・困り顔など）を使うか
   - `lipsync` … 口パクアニメーションを使うか
   - `bubble` … セリフ吹き出しを表示するか
3. ファイルに記載のないフラグは `on（デフォルト）` と表示する

### \<name\> on|off（フラグ名が引数の場合）

引数が `emotion`, `lipsync`, `bubble`, `always-on-top` のどれかで、次の引数が `on` または `off` の場合にこの処理を行う。

1. 以下の Python コードで `~/.claude/voice/features` を書き換える（行がなければ末尾に追加）:
   ```
   Bash: python3 -c "
   import pathlib, re, sys
   path = pathlib.Path.home() / '.claude/voice/features'
   path.parent.mkdir(parents=True, exist_ok=True)
   name, val = sys.argv[1], sys.argv[2]
   lines = path.read_text().splitlines() if path.exists() else []
   new_lines = [f'{name}={val}' if re.match(rf'^{re.escape(name)}=', l) else l for l in lines]
   if not any(re.match(rf'^{re.escape(name)}=', l) for l in lines):
       new_lines.append(f'{name}={val}')
   path.write_text('\n'.join(new_lines) + '\n')
   " <name> <on|off>
   ```
2. 「`<name>` を `on/off` にしました。次の発話から反映されます。」と応答する

### \<engine\>（フラグ名でもon/off/statusでもない引数）

1. 有効なエンジン: `say`, `auto`, `voicevox`, `irodori`, `avatar`
2. 有効な場合: `Bash: mkdir -p ~/.claude/voice && echo "<engine>" > ~/.claude/voice/engine`
   を実行し、「エンジンを \<engine\> に切り替えました。」と応答する
3. 無効な場合: `say / auto / voicevox / irodori / avatar が使えます。` と案内する

## ファイルパス（ユーザーレベル）

- `state`: `~/.claude/voice/state`（"on" または "off"）
- `engine`: `~/.claude/voice/engine`（エンジン名）
- `features`: `~/.claude/voice/features`（拡張機能フラグ、1行1設定）

## エンジン一覧

| エンジン | 説明 | OS |
|---|---|---|
| `say` | macOS say コマンド（デフォルト） | macOS |
| `auto` | OS を自動判定して say/voicevox を切替 | macOS/Linux |
| `voicevox` | VOICEVOX Engine（高品質日本語 TTS） | macOS/Linux/WSL |
| `irodori` | Irodori-TTS-Server | macOS/Linux |
| `avatar` | デスクトップアバター（視覚的存在感） | macOS/Linux |

## セットアップ（初回のみ）

install.sh 実行時に自動で `~/.aiko/voice/` へ配置されます。Stop hook はインストール済み `.claude/settings.json` に含まれています。

手動で追加する場合は `.claude/settings.json` に以下を記述してください:

```json
{
  "hooks": {
    "Stop": [{ "hooks": [{ "type": "command", "command": "bash $HOME/.aiko/voice/hooks/stop.sh" }] }]
  }
}
```
