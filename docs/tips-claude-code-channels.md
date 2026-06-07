# Claude Code × 複数Telegram Bot × Ollamaローカルモデル 連携ガイド

複数のClaude Codeセッションを、それぞれ別々のTelegram Botに紐づけて独立運用する方法と、
3つ目のセッションをOllamaのローカルLLMで動かす方法をまとめる。
実運用で踏んだ落とし穴と回避策も記載する。

---

## 1. コンセプト

### やりたいこと

複数のClaude Codeセッションを同時に動かし、各セッションを別々のTelegram Botから操作する。
加えて、一部のセッションはクラウドのClaudeモデルではなくローカルLLM（Ollama）で動かす。

```
[Telegram Bot A] ──> Claude Code セッション1（クラウドモデル）
[Telegram Bot B] ──> Claude Code セッション2（クラウドモデル）
[Telegram Bot C] ──> Claude Code セッション3（ローカルLLM / Ollama）
```

### 仕組みの要点

- **チャンネル機能**（research preview）でClaude CodeとTelegramを接続する。
- Telegramプラグインは内部でBunのプロセス（`server.ts`）を起動し、Telegram APIをポーリングする。
- セッションごとの状態（トークン参照・許可リスト・ペアリング情報）は `TELEGRAM_STATE_DIR` で指定したディレクトリに保存される。
- ローカルLLMは `ANTHROPIC_BASE_URL` をOllamaのエンドポイントに向けることで利用する（プロキシ不要）。

### 最重要原則

> **1つのTelegram Botトークンで同時にポーリングできるプロセスは1つだけ。**

同じトークンを2つのセッションで使うと、Telegram APIが `409 Conflict` を返し、
メッセージがどちらに届くか不定になる。**セッション数だけBotを作る**こと。

---

## 2. 前提条件

| 項目 | 要件 |
|---|---|
| Claude Code | チャンネル機能対応バージョン（research preview） |
| 認証 | Anthropicアカウント認証（claude.ai または Console API key） |
| Bun | インストール済み |
| Ollama | インストール済み（ローカルモデル利用時） |
| Telegramアカウント | Bot作成・DM送信に使用 |

---

## 3. 手順：複数Bot構成（クラウドモデル）

### 3-1. セッションごとにTelegram Botを作成

Telegramの BotFather で、必要なセッション数だけBotを作る。

```
/newbot
→ 表示名を入力
→ username を入力（末尾は bot）
→ 発行されたトークンを控える
```

複数作る場合は `/newbot` を繰り返す。1つのアカウントで何個でも作成できる。

### 3-2. セッションごとに状態ディレクトリとトークンを用意

セッションを分離する鍵が `TELEGRAM_STATE_DIR`。
**指定しないと全セッションが同じデフォルトディレクトリを共有し、トークンや許可リストが衝突する。**

```bash
# セッションごとに別ディレクトリを作る
mkdir -p ~/.claude/channels/telegram-a
mkdir -p ~/.claude/channels/telegram-b

# 各ディレクトリに対応するBotのトークンを置く
echo "TELEGRAM_BOT_TOKEN=<BotAのトークン>" > ~/.claude/channels/telegram-a/.env
echo "TELEGRAM_BOT_TOKEN=<BotBのトークン>" > ~/.claude/channels/telegram-b/.env
```

### 3-3. セッションごとに起動

各セッションは別ターミナルで、対応する `TELEGRAM_STATE_DIR` を指定して起動する。

```bash
# セッションA
TELEGRAM_STATE_DIR=~/.claude/channels/telegram-a \
  claude --channels plugin:telegram@claude-plugins-official

# セッションB（別ターミナル）
TELEGRAM_STATE_DIR=~/.claude/channels/telegram-b \
  claude --channels plugin:telegram@claude-plugins-official
```

起動成功時は以下が表示される。

```
Listening for channel messages from:
  plugin:telegram@claude-plugins-official
```

### 3-4. ペアリング（各Botごとに実施）

1. Telegramで対象のBotにDMを送る。
2. Botが6文字のペアリングコードを返信する。
3. **そのBotに対応するClaude Codeセッションのプロンプト内**で承認する。

```
/telegram:access pair <6文字コード>
/telegram:access policy allowlist
```

`allowlist` にすると、許可した送信者以外のDMは無視される（推奨のロック状態）。

### 3-5. 自分のTelegram User IDの確認方法

許可リストに使うIDは @userinfobot にDMを送ると取得できる。
これは「自分自身のID」なので1つだけ。Botトークン（Botごとに異なる）とは別物。

| 種類 | 取得元 | 個数 |
|---|---|---|
| Bot Token | BotFather | Botの数だけ |
| User ID | @userinfobot | 自分につき1つ |

---

## 4. 手順：ローカルLLM（Ollama）で動かす

### 4-1. Ollamaの稼働確認

```bash
curl -s http://localhost:11434/api/version   # バージョンが返ればサーバー稼働中
ollama list                                   # 取得済みモデル一覧
```

### 4-2. systemd運用に一本化する（推奨）

Ollamaを手動の `ollama serve` で起動すると、systemd管理のサービスと二重起動になり
`address already in use`（ポート競合）でサービスが無限再起動に陥る。
**起動方法はsystemdに統一する。**

```bash
# 二重起動を解消（手動分とランナーを停止 → ポート解放確認）
sudo systemctl stop ollama
pkill -f "ollama serve"
pkill -f "ollama runner"
sleep 3
ss -tlnp | grep 11434 || echo "ポートは空き"
```

### 4-3. コンテキスト長などの設定

systemdのドロップインに環境変数を追加する。

```bash
sudo systemctl edit ollama
```

エディタの「ここに記述」と案内される範囲に以下を記入して保存。

```ini
[Service]
Environment="OLLAMA_CONTEXT_LENGTH=131072"
Environment="OLLAMA_KEEP_ALIVE=-1"
```

- `OLLAMA_CONTEXT_LENGTH` … 使用するコンテキスト長。モデルのネイティブ上限を超えない値にする。
- `OLLAMA_KEEP_ALIVE=-1` … モデルをメモリに常駐させ、毎回のロード待ちをなくす。

反映と確認：

```bash
sudo systemctl restart ollama
sleep 3
systemctl is-active ollama          # active なら成功
```

### 4-4. モデルの速度・コンテキストを実測

```bash
ollama run <モデル名> --verbose "hi"
```

出力の読み方：

| 指標 | 意味 |
|---|---|
| `load duration` | モデルのロード時間（初回のみ大きい。常駐させれば2回目以降ほぼ0） |
| `prompt eval rate` | 入力（プロンプト）処理速度 |
| `eval rate` | 生成速度（tokens/秒）。実用感を左右する本命の数値 |

「遅い」と感じたときは、生成速度ではなく **初回ロード待ち** が原因のことが多い。
2回目の実行が速ければロード待ちが正体。

### 4-5. Claude Codeをローカルモデルに接続

環境変数で接続先をOllamaに向け、**同じシェルで** Claude Codeを起動する。

```bash
export ANTHROPIC_BASE_URL=http://localhost:11434
export ANTHROPIC_AUTH_TOKEN=ollama
export ANTHROPIC_API_KEY=""
export CLAUDE_CODE_MAX_OUTPUT_TOKENS=32768   # 出力上限を広げる（任意）

claude --model <モデル名>
```

Telegramも併用する場合は、専用の状態ディレクトリを足して起動する。

```bash
TELEGRAM_STATE_DIR=~/.claude/channels/telegram-c \
  claude --model <モデル名> --channels plugin:telegram@claude-plugins-official
```

---

## 5. ティップス / トラブルシュート

### 409 Conflict（最頻出）

**症状**：Botにメッセージを送ってもセッションに届かない。Bunのログに
`409 Conflict, retrying` が連続で出る。

**原因**：同じBotトークンを複数プロセスが同時にポーリングしている。

**確認**：

```bash
TOKEN=<対象のトークン>
curl -s "https://api.telegram.org/bot${TOKEN}/getUpdates?timeout=1" | python3 -m json.tool
# "error_code": 409 → 別プロセスが同じトークンを掴んでいる
# "result": []      → 競合なし（正常。Bunが消費済み）
```

**対処**：
1. 同じトークンを使う全プロセスを停止する。
2. それでも消えない（このマシンに該当プロセスが見当たらないのに409が続く）場合は、
   別マシンや過去の起動が掴み続けている。BotFatherで**トークンを再発行（Revoke）**すると
   古いトークンが即無効になり、正体不明のプロセスごと切り離せる。

### 状態ディレクトリの不一致

**症状**：`/telegram:access pair` が「pendingが空」と言うのに、
ファイルを直接見るとpendingにコードが存在する。

**原因**：BunがポーリングするディレクトリとコマンドやUIが参照するディレクトリがズレている。
`TELEGRAM_STATE_DIR` の指定漏れで、片方がデフォルトの無印ディレクトリを見ているなど。

**確認**：

```bash
# 実際に存在する全 access.json と中身を洗い出す
find ~/.claude -name "access.json" -exec echo "--- {} ---" \; -exec cat {} \;

# 起動中プロセスがどの状態ディレクトリを見ているか
ps -ef | grep "bun server.ts" | grep -v grep            # PIDを確認
cat /proc/<PID>/environ | tr '\0' '\n' | grep TELEGRAM_STATE_DIR
```

**対処**：全セッションで `TELEGRAM_STATE_DIR` を必ず明示し、Bot・ディレクトリ・セッションの
対応を1対1に保つ。

### ペアリングコードの期限切れ

コードには有効期限がある。承認は **コードが届いたら速やかに** 行う。
期限切れなら、再度BotにDMして新しいコードを発行させる。

### Bot・ディレクトリの対応を後から確認する

トークンを見ずにBot名だけ確認できる。

```bash
for d in telegram-a telegram-b; do
  echo "=== $d ==="
  token=$(grep '^TELEGRAM_BOT_TOKEN=' ~/.claude/channels/$d/.env | cut -d= -f2)
  curl -s "https://api.telegram.org/bot${token}/getMe" \
    | python3 -c "import sys,json; r=json.load(sys.stdin); print('@'+r['result']['username'])"
done
```

### 環境変数の引き継ぎ漏れ

**症状**：ローカルモデルで起動したいのに、Claude Codeがクラウドモデルを要求してエラー。

**原因**：`export` したシェルと `claude` を起動したシェルが別。環境変数は引き継がれない。

**対処**：`export` 群と `claude` 起動を**同じターミナル・同じシェルで連続実行**する。

### 古いプロセスがメモリに状態を保持

ファイルを書き換えても、起動中のBunが古い状態をメモリに持ち続けることがある。
設定を変えたら、対象セッションのBunを含めて**再起動**する。
特定のセッションのBunだけ落としたいときは、対応するPIDを確認してから停止する
（他セッションのPIDを巻き込まないよう注意）。

---

## 6. 運用構成の例

| セッション | モデル | 状態ディレクトリ | Bot |
|---|---|---|---|
| 1 | クラウドモデル | telegram-a | Bot A |
| 2 | クラウドモデル | telegram-b | Bot B |
| 3 | ローカルLLM（Ollama） | telegram-c | Bot C |

各行で **モデル・ディレクトリ・Bot がすべて別** になっている点がポイント。
この1対1対応を崩さなければ、409も状態不一致も起きない。

---

## 7. チェックリスト

- [ ] セッション数ぶんのTelegram Botを作成した（トークン使い回しなし）
- [ ] 各セッションに専用の `TELEGRAM_STATE_DIR` を指定した
- [ ] 各 `.env` に正しいBotのトークンが入っている（取り違えなし）
- [ ] 起動時に「Listening for channel messages」が出た
- [ ] 各Botでペアリングを完了し、`allowlist` でロックした
- [ ] （ローカルLLM）Ollamaはsystemd単独で起動、ポート競合なし
- [ ] （ローカルLLM）`export` と `claude` 起動を同じシェルで実行した
