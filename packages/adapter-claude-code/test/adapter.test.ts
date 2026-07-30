// Claude Code Adapter のテスト。
//
// claude 本体は起動しない。起動すると課金が発生し、CI では再現もできない。
// 代わりに「どう起動しようとしたか」を検証する — 引数、書き出したファイルの
// 中身と権限、そして合成できないときに引数を作らないこと。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PersonaResolutionError, type PersonaRepository } from "@agent-aiko/core";
import { prepareLaunch, AdapterError } from "../src/adapter.js";

const persona = {
  id: "aiko",
  version: "0.1.0",
  identityCore: "あたしはアイコ。",
  invariants: "取り繕わない。",
  behavioralContract: "仕様書がなければ実装しない。",
  sources: [],
};

const repo = (override?: Partial<typeof persona>): PersonaRepository => ({
  load: async () => ({ ...persona, ...override }),
});

const failingRepo: PersonaRepository = {
  load: async () => {
    throw new PersonaResolutionError("人格の identity-core を解決できませんでした", {
      ref: { id: "aiko" },
    });
  },
};

const user = {
  context: { id: "default", preferredName: "マサ" },
  privacy: { allowRemotePersonaService: false, allowUsageTelemetry: false },
};

async function withStateDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "aiko-adapter-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("実測済みの手段で system 級に注入する引数を作る（§8.5）", async () => {
  await withStateDir(async (stateDir) => {
    const prepared = await prepareLaunch({ personaRepository: repo(), user, stateDir });
    assert.equal(prepared.args[0], "--system-prompt-file");
    assert.equal(prepared.args[1], prepared.instructionsPath);
    assert.equal(prepared.args.length, 2);
  });
});

test("append を選ぶと --append-system-prompt-file になる", async () => {
  await withStateDir(async (stateDir) => {
    const prepared = await prepareLaunch({
      personaRepository: repo(),
      user,
      stateDir,
      mode: "append",
    });
    assert.equal(prepared.args[0], "--append-system-prompt-file");
    assert.equal(prepared.profile.runtime.injection_method, "claude-code:append-system-prompt-file");
  });
});

test("CLAUDE.md に触らない（§8.1）", async () => {
  await withStateDir(async (stateDir) => {
    const prepared = await prepareLaunch({ personaRepository: repo(), user, stateDir });
    // 引数にもパスにも CLAUDE.md が出てこないこと
    assert.ok(!prepared.args.some((a) => a.includes("CLAUDE.md")));
    assert.ok(!prepared.instructionsPath.includes("CLAUDE.md"));
  });
});

test("書き出した指示文に不変条項と人格が入っている", async () => {
  await withStateDir(async (stateDir) => {
    const prepared = await prepareLaunch({ personaRepository: repo(), user, stateDir });
    const written = await readFile(prepared.instructionsPath, "utf8");
    assert.ok(written.includes("取り繕わない。"));
    assert.ok(written.includes("あたしはアイコ。"));
    assert.ok(written.includes("- 呼び方: マサ"));
    assert.equal(written, prepared.profile.instructions);
  });
});

test("指示文は他ユーザーから読めない権限で書く（§11.3）", async () => {
  await withStateDir(async (stateDir) => {
    const prepared = await prepareLaunch({ personaRepository: repo(), user, stateDir });
    const info = await stat(prepared.instructionsPath);
    // 下位6ビットが立っていない＝所有者以外は読めない
    assert.equal(info.mode & 0o077, 0, `mode=${(info.mode & 0o777).toString(8)}`);
  });
});

test("人格を解決できなければ起動用の引数を作らない（§3.4）", async () => {
  await withStateDir(async (stateDir) => {
    await assert.rejects(
      () => prepareLaunch({ personaRepository: failingRepo, user, stateDir }),
      (err: unknown) => {
        assert.ok(err instanceof AdapterError);
        assert.equal(err.detail.stage, "binding");
        assert.match(err.message, /起動しません/);
        return true;
      },
    );
  });
});

test("不変条項が空でも起動用の引数を作らない（§6.5）", async () => {
  await withStateDir(async (stateDir) => {
    await assert.rejects(
      () => prepareLaunch({ personaRepository: repo({ invariants: "  " }), user, stateDir }),
      AdapterError,
    );
  });
});

test("同じ人格からは同じ profile_id のファイルに落ちる", async () => {
  await withStateDir(async (stateDir) => {
    const a = await prepareLaunch({ personaRepository: repo(), user, stateDir });
    const b = await prepareLaunch({ personaRepository: repo(), user, stateDir });
    assert.equal(a.instructionsPath, b.instructionsPath);
    assert.equal(a.profile.profile_hash, b.profile.profile_hash);
  });
});

test("人格が変われば別のファイルになる", async () => {
  await withStateDir(async (stateDir) => {
    const a = await prepareLaunch({ personaRepository: repo(), user, stateDir });
    const b = await prepareLaunch({
      personaRepository: repo({ identityCore: "別の人格" }),
      user,
      stateDir,
    });
    assert.notEqual(a.instructionsPath, b.instructionsPath);
  });
});

test("使えない能力は指示文に理由つきで載る", async () => {
  await withStateDir(async (stateDir) => {
    const prepared = await prepareLaunch({
      personaRepository: repo(),
      user,
      stateDir,
      capabilityManifest: {
        schema_version: 1,
        runtime_id: "claude-code",
        built_in_tools: [{ id: "filesystem" }],
        mcp_servers: [{ id: "github", availability: "unavailable" }],
      },
    });
    const written = await readFile(prepared.instructionsPath, "utf8");
    assert.ok(written.includes("- filesystem"));
    assert.match(written, /github: MCP サーバーが利用できません/);
  });
});
