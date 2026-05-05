# Agent-Aiko — Codex 版

Codex 版 Agent-Aiko の TypeScript パッケージ。`codex app-server`（OpenAI 公式の Codex CLI）経由で ChatGPT サブスクリプション上に Aiko 人格を載せ、対話シェル（`aiko` コマンド）を提供します。

トップレベル: [Agent-Aiko README](../README.md) ／ Claude Code 版: [`claude-code/README.md`](../claude-code/README.md)

> **ステータス**: MVP 達成（Phase 0〜6 完了）。`bash codex/scripts/install.sh` で Node.js / codex CLI 確認 → ビルド → `~/.aiko/` 初期化 → `aiko` shim 設置までを 1 コマンドで実行できる状態。設計は [`Agent-Aiko-dev/2026-05-05-Agent-Aiko-Codex-design.md`](https://github.com/masa-san-jp/Agent-Aiko-dev/blob/main/2026-05-05-Agent-Aiko-Codex-design.md) v0.3.1 を参照してください。

## クイックスタート

```bash
# 1. 前提：Node.js 20+ と codex CLI（`codex login` 済）
codex login

# 2. リポジトリをクローン（既にしてあるなら不要）
git clone https://github.com/masa-san-jp/Agent-Aiko.git
cd Agent-Aiko

# 3. 1 コマンドでセットアップ
bash codex/scripts/install.sh

# 4. PATH に ~/.local/bin を通したら起動
aiko
```

---

## 構成

```
codex/
├── package.json                    # @agent-aiko/codex
├── tsconfig.json
├── tsconfig.typecheck.json         # test/examples を含めた型検査用
├── README.md
├── scripts/
│   └── install.sh                  # ★ Phase 6：1 コマンドセットアップ
├── src/
│   ├── index.ts                    # 公開エントリ
│   ├── aiko-shell.ts               # Phase 4：CLI エントリ（REPL）。Phase 5 で router を統合
│   ├── aiko-runtime.ts             # Phase 4：persona-loader / prompt-builder / CodexClient を束ねる ＋ INVARIANTS チェック
│   ├── aiko-command-router.ts      # ★ Phase 5：/aiko-* slash command 処理
│   ├── aiko-history.ts             # ★ Phase 5：override-history.jsonl への追記
│   ├── aiko-persona-loader.ts      # Phase 3：~/.aiko/ から AikoPersonaSnapshot を組み立て
│   ├── aiko-prompt-builder.ts      # Phase 3：snapshot から baseInstructions を合成
│   └── codex-client/               # Phase 2
│       ├── index.ts                # 公開 API
│       ├── types.ts                # CodexClientOptions / AskOptions / AskResult 等
│       ├── jsonrpc.ts              # JSON-RPC 2.0 framing（LineBuffer / parseIncoming / encode）
│       ├── transport.ts            # Transport インターフェース（テスト差替用）
│       ├── process-manager.ts      # 実機 Transport：codex app-server 子プロセス管理
│       └── codex-client.ts         # CodexClient 本体（start/stop/startThread/ask/interrupt）
├── test/
│   ├── jsonrpc.test.ts             # JSON-RPC framing の単体テスト
│   ├── codex-client.test.ts        # MockTransport を使った CodexClient.ask() 等のテスト
│   ├── aiko-persona-loader.test.ts # 一時 ~/.aiko/ フィクスチャによる loadPersona テスト
│   ├── aiko-prompt-builder.test.ts # buildBaseInstructions のテンプレ展開テスト
│   ├── aiko-runtime.test.ts        # Phase 4：runtime の起動・プレフィックス強制補完
│   ├── aiko-command-router.test.ts # Phase 5：slash command 群 ＋ INVARIANTS チェック
│   └── install-script.test.ts      # ★ Phase 6：installer のサンドボックス E2E
└── examples/
    └── basic-turn.ts               # Phase 2 完了条件のデモ
```

Phase 0〜6 が **MVP**。後続の Phase 7（README 整備）／ Phase 8（v1→v2 migration スキル）は spec §10 の磨き込みフェーズ。

---

## 前提

- Node.js **20** 以上
- `codex` CLI（`codex-cli` パッケージ）が PATH にあること
- ChatGPT サブスクリプション（Plus / Pro / Business / Enterprise / Edu のいずれか）

---

## 開発手順

```bash
cd codex
npm install
npm run typecheck      # 型チェック（src/ + test/ + examples/）
npm test               # node:test で単体テスト実行
npm run build          # dist/ にコンパイル
npm run dev            # Phase 1 スタブを tsx 経由で実行
npm run example:basic-turn   # 1 ターン実行のデモ（要 codex login）
```

`codex app-server` の TypeScript スキーマを取得して `src/codex-schema/` に置く場合：

```bash
npm run schema:generate
```

このスキーマは `.gitignore` 対象です（実機 codex のバージョンに依存するため、各開発者が必要時に再生成する）。

---

## 設計の単一情報源（SoT）

実装方針・API 形・人格注入経路・キャンセル経路などは **すべて** [`Agent-Aiko-dev/2026-05-05-Agent-Aiko-Codex-design.md`](https://github.com/masa-san-jp/Agent-Aiko-dev/blob/main/2026-05-05-Agent-Aiko-Codex-design.md)（v0.3.1）を正本とします。コードと仕様書がずれた場合は仕様書を優先するか、PR でずれた理由を明記して仕様書を更新してください。

主要な確定事項（v0.3.0 で実機検証済）：

- 人格注入は **`thread/start` の `baseInstructions: string`** に渡す（ターンレベルではない）
- ターン中断は **`turn/interrupt(threadId, turnId)`**
- ストリーミング delta は **`item/agentMessage/delta`** 通知
- 使い捨てスレッドは **`ThreadStartParams.ephemeral?: boolean`**
- `personality` フィールドは enum（`"none" | "friendly" | "pragmatic"`）で人格テキストには使えない

---

## ライセンス

MIT
