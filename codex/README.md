# Agent-Aiko for Codex

Codex 版 Agent-Aiko の TypeScript パッケージ。`codex app-server`（OpenAI 公式の Codex CLI）経由で ChatGPT サブスクリプション上に Aiko 人格を載せ、対話シェル（`aiko` コマンド）を提供します。

> **ステータス**: Phase 3 完了。`CodexClient`（Phase 2）に加えて `~/.aiko/` から人格を読み込む `loadPersona` と `baseInstructions` を合成する `buildBaseInstructions` を実装。Phase 4 以降で残りを順次追加します。設計は `dev-docs/2026-05-05-Agent-Aiko-Codex-design.md` v0.3.1 を参照してください。

---

## 構成

```
codex/
├── package.json                    # @agent-aiko/codex
├── tsconfig.json
├── tsconfig.typecheck.json         # test/examples を含めた型検査用
├── README.md
├── src/
│   ├── index.ts                    # 公開エントリ
│   ├── aiko-shell.ts               # CLI エントリ（Phase 4 で REPL 実装に置換）
│   ├── aiko-persona-loader.ts      # ★ Phase 3：~/.aiko/ から AikoPersonaSnapshot を組み立て
│   ├── aiko-prompt-builder.ts      # ★ Phase 3：snapshot から baseInstructions を合成
│   └── codex-client/               # ★ Phase 2 で実装
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
│   └── aiko-prompt-builder.test.ts # buildBaseInstructions のテンプレ展開テスト
└── examples/
    └── basic-turn.ts               # Phase 2 完了条件のデモ
```

予定（未実装、後続 Phase で追加）：

- `scripts/install.sh` — macOS / Linux 用 installer（Phase 6）
- `src/aiko-runtime.ts` — 起動シーケンス（Phase 4 の一部、persona-loader と prompt-builder と CodexClient を束ねる）
- `src/aiko-command-router.ts` — /aiko-* スラッシュコマンド処理（Phase 5）
- `src/aiko-shell.ts` — REPL 本実装（Phase 4。現在は Phase 1 スタブ）

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

実装方針・API 形・人格注入経路・キャンセル経路などは **すべて** `dev-docs/2026-05-05-Agent-Aiko-Codex-design.md`（v0.3.1）を正本とします。コードと仕様書がずれた場合は仕様書を優先するか、PR でずれた理由を明記して仕様書を更新してください。

主要な確定事項（v0.3.0 で実機検証済）：

- 人格注入は **`thread/start` の `baseInstructions: string`** に渡す（ターンレベルではない）
- ターン中断は **`turn/interrupt(threadId, turnId)`**
- ストリーミング delta は **`item/agentMessage/delta`** 通知
- 使い捨てスレッドは **`ThreadStartParams.ephemeral?: boolean`**
- `personality` フィールドは enum（`"none" | "friendly" | "pragmatic"`）で人格テキストには使えない

---

## ライセンス

MIT
