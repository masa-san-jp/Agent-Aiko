// MCP の人格保存・切り替え・呼び名は提案だけ。
// 反映は aiko accept（CLI）まで起きない。会話が system 級の指示を書き換えないため。

import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PersonaRepository } from "@agent-aiko/core";
import { acceptPersonaProposals, acceptSpeechStyleProposal, acceptUserProposal, readSpeechStyle, readUserMarkdown } from "@agent-aiko/runtime-sdk";
import { createAikoServer } from "../src/aiko-server.js";

const persona = {
  id: "aiko",
  version: "0.1.0",
  identityCore: "あたしはアイコ。",
  invariants: "取り繕わない。",
  behavioralContract: "仕様書がなければ実装しない。",
  sources: [{ part: "identity-core", location: "/tmp/persona.md" }],
};

const repo: PersonaRepository = { load: async () => persona };
const user = {
  context: { id: "default", preferredName: "マサ" },
  privacy: { allowRemotePersonaService: false, allowUsageTelemetry: false },
};

function parse(result: unknown): Record<string, unknown> {
  const content = (result as { content: Array<{ type: string; text: string }> }).content;
  assert.ok(content?.[0]?.text, "テキスト内容が無い");
  return JSON.parse(content[0].text) as Record<string, unknown>;
}

test("save / switch / remember は本番の人格と user.md を書かない", async () => {
  const home = await mkdtemp(join(tmpdir(), "aiko-mcp-proposal-"));
  await mkdir(join(home, "persona", "origin"), { recursive: true });
  await writeFile(join(home, "persona", "origin", "persona.md"), "オリジナル\n");
  await writeFile(join(home, "mode"), "origin\n");

  const server = createAikoServer({ personaRepository: repo, user, aikoHome: home });
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const saved = parse(
      await client.callTool({
        name: "aiko.save_persona",
        arguments: { name: "trial", content: "会話から入れた人格。# 人格" },
      }),
    );
    assert.equal(saved["applied"], false);
    assert.equal(saved["next"], "aiko accept");

    const switched = parse(
      await client.callTool({
        name: "aiko.switch_persona",
        arguments: { name: "trial" },
      }),
    );
    assert.equal(switched["applied"], false);

    const remembered = parse(
      await client.callTool({
        name: "aiko.remember_user",
        arguments: { address: "注入された呼び名" },
      }),
    );
    assert.equal(remembered["applied"], false);

    assert.equal(existsSync(join(home, "persona", "overrides", "trial", "persona.md")), false);
    assert.equal((await readFile(join(home, "mode"), "utf8")).trim(), "origin");
    assert.equal(existsSync(join(home, "active-persona")), false);
    assert.equal(existsSync(join(home, "user.md")), false);
    assert.match(
      await readFile(join(home, "persona", "proposals", "trial", "persona.md"), "utf8"),
      /会話から入れた人格/,
    );

    const style = parse(await client.callTool({
      name: "aiko.switch_speech_style", arguments: { name: "friend" },
    }));
    assert.equal(style["proposed"], true);
    assert.equal(style["applied"], false);
    assert.equal(style["switched"], false);
    assert.equal(style["next"], "aiko accept");
    assert.equal(await readSpeechStyle(home), "original");
    assert.equal(await acceptSpeechStyleProposal(home), "friend");
    assert.equal(await readSpeechStyle(home), "friend");
    assert.equal(await acceptSpeechStyleProposal(home), undefined);
    await writeFile(join(home, "speech-style-proposal"), "../injected\n");
    await assert.rejects(acceptSpeechStyleProposal(home), /不正/);
    assert.equal(await readSpeechStyle(home), "friend");

    const accepted = await acceptPersonaProposals(home);
    assert.deepEqual(accepted.saved, ["trial"]);
    assert.equal(accepted.switched, "trial");
    assert.equal(await acceptUserProposal(home), true);
    assert.equal((await readUserMarkdown([join(home, "user.md")]))?.user.address, "注入された呼び名");
  } finally {
    await client.close();
    await server.close();
    await rm(home, { recursive: true, force: true });
  }
});
