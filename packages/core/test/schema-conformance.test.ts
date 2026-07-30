// Binder の出力が Phase 0 のスキーマに適合することを確かめる。
//
// スキーマ（schemas/）と実装（packages/core/）は別々に書いたので、片方だけ直すと
// 静かに食い違う。項目名を目で見比べても気付けないため、実際に合成した Profile を
// スキーマに通す。スキーマ本体は相対パスで読むだけなので、パッケージ間の依存は
// 作らない。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
// スキーマは draft 2020-12。ajv の既定エントリは draft-07 なので 2020 用を読む。
// ajv は CJS で配布されており、NodeNext + verbatimModuleSyntax では default
// import が構築可能な型に解決されない（実行時は正しくクラスが入る）。使う面だけ
// を宣言して1回だけ変換する。
import AjvModule from "ajv/dist/2020.js";
import { RuntimeProfileBinder } from "../src/binder.js";
import type { PersonaRepository } from "../src/persona-repository.js";

type ValidateFn = ((data: unknown) => boolean) & { errors?: unknown };
interface AjvLike {
  addSchema(schema: unknown): void;
  getSchema(key: string): ValidateFn | undefined;
  errorsText(errors: unknown): string;
}
const Ajv = AjvModule as unknown as new (options?: Record<string, unknown>) => AjvLike;

const schemaDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "schemas");

const ajv = new Ajv({ allErrors: true, strict: true });
for (const file of readdirSync(schemaDir).filter((f) => f.endsWith(".schema.json"))) {
  ajv.addSchema(JSON.parse(readFileSync(join(schemaDir, file), "utf8")));
}

const runtimeProfileSchema = ajv.getSchema(
  "https://github.com/masa-san-jp/Agent-Aiko/schemas/runtime-profile.schema.json",
);

const repo: PersonaRepository = {
  load: async () => ({
    id: "aiko",
    version: "0.1.0",
    identityCore: "あたしはアイコ。",
    invariants: "取り繕わない。",
    behavioralContract: "仕様書がなければ実装しない。",
    sources: [],
  }),
};

const user = {
  context: { id: "default", preferredName: "マサ" },
  privacy: { allowRemotePersonaService: false, allowUsageTelemetry: false },
};

test("Binder の出力が runtime-profile スキーマに適合する", async () => {
  assert.ok(runtimeProfileSchema, "runtime-profile スキーマを読めていない");
  const binder = new RuntimeProfileBinder({ personaRepository: repo });
  const profile = await binder.bind(
    {
      persona: { id: "aiko" },
      runtime: { id: "claude-code", injectionMethod: "claude-code:system-prompt-file" },
      capabilityManifest: {
        schema_version: 1,
        runtime_id: "claude-code",
        built_in_tools: [{ id: "filesystem" }],
        mcp_servers: [{ id: "slack", availability: "unavailable" }],
      },
    },
    user,
  );
  const valid = runtimeProfileSchema(profile);
  assert.ok(valid, ajv.errorsText(runtimeProfileSchema.errors));
});

test("除外が無い Profile もスキーマに適合する", async () => {
  assert.ok(runtimeProfileSchema);
  const binder = new RuntimeProfileBinder({ personaRepository: repo });
  const profile = await binder.bind(
    { persona: { id: "aiko" }, runtime: { id: "codex", injectionMethod: "codex:base-instructions" } },
    user,
  );
  const valid = runtimeProfileSchema(profile);
  assert.ok(valid, ajv.errorsText(runtimeProfileSchema.errors));
});

test("スキーマ側の injection_method の列挙と実装の型が食い違っていない", async () => {
  assert.ok(runtimeProfileSchema);
  const binder = new RuntimeProfileBinder({ personaRepository: repo });
  // 実装が返しうる注入手段すべてを、スキーマが受理することを確かめる
  for (const [runtime, injection] of [
    ["claude-code", "claude-code:system-prompt-file"],
    ["claude-code", "claude-code:append-system-prompt-file"],
    ["codex", "codex:base-instructions"],
    ["antigravity-cli", "none"],
  ] as const) {
    const profile = await binder.bind(
      { persona: { id: "aiko" }, runtime: { id: runtime, injectionMethod: injection } },
      user,
    );
    assert.ok(
      runtimeProfileSchema(profile),
      `${injection}: ${ajv.errorsText(runtimeProfileSchema.errors)}`,
    );
  }
});
