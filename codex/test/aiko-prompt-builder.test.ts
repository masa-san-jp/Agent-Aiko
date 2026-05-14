// aiko-prompt-builder の単体テスト。

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { AikoPersonaSnapshot } from "../src/aiko-persona-loader.js";
import { buildBaseInstructions } from "../src/aiko-prompt-builder.js";

function snapshotFixture(overrides: Partial<AikoPersonaSnapshot> = {}): AikoPersonaSnapshot {
  return {
    mode: "origin",
    activePersona: "",
    persona: "## persona body",
    invariants: "## INVARIANTS body",
    user: {},
    rulesBase: "",
    personaRules: "",
    capabilitySkills: [],
    ...overrides,
  };
}

describe("buildBaseInstructions", () => {
  it("includes invariants, persona, and rules sections", () => {
    const out = buildBaseInstructions(snapshotFixture({ rulesBase: "- rule one" }));
    assert.match(out, /# 不変条項/);
    assert.match(out, /## INVARIANTS body/);
    assert.match(out, /# 人格/);
    assert.match(out, /## persona body/);
    assert.match(out, /# 運用ルール/);
    assert.match(out, /- rule one/);
  });

  it("uses placeholder when rulesBase is empty", () => {
    const out = buildBaseInstructions(snapshotFixture({ rulesBase: "" }));
    assert.match(out, /追加の運用ルールは指示されていません/);
  });

  it("emits prefix line tied to mode (origin)", () => {
    const out = buildBaseInstructions(snapshotFixture({ mode: "origin" }));
    assert.match(out, /Aiko-origin: /);
    assert.doesNotMatch(out, /Aiko-override:/);
  });

  it("emits prefix line tied to mode (override)", () => {
    const out = buildBaseInstructions(snapshotFixture({ mode: "override" }));
    assert.match(out, /Aiko-override: /);
    assert.doesNotMatch(out, /Aiko-origin:/);
  });

  it("uses address as the example address when provided", () => {
    const out = buildBaseInstructions(
      snapshotFixture({ user: { name: "（ユーザー名）", address: "（呼び方）" } })
    );
    assert.match(out, /呼び方: （呼び方）/);
    assert.match(out, /Aiko-origin: （呼び方）、確認します。/);
  });

  it("falls back to name when address is missing", () => {
    const out = buildBaseInstructions(snapshotFixture({ user: { name: "（ユーザー名）" } }));
    assert.match(out, /呼び方: （ユーザー名）/);
    assert.match(out, /Aiko-origin: （ユーザー名）、確認します。/);
  });

  it("falls back to a generic addressee when both name and address are missing", () => {
    const out = buildBaseInstructions(snapshotFixture({ user: {} }));
    assert.match(out, /名前: \(未設定\)/);
    assert.match(out, /呼び方: ユーザー/);
    assert.match(out, /Aiko-origin: ユーザー、確認します。/);
  });

  it("trims trailing/leading whitespace in invariants and persona blocks", () => {
    const out = buildBaseInstructions(
      snapshotFixture({ invariants: "  IV  \n", persona: "\n\n  P  \n" })
    );
    // Content lines themselves should be trimmed (no padding spaces left)
    assert.ok(out.includes("\nIV\n"), "IV should appear on its own line without surrounding spaces");
    assert.ok(out.includes("\nP\n"), "P should appear on its own line without surrounding spaces");
    assert.doesNotMatch(out, /  IV  /);
    assert.doesNotMatch(out, /  P  /);
  });

  it("includes the INVARIANTS-precedence note", () => {
    const out = buildBaseInstructions(snapshotFixture());
    assert.match(out, /INVARIANTS と人格が矛盾した場合/);
    assert.match(out, /INVARIANTS を優先します/);
  });
});
