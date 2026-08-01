// 各 Adapter を共通の契約にかける。SDK 設計書 §20.2。
//
// ここに書くのは「その Adapter をどう動かすか」だけ。**何を確かめるかは
// adapter-contract.ts が持つ。** Adapter が増えたときに確かめ忘れないようにする。

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PersonaResolutionError, type PersonaRepository } from "@agent-aiko/core";
import { prepareLaunch } from "@agent-aiko/adapter-claude-code";
import { prepareThread } from "@agent-aiko/adapter-codex";
import { runRuntimeAdapterContract } from "../src/adapter-contract.js";

const PACKAGES = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const persona = {
  id: "aiko",
  version: "0.1.0",
  identityCore: "あたしはアイコ。",
  invariants: "取り繕わない。",
  behavioralContract: "仕様書がなければ実装しない。",
  sources: [],
};

const repo: PersonaRepository = { load: async () => persona };
const brokenRepo: PersonaRepository = {
  load: async () => {
    throw new PersonaResolutionError("人格の identity-core を解決できませんでした", {
      ref: { id: "aiko" },
    });
  },
};

const user = {
  context: { id: "masa", preferredName: "マサさん" },
  privacy: { allowRemotePersonaService: false, allowUsageTelemetry: false },
};

runRuntimeAdapterContract({
  packagesDir: PACKAGES,
  probe: {
    name: "Claude Code",
    packageDir: "adapter-claude-code",
    expectedLevel: 2,
    expectedInjectionMethod: "claude-code:system-prompt-file",
    prepare: async () => {
      const dir = await mkdtemp(join(tmpdir(), "contract-claude-"));
      try {
        const r = await prepareLaunch({ personaRepository: repo, user, stateDir: dir });
        // ホストへ渡るのはファイルの中身。実際に書き出したものを読む。
        const injectedText = await readFile(r.instructionsPath, "utf8");
        return { profile: r.profile, injectedText };
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    prepareWithBrokenPersona: async () => {
      const dir = await mkdtemp(join(tmpdir(), "contract-claude-bad-"));
      try {
        return await prepareLaunch({ personaRepository: brokenRepo, user, stateDir: dir });
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  },
});

runRuntimeAdapterContract({
  packagesDir: PACKAGES,
  probe: {
    name: "Codex",
    packageDir: "adapter-codex",
    expectedLevel: 2,
    expectedInjectionMethod: "codex:base-instructions",
    prepare: async () => {
      const r = await prepareThread({ personaRepository: repo, user });
      // ホストへ渡るのは baseInstructions の文字列そのもの。
      return { profile: r.profile, injectedText: r.baseInstructions };
    },
    prepareWithBrokenPersona: () => prepareThread({ personaRepository: brokenRepo, user }),
  },
});
