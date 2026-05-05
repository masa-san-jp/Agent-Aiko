# Agent-Aiko for Codex

Codex 版 Agent-Aiko の TypeScript パッケージ。`codex app-server`（OpenAI 公式の Codex CLI）経由で ChatGPT サブスクリプション上に Aiko 人格を載せ、対話シェル（`aiko` コマンド）を提供します。

> **ステータス**: Phase 1（スケルトン）。実装は Phase 2 以降で順次追加します。設計は `dev-docs/2026-05-05-Agent-Aiko-Codex-design.md` v0.3.1 を参照してください。

---

## 構成（予定）

```
codex/
├── package.json          # @agent-aiko/codex
├── tsconfig.json
├── README.md
├── scripts/
│   └── install.sh        # macOS / Linux 用（Phase 6 で実装）
└── src/
    ├── codex-client.ts        # codex app-server との JSON-RPC 通信（Phase 2）
    ├── aiko-runtime.ts        # 起動シーケンス（Phase 3）
    ├── aiko-persona-loader.ts # ~/.aiko/ から人格を読み込む（Phase 3）
    ├── aiko-prompt-builder.ts # baseInstructions を合成（Phase 3）
    ├── aiko-command-router.ts # /aiko-* スラッシュコマンド処理（Phase 5）
    ├── aiko-shell.ts          # REPL エントリ（Phase 4）
    └── codex-schema/          # 自動生成（schema:generate で更新）
```

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
npm run typecheck      # TypeScript の型チェックのみ
npm run build          # dist/ にコンパイル
npm run dev            # tsx で aiko-shell.ts を直接起動（実装後）
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
