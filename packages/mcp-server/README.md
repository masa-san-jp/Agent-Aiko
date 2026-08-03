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

Your client gains nine tools, four prompts and the persona itself as readable resources. Straight after installing, with nothing configured:

```
TOOLS:   aiko.bind_runtime, aiko.get_runtime_profile, aiko.remember_user,
         aiko.list_personas, aiko.switch_persona, aiko.save_persona,
         aiko.delete_persona, aiko.report_capabilities, aiko.health
PROMPTS: aiko.activate, aiko.activate_for_task, aiko.review_as_aiko, aiko.handoff
```

`aiko.activate` is the one to try first — it returns the persona so the agent answers as Aiko for the rest of the session. `aiko.health` tells you what the server can actually read:

```json
{
  "server": {
    "name": "aiko-mcp",
    "version": "0.2.1"
  },
  "persona": {
    "id": "aiko",
    "version": "0.0.0",
    "invariantsPresent": true
  },
  "profiles": 0,
  "status": "ok"
}
```

## Teaching it about you

You talk to it. There are no files to write by hand.

```
"call me Taro"                 → remembers what to call you
"my notes live in ~/notes"     → records where they are (it does not read them)
"save this as my own persona"  → stores your variant
"go back to the original"      → returns to the shipped one
```

What it learns is written to `~/.aiko` — that machine, that user, nobody else.

## Making it yours

One persona ships with the package. You can keep as many of your own as you like and switch between them.

The original persona and its invariants cannot be overwritten (invariant I-5). Save under a different name instead.

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

If you would rather do it yourself:

| Client | Command |
|---|---|
| Claude Code | `claude mcp add aiko -- npx -y aiko-mcp` |
| Codex CLI | `codex mcp add aiko -- npx -y aiko-mcp` |
| VS Code | `code --add-mcp '{"name":"aiko","command":"npx","args":["-y","aiko-mcp"]}'` |

For clients without a CLI, add this to the MCP config:

```json
{
  "mcpServers": {
    "aiko": { "command": "npx", "args": ["-y", "aiko-mcp"] }
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
```

覚えたものは `~/.aiko` に置かれる。**その端末のその人のものだけ**で、他の利用者には届かない。

### 人格を自分用にする

同梱されているのはオリジナルのアイコ1人。自分用の人格はいくつでも作れて、切り替えられる。オリジナルの人格と不変条項は書き換えられない（不変条項 I-5）。書き換えたい場合は別名で保存する。
