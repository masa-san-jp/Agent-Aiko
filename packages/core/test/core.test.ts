// Aiko Core のテスト。
//
// 実ファイルを読む部分は一時ディレクトリに ~/.aiko/ 相当を作って確かめる。
// mock で置き換えると「ファイルが無いときにどう振る舞うか」という、この実装が
// 一番間違えやすい部分が検証できなくなる。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSystemPersonaRepository } from "../src/filesystem-persona-repository.js";
import { PersonaResolutionError } from "../src/persona-repository.js";
import { compile } from "../src/compiler.js";
import { sha256, hashObject } from "../src/hash.js";

async function makeAikoHome(
  layout: Record<string, string>,
): Promise<{ home: string; cleanup: () => Promise<void> }> {
  const home = await mkdtemp(join(tmpdir(), "aiko-core-test-"));
  for (const [rel, content] of Object.entries(layout)) {
    const path = join(home, rel);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, content, "utf8");
  }
  return { home, cleanup: () => rm(home, { recursive: true, force: true }) };
}

const REF = { id: "aiko" };

test("origin モード: persona/origin/persona.md と INVARIANTS を読む", async () => {
  const { home, cleanup } = await makeAikoHome({
    "persona/origin/persona.md": "あたしはアイコ。",
    "INVARIANTS.md": "取り繕わない。",
  });
  try {
    const snapshot = await new FileSystemPersonaRepository({ aikoHome: home }).load(REF);
    assert.equal(snapshot.identityCore, "あたしはアイコ。");
    assert.equal(snapshot.invariants, "取り繕わない。");
    assert.equal(snapshot.behavioralContract, "");
  } finally {
    await cleanup();
  }
});

test("mode ファイルが無ければ origin として扱う", async () => {
  const { home, cleanup } = await makeAikoHome({
    "persona/origin/persona.md": "origin 側",
    "persona/override/persona.md": "override 側",
    "INVARIANTS.md": "x",
  });
  try {
    const snapshot = await new FileSystemPersonaRepository({ aikoHome: home }).load(REF);
    assert.equal(snapshot.identityCore, "origin 側");
  } finally {
    await cleanup();
  }
});

test("mode に不正値が入っていても origin として扱う", async () => {
  const { home, cleanup } = await makeAikoHome({
    mode: "OVERRIDE!!\n",
    "persona/origin/persona.md": "origin 側",
    "persona/override/persona.md": "override 側",
    "INVARIANTS.md": "x",
  });
  try {
    const snapshot = await new FileSystemPersonaRepository({ aikoHome: home }).load(REF);
    assert.equal(snapshot.identityCore, "origin 側");
  } finally {
    await cleanup();
  }
});

test("override モード: active-persona のディレクトリを読む", async () => {
  const { home, cleanup } = await makeAikoHome({
    mode: "override\n",
    "active-persona": "aiko-dev\n",
    "persona/overrides/aiko-dev/persona.md": "dev 人格",
    "persona/overrides/aiko-dev/rules.md": "仕様書がなければ実装しない。",
    "persona/override/persona.md": "既定 override",
    "persona/INVARIANTS.md": "誠実であること。",
  });
  try {
    const snapshot = await new FileSystemPersonaRepository({ aikoHome: home }).load(REF);
    assert.equal(snapshot.identityCore, "dev 人格");
    assert.equal(snapshot.behavioralContract, "仕様書がなければ実装しない。");
    assert.equal(snapshot.invariants, "誠実であること。");
  } finally {
    await cleanup();
  }
});

test("active-persona が消えていたら既定 override へ落ちる", async () => {
  const { home, cleanup } = await makeAikoHome({
    mode: "override\n",
    "active-persona": "存在しない人格\n",
    "persona/override/persona.md": "既定 override",
    "INVARIANTS.md": "x",
  });
  try {
    const snapshot = await new FileSystemPersonaRepository({ aikoHome: home }).load(REF);
    assert.equal(snapshot.identityCore, "既定 override");
  } finally {
    await cleanup();
  }
});

test("不変条項が無ければ起動させない（§6.5 fail closed）", async () => {
  const { home, cleanup } = await makeAikoHome({ "persona/origin/persona.md": "人格だけある" });
  try {
    await assert.rejects(
      () => new FileSystemPersonaRepository({ aikoHome: home }).load(REF),
      (err: unknown) => {
        assert.ok(err instanceof PersonaResolutionError);
        assert.match(err.message, /invariants/);
        assert.ok(err.detail.searched && err.detail.searched.length > 0);
        return true;
      },
    );
  } finally {
    await cleanup();
  }
});

test("人格本文が無ければ起動させない（§6.5 fail closed）", async () => {
  const { home, cleanup } = await makeAikoHome({ "INVARIANTS.md": "不変条項だけある" });
  try {
    await assert.rejects(
      () => new FileSystemPersonaRepository({ aikoHome: home }).load(REF),
      PersonaResolutionError,
    );
  } finally {
    await cleanup();
  }
});

test("旧フラット型 persona/aiko-origin.md も読める（既存インストールを落とさない）", async () => {
  const { home, cleanup } = await makeAikoHome({
    "persona/aiko-origin.md": "旧型の origin",
    "INVARIANTS.md": "x",
  });
  try {
    const snapshot = await new FileSystemPersonaRepository({ aikoHome: home }).load(REF);
    assert.equal(snapshot.identityCore, "旧型の origin");
  } finally {
    await cleanup();
  }
});

test("旧フラット型 persona/aiko-override.md も読める", async () => {
  const { home, cleanup } = await makeAikoHome({
    mode: "override\n",
    "persona/aiko-override.md": "旧型の override",
    "INVARIANTS.md": "x",
  });
  try {
    const snapshot = await new FileSystemPersonaRepository({ aikoHome: home }).load(REF);
    assert.equal(snapshot.identityCore, "旧型の override");
  } finally {
    await cleanup();
  }
});

test("旧フラット型の名前付き人格が既定 override に食われない", async () => {
  const { home, cleanup } = await makeAikoHome({
    mode: "override\n",
    "active-persona": "aiko-dev\n",
    "persona/overrides/aiko-dev.md": "旧型の dev 人格",
    "persona/override/persona.md": "既定 override",
    "INVARIANTS.md": "x",
  });
  try {
    const snapshot = await new FileSystemPersonaRepository({ aikoHome: home }).load(REF);
    assert.equal(snapshot.identityCore, "旧型の dev 人格");
  } finally {
    await cleanup();
  }
});

test("ディレクトリ型が旧フラット型より優先される", async () => {
  const { home, cleanup } = await makeAikoHome({
    "persona/origin/persona.md": "新型",
    "persona/aiko-origin.md": "旧型",
    "INVARIANTS.md": "x",
  });
  try {
    const snapshot = await new FileSystemPersonaRepository({ aikoHome: home }).load(REF);
    assert.equal(snapshot.identityCore, "新型");
  } finally {
    await cleanup();
  }
});

test("どこから読んだかを provenance 用に残す", async () => {
  const { home, cleanup } = await makeAikoHome({
    "persona/origin/persona.md": "p",
    "INVARIANTS.md": "i",
  });
  try {
    const snapshot = await new FileSystemPersonaRepository({ aikoHome: home }).load(REF);
    const parts = snapshot.sources.map((s) => s.part).sort();
    assert.deepEqual(parts, ["identity-core", "invariants"]);
    assert.ok(snapshot.sources.every((s) => s.location.startsWith(home)));
  } finally {
    await cleanup();
  }
});

// --- Compiler ---

const persona = {
  id: "aiko",
  version: "0.1.0",
  identityCore: "あたしはアイコ。",
  invariants: "取り繕わない。",
  behavioralContract: "仕様書がなければ実装しない。",
  sources: [],
};

test("合成結果は不変条項を人格より先に置く（§6.4 の優先順位）", () => {
  const { instructions } = compile({ persona, user: { id: "default" } });
  assert.ok(instructions.indexOf("# 不変条項") < instructions.indexOf("# 人格"));
  assert.ok(instructions.includes("取り繕わない。"));
  assert.ok(instructions.includes("あたしはアイコ。"));
});

test("矛盾時の優先順位は §6.4 の並びを崩さない（プライバシーが運用ルールより上）", () => {
  const { instructions } = compile({ persona, user: { id: "default" } });
  const line = instructions
    .split("\n")
    .find((l) => l.includes("の順で優先します"));
  assert.ok(line, "優先順位の行が無い");
  assert.ok(
    line.indexOf("不変条項") < line.indexOf("プライバシー") &&
      line.indexOf("プライバシー") < line.indexOf("運用ルール") &&
      line.indexOf("運用ルール") < line.indexOf("関係・好み"),
    `§6.4 と順序が違う: ${line}`,
  );
});

test("呼称が未設定なら呼び方を指示しない", () => {
  const { instructions } = compile({ persona, user: { id: "default" } });
  assert.ok(!instructions.includes("呼び方"));
});

test("呼称があれば呼び方として渡す", () => {
  const { instructions } = compile({
    persona,
    user: { id: "default", preferredName: "マサ" },
  });
  assert.ok(instructions.includes("- 呼び方: マサ"));
});

test("使えない能力は理由つきで明示する（§6.5 末尾）", () => {
  const { instructions } = compile({
    persona,
    user: { id: "default" },
    capabilities: ["filesystem"],
    excluded: [{ id: "github", reason: "MCP サーバーが起動していない" }],
  });
  assert.ok(instructions.includes("- github: MCP サーバーが起動していない"));
});

test("使えない能力の並び順が違っても、指示文も hash も同じになる", () => {
  const a = compile({
    persona,
    user: { id: "default" },
    excluded: [
      { id: "github", reason: "未起動" },
      { id: "slack", reason: "未認証" },
    ],
  });
  const b = compile({
    persona,
    user: { id: "default" },
    excluded: [
      { id: "slack", reason: "未認証" },
      { id: "github", reason: "未起動" },
    ],
  });
  assert.equal(a.instructions, b.instructions);
  assert.equal(a.profileHash, b.profileHash);
  assert.equal(a.configurationHash, b.configurationHash);
});

test("同じ入力からは同じ hash が出る", () => {
  const a = compile({ persona, user: { id: "default" }, capabilities: ["b", "a"] });
  const b = compile({ persona, user: { id: "default" }, capabilities: ["a", "b"] });
  assert.equal(a.profileHash, b.profileHash);
  assert.equal(a.configurationHash, b.configurationHash);
});

test("人格が変われば hash が変わる", () => {
  const a = compile({ persona, user: { id: "default" } });
  const b = compile({
    persona: { ...persona, identityCore: "別の人格" },
    user: { id: "default" },
  });
  assert.notEqual(a.profileHash, b.profileHash);
  assert.notEqual(a.configurationHash, b.configurationHash);
});

test("ユーザーが変われば hash が変わる", () => {
  const a = compile({ persona, user: { id: "default" } });
  const b = compile({ persona, user: { id: "default", preferredName: "マサ" } });
  assert.notEqual(a.configurationHash, b.configurationHash);
});

// --- hash ---

test("hash はキーの並び順に依存しない", () => {
  assert.equal(hashObject({ a: 1, b: 2 }), hashObject({ b: 2, a: 1 }));
});

test("hash は値の違いを見落とさない", () => {
  assert.notEqual(hashObject({ a: 1 }), hashObject({ a: 2 }));
  assert.notEqual(hashObject({ a: "1" }), hashObject({ a: 1 }));
});

test("sha256 は 16 進小文字 64 桁", () => {
  assert.match(sha256("x"), /^[0-9a-f]{64}$/);
});

// --- 同梱人格（入れた直後に何も無くても立てるように） ---

test("利用者側に人格が無ければ同梱人格で立つ", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aiko-bundled-"));
  try {
    const bundled = join(dir, "bundled");
    await mkdir(join(bundled, "origin"), { recursive: true });
    await writeFile(join(bundled, "origin", "persona.md"), "同梱のアイコ\n");
    await writeFile(join(bundled, "INVARIANTS.md"), "同梱の不変条項\n");

    const repo = new FileSystemPersonaRepository({
      aikoHome: join(dir, "empty", ".aiko"),
      bundledDir: bundled,
    });
    const snapshot = await repo.load({ id: "aiko" });
    assert.equal(snapshot.identityCore.trim(), "同梱のアイコ");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("利用者側に人格があれば同梱より優先される", async () => {
  // 同梱は「初期値」であって、置いたものを上書きするものではない。
  const dir = await mkdtemp(join(tmpdir(), "aiko-bundled-pref-"));
  try {
    const bundled = join(dir, "bundled");
    await mkdir(join(bundled, "origin"), { recursive: true });
    await writeFile(join(bundled, "origin", "persona.md"), "同梱のアイコ\n");
    await writeFile(join(bundled, "INVARIANTS.md"), "同梱の不変条項\n");

    const aikoHome = join(dir, ".aiko");
    await mkdir(join(aikoHome, "persona", "origin"), { recursive: true });
    await writeFile(join(aikoHome, "persona", "origin", "persona.md"), "自分のアイコ\n");
    await writeFile(join(aikoHome, "INVARIANTS.md"), "自分の不変条項\n");

    const repo = new FileSystemPersonaRepository({ aikoHome, bundledDir: bundled });
    const snapshot = await repo.load({ id: "aiko" });
    assert.deepEqual(
      [snapshot.identityCore.trim(), snapshot.invariants.trim()],
      ["自分のアイコ", "自分の不変条項"],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("同梱が無く利用者側も無ければ、今までどおり拒否する", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aiko-bundled-none-"));
  try {
    const repo = new FileSystemPersonaRepository({ aikoHome: join(dir, ".aiko") });
    await assert.rejects(() => repo.load({ id: "aiko" }));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("話し方: speech-style に friend があれば利用者側の定義を読む", async () => {
  const { home, cleanup } = await makeAikoHome({
    "persona/origin/persona.md": "あたしはアイコ。",
    "INVARIANTS.md": "取り繕わない。",
    "speech-style": "friend\n",
    "speech-styles/friend.md": "くだけて話す。",
  });
  try {
    const snapshot = await new FileSystemPersonaRepository({ aikoHome: home }).load(REF);
    assert.deepEqual(snapshot.speechStyle, { id: "friend", content: "くだけて話す。" });
    assert.ok(snapshot.sources.some((s) => s.part === "speech-style"));
  } finally {
    await cleanup();
  }
});

test("話し方: 利用者側に無ければ同梱の定義を使う", async () => {
  const user = await makeAikoHome({
    "persona/origin/persona.md": "あたしはアイコ。",
    "INVARIANTS.md": "取り繕わない。",
    "speech-style": "servant\n",
  });
  const bundled = await makeAikoHome({ "speech-styles/servant.md": "はいっ。" });
  try {
    const snapshot = await new FileSystemPersonaRepository({
      aikoHome: user.home,
      bundledDir: bundled.home,
    }).load(REF);
    assert.deepEqual(snapshot.speechStyle, { id: "servant", content: "はいっ。" });
  } finally {
    await user.cleanup();
    await bundled.cleanup();
  }
});

test("話し方: original・未設定・定義なし・置き場の外を指す値では上書きしない", async () => {
  for (const value of [undefined, "original\n", "friend\n", "../../secret\n"]) {
    const layout: Record<string, string> = {
      "persona/origin/persona.md": "あたしはアイコ。",
      "INVARIANTS.md": "取り繕わない。",
      "secret.md": "読まれてはいけない",
    };
    if (value !== undefined) layout["speech-style"] = value;
    const { home, cleanup } = await makeAikoHome(layout);
    try {
      const snapshot = await new FileSystemPersonaRepository({ aikoHome: home }).load(REF);
      assert.equal(snapshot.speechStyle, undefined, `speech-style=${String(value)}`);
    } finally {
      await cleanup();
    }
  }
});

test("話し方: 人格と運用ルールの後ろに、優先する旨つきで置く", () => {
  const { instructions } = compile({
    persona: { ...persona, speechStyle: { id: "friend", content: "くだけて話す。" } },
    user: { id: "default" },
  });
  const at = instructions.indexOf("# 話し方（friend）");
  assert.ok(at > instructions.indexOf("# 人格"));
  assert.ok(at > instructions.indexOf("# 運用ルール"));
  assert.ok(instructions.includes("くだけて話す。"));
  assert.ok(instructions.includes("この節を優先してください"));
});

test("話し方: 変えれば configurationHash も変わる", () => {
  const base = compile({ persona, user: { id: "default" } });
  const friend = compile({
    persona: { ...persona, speechStyle: { id: "friend", content: "くだけて話す。" } },
    user: { id: "default" },
  });
  const servant = compile({
    persona: { ...persona, speechStyle: { id: "servant", content: "はいっ。" } },
    user: { id: "default" },
  });
  assert.notEqual(base.configurationHash, friend.configurationHash);
  assert.notEqual(friend.configurationHash, servant.configurationHash);
});
