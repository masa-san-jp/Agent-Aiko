# @agent-aiko/runtime-sdk

Aiko Runtime SDK。各ランタイムが人格を安全かつ一貫して注入するための**唯一の公開実行インターフェース**。設計書は [`docs/20260801-aiko-runtime-sdk-design-specification.md`](../../docs/20260801-aiko-runtime-sdk-design-specification.md)。

設計書が唯一の正本。

## いまどこまで（Phase R1）

設計書 §23 の移行計画のうち **R1（Facade 実装）** まで。

| できること | 状態 |
|---|---|
| `prepareLaunch` | ある |
| `getProfile` | ある |
| `compileInstructions` | ある |
| `health` | ある |
| 共通エラーモデル | ある |
| `verifyInjection` / `rebind` / `diagnostics` | **無い**（呼ぶと理由を返して失敗する） |
| `evaluateAction` / `validateResponse` | **型と schema だけある**（R7-1）。呼ぶと `AIKO_RUNTIME_FEATURE_UNAVAILABLE` |

**R1 の約束は「挙動を変えない」こと。** 中身は既存の Binder を呼ぶ薄い層で、合成の内容も hash も変えない。先に通り道だけ作っておくと、R2 以降で「SDK にしたから壊れた」と「移行で壊れた」を切り分けられる。

まだ MCP Server も Adapter も CLI も、この SDK を通していない。置き換えは R2 以降。

## 使い方

```typescript
const sdk = createRuntimeSdk({
  binder: new RuntimeProfileBinder({ personaRepository }),
  personaRepository,
  user,
});

const bundle = await sdk.prepareLaunch({
  requestId: "req-1",
  personaRef: { personaId: "aiko" },
  userRef: { userId: "default" },
  runtime: { id: "claude-code", version: "1.0.0" },
  injectionCapability: { systemLevel: ["claude-code:system-prompt-file"] },
  requestedConsistencyLevel: 2,
});
```

## 設計上の判断

**注入手段は Adapter が申告する。** SDK が「このランタイムならこれが使えるはず」と推測しない。推測すると、注入できないのにできることにされる。

**Level 2 を要求されて system 級の手段が無ければ、格下げせずに拒否する。** §9.3 が fallback を禁じている。会話の先頭に人格を置いて「適用できた」と言うのは、適用の保証ではない。

**エラーは stage で分類する。** 下位の `BindingError` は1種類だが、意味は `detail.stage` で分かれている。**メッセージ文で分岐しない** ——表現を変えた瞬間に分類が壊れる。同じ間違いを別のところで既に踏んでいる。

**エラーに本文を載せない。** §10.2。人格全文・User Profile 全文・Tool 引数全文は `toJSON()` に出さない。テストで実際に混ざらないことを確かめている。

**`health` は投げない。** 「不健全である」を返すのが仕事なので、読めなければ `unavailable` を返す。

**仕様にあって R1 に無いものは、黙らずに理由を返す。** 呼べば失敗し、なぜ失敗したかとどこを見ればよいかを返す。

**Policy の型は zod で1回だけ定義する（`src/policy/`）。** TypeScript 型も JSON Schema もそこから導く。手書きの interface と検証用 schema を別に置くと、片方だけ直された状態が作れてしまい、SDK 直呼びと MCP Tool で受理される入力が食い違う。R7 仕様書 R7-5 の「同一入力から同一結果」は、その食い違いがある限り成立しない。

**仕様が禁じている形は、規約ではなく作れなくする。** 承認主体の無い `require_approval`、モデル判定だけの `deny`、`patch` 以外の方針に書き換え済み本文を添えた修正案 — いずれも parse で落ちる。ただし **JSON Schema にはこの制約が写らない**（zod の refine は生成結果に出ない）ので、MCP Tool 側も入口は zod で parse する。

## テスト

```bash
npm ci          # ルートで1度
npm run build
npm test -w @agent-aiko/runtime-sdk
```

一番大事なのは **SDK を通しても Binder 直呼びと同じ profile_hash が出る**こと（§20.5・R2 の完了基準）。§20.4 の Fail Closed も、欠落を1つずつ作って拒否を確かめている。
