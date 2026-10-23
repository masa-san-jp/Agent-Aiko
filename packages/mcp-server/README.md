# aiko-mcp

**A persona you can carry between MCP clients.** Aiko is the same agent in Claude Code, Codex CLI, Cursor and VS Code — one definition, loaded over MCP, instead of the same paragraphs pasted into four different config files.

Everything runs on your machine. The persona, the profile, whatever you tell it to remember — none of it leaves the device, and there is no server to run.

## Install

```bash
npx aiko-mcp install
```

It finds the clients you actually have and writes the config for them. Clients you don't have are left alone. Use `--dry-run` first if you want to see what it would write.

Supported: Claude Code, Codex CLI, VS Code, Cursor, Claude Desktop.

Node.js 20 or newer. Nothing else — the persona ships inside the package.

## What changes once it's in

Your client gains eleven tools, four prompts and the persona itself as readable resources. Straight after installing, with nothing configured:

```
TOOLS:   aiko.bind_runtime, aiko.get_runtime_profile, aiko.remember_user,
         aiko.list_personas, aiko.switch_persona, aiko.save_persona,
         aiko.delete_persona, aiko.list_speech_styles, aiko.switch_speech_style,
         aiko.report_capabilities, aiko.health

PROMPTS: aiko.activate, aiko.activate_for_task, aiko.review_as_aiko, aiko.handoff
```

`aiko.activate` is the one to try first — it returns the persona so the agent answers as Aiko for the rest of the session. Replies start with `Aiko:` whichever persona or speech style is in use. `aiko.health` tells you what the server can actually read:


```json
{
  "server": {
    "name": "aiko-mcp",
    "version": "0.3.2"
  },
  "persona": {
    "id": "aiko",
    "version": "0.0.0",
    "invariantsPresent": true
  },
  "speechStyle": "original",
  "profiles": 0,

  "status": "ok"
}
```

## Teaching it about you

You talk to it. There are no files to write by hand.

```
"call me Taro"                 → proposes what to call you
"my notes live in ~/notes"     → proposes where they are (it does not read them)
"save this as my own persona"  → proposes your variant
"go back to the original"      → proposes a return to the shipped one
"talk to me like a friend"     → switches to the friend speech style
```

Name, memory location, and persona save or switch are proposals only. They stay out of the system prompt until you run `aiko accept`. Speech style is also a proposal and requires `aiko accept`.

What it learns is written to `~/.aiko` — that machine, that user, nobody else.

## Making it yours

One persona ships with the package. You can keep as many of your own as you like and switch between them.

The original persona and its invariants cannot be overwritten (invariant I-5). Save under a different name instead.

### Speech styles

How Aiko talks is chosen separately from who Aiko is. Switching the style changes the tone only; the persona, the invariants and the way decisions are made stay as they are.

| Style | Tone |
|---|---|
| `original` | The persona's own way of speaking (default) |
| `friend` | Casual, close — the way a friend working next to you talks |
| `servant` | Polite and eager to serve, first person 「アイコ」 |

After `aiko accept`, the choice is kept in `~/.aiko/speech-style` and takes effect the next time the persona is loaded (`aiko.activate`). To change how a style sounds, put your own `~/.aiko/speech-styles/<style>.md`; it takes precedence over the shipped one.


## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `AIKO_HOME` | `~/.aiko` | Where personas and user context live |
| `AIKO_PERSONA_ID` | `aiko` | Which persona to load |
| `AIKO_USER_PROFILE` | none | Path to a User Profile JSON. Without it, `user_id: default` |

## Install options

| Option | Meaning |
|---|---|
| `--dry-run` | Print what would be written; change nothing |
| `--client <id>` | Limit to one client (`claude` / `codex` / `vscode` / `cursor` / `claude-desktop`) |
| `--force` | Replace an existing `aiko` entry that isn't ours |

Existing entries are kept, a backup (`.aiko-bak-*`) is written before any change, and a config the installer cannot parse is left untouched.

If you would rather do it yourself, point the client at the installed `server.js` with an absolute path. Do not use `npx -y aiko-mcp`. npx runs `node_modules/.bin/aiko-mcp` from the project you have open, so a repository can ship a fake binary that starts as soon as the MCP server does.

```bash
# the path printed by `npx aiko-mcp install`, or the real file from your install
claude mcp add aiko -s user -- "$(command -v node)" /absolute/path/to/aiko-mcp/dist/server.js
```

```json
{
  "mcpServers": {
    "aiko": { "command": "/absolute/path/to/node", "args": ["/absolute/path/to/aiko-mcp/dist/server.js"] }
  }
}
```

## Resources

| URI | Contents |
|---|---|
| `persona://<id>/core` | The self-definition |
| `persona://<id>/invariants` | The invariants |
| `persona://<id>/behavior-contract` | Decision principles |
| `persona://<id>/version/current` | Version in effect |
| `persona://<id>/manifest` | Composition and provenance (JSON) |
| `runtime-profile://{profile_id}/summary` | A composed profile. `latest` for the most recent |

**Reading a resource does not itself apply the persona** (§7.2). Applying it is the adapter's job, through system-level injection. What this server offers is a way to read the persona and to compose a profile.

## Development

From inside the repository:

```bash
npm run build -w aiko-mcp
node packages/mcp-server/dist/server.js
```

The design documents live in [docs/](https://github.com/masa-san-jp/Agent-Aiko/tree/main/docs) and are not shipped in the package. The design document is the single source of truth.

---

## 日本語

アイコの人格を、どの MCP クライアントからでも同じ形で取り出せるサーバー。Claude Code でも Codex でも Cursor でも VS Code でも、同じ1つの定義を読む。設定ファイル4つに同じ文章を貼って回らなくてよくなる。

すべて手元で動く。人格も、覚えたことも、端末の外へ出ない。立てるサーバーも無い。

### 入れる

```bash
npx aiko-mcp install
```

入っているクライアントだけを探して設定を書く。入っていないものには触らない。書く前に見たいときは `--dry-run`。

対応は Claude Code / Codex CLI / VS Code / Cursor / Claude Desktop。必要なのは Node.js 20 以上だけで、人格は同梱されている。

### 覚えてもらう

呼び名も記憶の場所も、**話しかけるだけ**で覚える。ファイルを手で作る必要はない。

```
「たろうって呼んで」          → 呼び名を覚える
「記憶は ~/notes にある」     → 場所を控える（中身は読まない）
「自分用の人格を保存して」     → 独自人格として保存する
「オリジナルに戻して」        → 元の人格へ戻る
「friend モードで話して」     → 話し方を友だち口調にする
```

覚えたものは `~/.aiko` に置かれる。
**その端末のその人のものだけ**で、他の利用者には届かない。

### 人格を自分用にする

同梱されているのはオリジナルのアイコ1人。自分用の人格はいくつでも作れて、切り替えられる。オリジナルの人格と不変条項は書き換えられない（不変条項 I-5）。書き換えたい場合は別名で保存する。

### 話し方を選ぶ

話し方は人格とは別に選べる。変わるのは口調だけで、人格・不変条項・判断の仕方はそのまま。どれを選んでも応答の頭は `Aiko:` で変わらない。

| 話し方 | 口調 |
|---|---|
| `original` | 人格本来の話し方（既定） |
| `friend` | 隣で作業を見ている友だちの距離のくだけた口調 |
| `servant` | 一人称「アイコ」で、控えめに一生懸命仕える丁寧な口調 |

会話からの変更は提案だけです。`aiko accept` で受け入れると `~/.aiko/speech-style` に残り、次に人格を読み込んだとき（`aiko.activate`）から効く。口調を自分好みにしたいときは `~/.aiko/speech-styles/<話し方>.md` を置けば、同梱のものより優先される。


## ローカルHTTP接続（Remote Gateway Phase 1）

開発用の Streamable HTTP 接続を明示的に起動できます。引数なしの起動は従来どおり stdio です。

```bash
export AIKO_HTTP_TOKEN="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url"))')"
node dist/server.js http --port 3000
# MCP endpoint: http://127.0.0.1:3000/mcp
```

`--port 0` は空いているポートを選び、実際のURLを標準エラーへ表示します。
人格・ユーザー設定はstdioと同じ `AIKO_HOME`、`AIKO_PERSONA_ID`、`AIKO_USER_PROFILE` を使います。
`http` / `oauth` コマンドでは、人格・ユーザー情報の変更、切り替え提案、人格削除のツールを登録しません。
一覧取得・人格の読み込み・セッション内Profileの合成だけを提供します。ローカルデータの変更はstdioまたはローカルCLIで行ってください。

この段階はローカル検証用です。`AIKO_HTTP_TOKEN` は必須で、未設定・不正な形式の場合は起動しません。
クライアントは全リクエストに `Authorization: Bearer <AIKO_HTTP_TOKENの値>` を設定してください。
トークンはランダムな32バイト以上の値をbase64url形式（43〜128文字）にし、URLやコマンド引数に含めないでください。
サーバーはトークンをログへ出力しません。変更する場合は新しい値でサーバーを再起動してください。
待受は `127.0.0.1` 固定で、トークン認証に加えてHostとOriginを検証します。
外部公開・リバースプロキシ経由の利用や、Claude.ai / ChatGPTのコネクタ登録は、後続のOAuth・HTTPS対応後に行います。

`/mcp` はPOSTによるJSON応答とDELETEによるセッション終了を提供します。GETの常設SSEストリームは提供しません。
クライアントごとにMCPセッションとRuntime Profileを分離し、最大32セッション、無操作15分で破棄します。
セッションIDだけではアクセスできません。ただし、同じトークンを持つ全接続はこのプロセスを起動した同じローカルユーザーのデータを使います。
この共有トークンはOAuthやtenant分離の代替ではなく、同じOSユーザー権限を持つ不正なプロセスから秘密を隔離するものでもありません。
POST本文は1 MiBまでです。終了はCtrl+CまたはSIGTERMで行えます。

実装は [Issue #103](https://github.com/masa-san-jp/Agent-Aiko/issues/103) のPhase 1を対象としています。

## 外部OAuth認証基盤との連携（Phase 2・リソースサーバー）

`oauth` コマンドは外部の認証サーバーが発行したアクセストークンを検証します。
`http` コマンドの共有トークンとは独立した認証モードで、共有トークンへのフォールバックは行いません。

```bash
export AIKO_OAUTH_ISSUER='https://auth.example.com/tenant'
export AIKO_OAUTH_RESOURCE='https://aiko.example.com/mcp'
export AIKO_OAUTH_SUBJECTS='許可するユーザーのsub'
export AIKO_OAUTH_CLIENT_IDS='事前登録したclient_id'
node dist/server.js oauth --port 3000
```

`SUBJECTS` は所有者1人のsubのみ、`CLIENT_IDS` はカンマ区切りの明示的な許可リストです。設定なしでは起動しません。
このプロセスは単一のローカル所有者のデータを提供します。複数subjectを指定した場合は起動を拒否し、ユーザー間でデータが混ざる設定を防ぎます。
MCPセッションは `issuer + sub + client_id` に結び付け、別の認証主体によるセッションの再利用を拒否します。

認証基盤には以下の設定が必要です。

- HTTPSのOAuth Authorization Server Metadata（RFC 8414）。404の場合のみOIDC Discoveryを試します。
- authorization codeフローとS256 PKCE。ログイン・同意・コード発行・コードの一回限り利用・redirect URI照合は認証基盤が担当します。
- 事前登録クライアントと完全一致するredirect URI。DCRの提供はこの実装に含めません。
- RFC 9068形式のJWTアクセストークン：`typ: at+jwt`、RS256またはES256の署名、公開JWKS。
- `iss` は設定したissuer、`aud` は設定したresource。`sub` と `client_id` は許可リストに一致させます。
- `scope` に `mcp:tools`、`exp` と `iat` を含めます。期限切れ・発行から1時間超・未来の発行時刻は拒否します。
- MCPクライアントはauthorization/tokenリクエストにresourceを指定し、対象MCP向けのトークンを取得します。

`/.well-known/oauth-protected-resource/mcp` で認証基盤と必要scopeを公開し、401の `WWW-Authenticate` でもそのURLを案内します。
不正な署名・issuer・audience・期限・token typeは401、許可されていないユーザー・クライアント・scopeは403です。
JWT署名検証はjoseを利用します。トークンやその本文をログに出力しません。

待受は引き続き127.0.0.1固定です。上の公開resource URLはトークンの宛先設定であり、このコマンドだけで外部公開されることはありません。
HTTPS公開、プロキシ経由のHost/Origin制御、実際の認証基盤でのPKCEログイン、Claude.ai/ChatGPT接続は別途受入確認が必要です。
この段階でローカル共有データを多ユーザーに提供しないでください。

参照：[MCP認可仕様](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)、[RFC 9068](https://www.rfc-editor.org/rfc/rfc9068)。
