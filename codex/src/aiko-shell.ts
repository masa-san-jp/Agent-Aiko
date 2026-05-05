#!/usr/bin/env node
// Phase 1 placeholder for the `aiko` command.
//
// 実装は Phase 4（REPL）で入ります。本ファイルは「Phase 1 スケルトン時点で
// `npm install` 後に `aiko` コマンドが何かしら動く」ことを保証するための
// プレースホルダです。
//
// 設計の正本: dev-docs/2026-05-05-Agent-Aiko-Codex-design.md v0.3.1

import { PACKAGE, PHASE, VERSION } from "./index.js";

const message = `${PACKAGE} ${VERSION} (${PHASE})

This is the Phase 1 skeleton. The interactive shell is implemented in Phase 4.

What works now:
  - npm install / npm run typecheck / npm run build / npm run schema:generate

What's coming:
  - Phase 2: codex-client.ts (JSON-RPC client for codex app-server)
  - Phase 3: aiko-persona-loader.ts + aiko-prompt-builder.ts
  - Phase 4: aiko-shell.ts (interactive REPL — replaces this stub)
  - Phase 5: aiko-command-router.ts (/aiko-* slash commands)
  - Phase 6: codex/scripts/install.sh

References:
  - https://github.com/masa-san-jp/Agent-Aiko/tree/main/codex
  - dev-docs/2026-05-05-Agent-Aiko-Codex-design.md (design source of truth)
`;

process.stdout.write(message);
process.exit(0);
