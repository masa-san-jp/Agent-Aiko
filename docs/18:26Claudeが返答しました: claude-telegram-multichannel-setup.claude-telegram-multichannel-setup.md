# Claude Code × Telegram 複数チャネル 再現＆再発防止 手順書

最終更新: 2026-06-10

---

## 0. この手順書の保証範囲（最初に必読）

- **保証する**: 今回詰まった原因（トークン取り違え・無効、`.env`文字化け、`access.json`破損/ID未登録、bun不在、webhook競合、409二重起動）は、起動前検査で全て赤字表示され再発しない。
- **保証しない**: 下記「残存リスク」は機械的に潰せない。特に **DM相手のボット取り違え** は人間側の目視確認が必須。

---

## 1. 今回判明した全原因と対策

| # | 原因 | 対策（スクリプトに内蔵済み） |
|---|---|---|
| 1 | `/telegram:configure`・`/telegram:access pair` はデフォルトパス `~/.claude/channels/telegram/` しか見ず、カスタム `TELEGRAM_STATE_DIR` と不一致になる | コマンドを使わず `.env` / `access.json` を直接生成 |
| 2 | トークン解決が state dir 依存で参照先がずれると無音化 | 起動時に `TELEGRAM_BOT_TOKEN` をシェル環境にも明示注入 |
| 3 | `allowFrom` 未登録だと `pairing` がコード返信だけしてセッションに転送しない | 自分の Telegram ID を生成時に埋め込む |
| 4 | `$env:` はセッション限定。起動とコマンド実行の環境が食い違う | 作成と起動を関数内で完結 |
| 5 | 同一トークンを2セッションで起動すると getUpdates が 409 Conflict で片方無音 | 起動前に409を検査＋1ボット1ウィンドウ運用 |

確定した自分の Telegram ユーザーID: `8903310093`
プラグインバージョン: `0.0.6`

---

## 2. $PROFILE に登録する確定スクリプト（自己診断版）

`notepad $PROFILE` で開き、以下を貼って保存。保存後 PowerShell を開き直す（または `. $PROFILE`）。

```powershell
$global:ClaudeMyTelegramId = "8903310093"
$global:ClaudePluginRoot   = "$HOME\.claude\plugins\cache\claude-plugins-official\telegram\0.0.6"

function New-ClaudeChannel {
    param(
        [Parameter(Mandatory)][string]$Channel,
        [Parameter(Mandatory)][string]$Token
    )
    $dir = "$HOME\.claude\channels\$Channel"
    New-Item -ItemType Directory -Force $dir | Out-Null
    "TELEGRAM_BOT_TOKEN=$Token" | Out-File -Encoding ascii "$dir\.env"
    @"
{
  "dmPolicy": "pairing",
  "allowFrom": ["$global:ClaudeMyTelegramId"],
  "groups": {},
  "pending": {}
}
"@ | Out-File -Encoding ascii "$dir\access.json"
    Write-Host "[OK] $Channel 作成完了。起動: Start-ClaudeChannel $Channel" -ForegroundColor Green
}

function Start-ClaudeChannel {
    param([Parameter(Mandatory)][string]$Channel)
    $dir = "$HOME\.claude\channels\$Channel"

    # [1] ファイル存在
    if (-not (Test-Path "$dir\.env")) {
        Write-Host "[NG] .env が無い。先に New-ClaudeChannel $Channel <token>" -ForegroundColor Red; return
    }
    if (-not (Test-Path "$dir\access.json")) {
        Write-Host "[NG] access.json が無い。New-ClaudeChannel で再生成を" -ForegroundColor Red; return
    }

    # [2] bun
    $env:PATH += ";$HOME\.bun\bin"
    if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
        Write-Host "[NG] bun が PATH に無い。MCPサーバが起動不能" -ForegroundColor Red; return
    }

    # [3] access.json 妥当性 + 自分IDの登録
    try {
        $acc = Get-Content "$dir\access.json" -Raw | ConvertFrom-Json
    } catch {
        Write-Host "[NG] access.json が壊れている(JSON不正)。New-ClaudeChannel で再生成を" -ForegroundColor Red; return
    }
    if ($acc.allowFrom -notcontains $global:ClaudeMyTelegramId) {
        Write-Host "[警告] allowFrom に自分のID($global:ClaudeMyTelegramId)が無い。pairing待ちになる" -ForegroundColor Yellow
    }

    # [4] トークン取得 + getMe 実検査
    $tok = ((Get-Content "$dir\.env" | Select-String "TELEGRAM_BOT_TOKEN=") -replace "TELEGRAM_BOT_TOKEN=","").Trim()
    if (-not $tok) { Write-Host "[NG] .env からトークンを取得できない(文字化け/空)" -ForegroundColor Red; return }
    try {
        $me = Invoke-RestMethod "https://api.telegram.org/bot$tok/getMe"
    } catch {
        Write-Host "[NG] getMe 失敗。トークン無効/失効/ネットワーク不通" -ForegroundColor Red; return
    }
    if (-not $me.ok) { Write-Host "[NG] トークン無効(getMe ok=false)" -ForegroundColor Red; return }
    Write-Host "[OK] ボット確認: @$($me.result.username)" -ForegroundColor Green

    # [5] webhook
    $wh = Invoke-RestMethod "https://api.telegram.org/bot$tok/getWebhookInfo"
    if ($wh.result.url) {
        Write-Host "[NG] webhook設定あり($($wh.result.url))。削除:" -ForegroundColor Red
        Write-Host "     Invoke-RestMethod 'https://api.telegram.org/bot$tok/deleteWebhook'" -ForegroundColor Red
        return
    }

    # [6] 409競合
    try {
        $up = Invoke-RestMethod "https://api.telegram.org/bot$tok/getUpdates?timeout=0"
        Write-Host "[OK] ポーリング権取得。競合なし" -ForegroundColor Green
    } catch {
        Write-Host "[NG] getUpdates 409の可能性。@$($me.result.username) を別ウィンドウで二重起動していないか確認" -ForegroundColor Red
        return
    }

    # 全検査通過 → 起動
    $env:CLAUDE_PLUGIN_ROOT = $global:ClaudePluginRoot
    $env:TELEGRAM_STATE_DIR = $dir
    $env:TELEGRAM_BOT_TOKEN = $tok
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host " 起動チャネル: $Channel" -ForegroundColor Cyan
    Write-Host " DM宛先ボット: @$($me.result.username)  ← これにDMする" -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor Cyan
    claude --channels plugin:telegram@claude-plugins-official
}
```

> 注: [6]の `getUpdates` は保留メッセージを1件消費する副作用がある。厳密に避けるなら[6]ブロックを削除（409はclaude起動後のログでも判別可能）。

---

## 3. 運用手順（2コマンドのみ）

### 新チャネル追加（BotFatherでトークン取得後）

```powershell
New-ClaudeChannel dcbc-soumu "新ボットの実トークン"
```

### 起動（チャネルごとに別ウィンドウ）

```powershell
Start-ClaudeChannel dcbc-soumu
```

起動時に表示される `DM宛先ボット: @xxxx_bot` を**目視確認してから**、そのボットにDMする。

---

## 4. 起動前診断の読み方（詰まったらここを見る）

| 表示 | 原因 | 次の一手 |
|---|---|---|
| `[NG] .env が無い` | 未作成 | `New-ClaudeChannel` |
| `[NG] access.json が無い` | 未作成/削除 | `New-ClaudeChannel` 再実行 |
| `[NG] bun が PATH に無い` | bun未導入 | `curl -fsSL https://bun.sh/install \| bash` |
| `[NG] access.json が壊れている` | JSON破損 | `New-ClaudeChannel` で再生成 |
| `[警告] allowFrom に自分のIDが無い` | ID未登録 | pairing待ちになる。意図しないなら再生成 |
| `[NG] .env からトークン取得できない` | 文字化け/空 | `New-ClaudeChannel` でASCII再書き込み |
| `[NG] getMe 失敗 / ok=false` | トークン無効/失効 | BotFatherでトークン確認し再作成 |
| `[NG] webhook設定あり` | webhook競合 | 表示された deleteWebhook を実行 |
| `[NG] getUpdates 409` | 二重起動 | 同ボットの別セッションを停止 |

---

## 5. 残存リスク（スクリプトで潰せない＝人間が守る）

| リスク | なぜ検査不能か | 防御策 |
|---|---|---|
| **DM相手のボット取り違え** | APIはトークンの有効性しか見ず、ユーザがどのボットにDMしたかは不可視 | 起動時表示 `@ボット名` を目視照合してからDM |
| 起動後の二重起動 | 検査は起動時点のスナップショット | 1ボット1ウィンドウを厳守 |
| `8903310093` が別アカウントのID | 固定値を信用するだけ | 別Telegramアカウントを使わない |
| プラグイン/claude本体の不具合・更新 | スクリプト管轄外 | `0.0.6` のパス更新時は先頭`$global:ClaudePluginRoot`を修正 |
| ネットワーク瞬断・Telegram障害 | 環境依存 | 一時的。再起動で復旧 |

---

## 6. 運用ルール（固定事項）

- 1チャネル = 1ボット = 1トークン = 1ウィンドウ。同一トークンを2セッションで起動しない。
- 複数同時運用は別ウィンドウで `Start-ClaudeChannel` を各々実行。
- DM前に必ず起動時表示の `DM宛先ボット: @xxxx_bot` を確認。
- PC はセッション稼働中は電源を切らない。
- 既存の `dcbc-hisyo` / `dcbc-zaimu` は作成済みのため `Start-ClaudeChannel <名前>` で起動可能。
