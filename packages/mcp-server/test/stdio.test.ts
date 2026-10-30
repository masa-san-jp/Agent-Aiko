// stdio の実バイナリを起動して MCP の往復をさせる。設計書 §7.1。
//
// InMemoryTransport のテストはサーバーの中身を確かめるもので、実際に
// `node dist/server.js` として起動したときに動くかは別の話。stdout に人間向けの
// 文字列が混ざるだけでフレームが壊れるが、それは InMemory では絶対に出ない。

import { test } from "node:test";
import { acceptSpeechStyleProposal, acceptUserProposal } from "@agent-aiko/runtime-sdk";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, mkdir, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const serverEntry = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "server.js");

test("実バイナリを stdio で起動して人格を読める", async () => {
  const home = await mkdtemp(join(tmpdir(), "aiko-mcp-stdio-"));
  await mkdir(join(home, "persona", "origin"), { recursive: true });
  await writeFile(join(home, "persona", "origin", "persona.md"), "あたしはアイコ。", "utf8");
  await writeFile(join(home, "INVARIANTS.md"), "取り繕わない。", "utf8");

  const client = new Client({ name: "stdio-test", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    env: { ...process.env, AIKO_HOME: home } as Record<string, string>,
  });

  try {
    await client.connect(transport);

    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      "aiko.bind_runtime",
      "aiko.delete_persona",
      "aiko.get_runtime_profile",
      "aiko.health",
      "aiko.list_personas",
      "aiko.list_speech_styles",
      "aiko.remember_user",
      "aiko.report_capabilities",
      "aiko.save_persona",
      "aiko.switch_persona",
      "aiko.switch_speech_style",
    ]);


    const health = await client.callTool({ name: "aiko.health", arguments: {} });
    const content = (health as { content: Array<{ text: string }> }).content;
    const body = JSON.parse(String(content[0]?.text)) as Record<string, unknown>;
    assert.equal(body["status"], "ok");

    const core = await client.readResource({ uri: "persona://aiko/core" });
    const first = core.contents[0] as { text?: unknown } | undefined;
    assert.equal(first?.text, "あたしはアイコ。");
  } finally {
    await client.close();
    await rm(home, { recursive: true, force: true });
  }
});

test("実バイナリ: 話し方を切り替えると、同梱の定義が人格に重なり、名乗りは Aiko のまま", async () => {
  const home = await mkdtemp(join(tmpdir(), "aiko-mcp-stdio-"));
  await mkdir(join(home, "persona", "origin"), { recursive: true });
  await writeFile(join(home, "persona", "origin", "persona.md"), "あたしはアイコ。", "utf8");
  await writeFile(join(home, "INVARIANTS.md"), "取り繕わない。", "utf8");

  const client = new Client({ name: "stdio-test", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    env: { ...process.env, AIKO_HOME: home } as Record<string, string>,
  });
  const activate = async () => {
    const prompt = await client.getPrompt({ name: "aiko.activate" });
    return (prompt.messages[0]?.content as { text: string }).text;
  };

  try {
    await client.connect(transport);

    const original = await activate();
    assert.equal(original.includes("# 話し方"), false);
    assert.match(original, /「Aiko: 」/);

    for (const style of ["friend", "servant"]) {
      const switched = await client.callTool({
        name: "aiko.switch_speech_style",
        arguments: { name: style },
      });
      assert.equal(switched.isError, undefined);
      const proposal = JSON.parse(String((switched as { content: Array<{ text: string }> }).content[0]?.text));
      assert.equal(proposal.applied, false);
      assert.equal(proposal.next, "aiko accept");
      const before = await activate();
      assert.equal(before.includes(`# 話し方（${style}）`), false);
      assert.equal(await acceptSpeechStyleProposal(home), style);
      const text = await activate();
      assert.match(text, new RegExp(`# 話し方（${style}）`));
      // 同梱の定義本文まで入っている（見出しだけで中身が空、を通さない）。
      assert.match(text, new RegExp(`# 話し方：${style}`));
      assert.match(text, /「Aiko: 」/);
    }

    const health = await client.callTool({ name: "aiko.health", arguments: {} });
    const body = JSON.parse(
      String((health as { content: Array<{ text: string }> }).content[0]?.text),
    ) as Record<string, unknown>;
    assert.equal(body["speechStyle"], "servant");

    const rejected = await client.callTool({
      name: "aiko.switch_speech_style",
      arguments: { name: "maid" },
    });
    assert.equal(rejected.isError, true);
  } finally {
    await client.close();
    await rm(home, { recursive: true, force: true });
  }
});


test("初回の呼び名は提案を承認し、MCP を再起動すると反映される", async () => {
  const home = await mkdtemp(join(tmpdir(), "aiko-first-user-"));
  await mkdir(join(home, "persona", "origin"), { recursive: true });
  await writeFile(join(home, "persona", "origin", "persona.md"), "あたしはアイコ。", "utf8");
  const client = new Client({ name: "first-user-test", version: "0.0.0" });
  const restarted = new Client({ name: "first-user-restarted", version: "0.0.0" });
  const connect = (target: Client) => target.connect(new StdioClientTransport({
    command: process.execPath, args: [serverEntry],
    env: { ...process.env, AIKO_HOME: home } as Record<string, string>,
  }));
  try {
    await connect(client);
    const initial = await client.getPrompt({ name: "aiko.activate" });
    assert.ok(initial.messages.length);
    const proposal = await client.callTool({ name: "aiko.remember_user", arguments: { address: "TEST_NICKNAME" } });
    assert.equal(JSON.parse(String((proposal.content as Array<{ text: string }>)[0]?.text)).applied, false);
    await assert.rejects(access(join(home, "user.md")));
    assert.equal(await acceptUserProposal(home), true);
    await client.close();
    await connect(restarted);
    const afterRestart = await restarted.getPrompt({ name: "aiko.activate" });
    assert.equal(JSON.stringify(afterRestart).includes("TEST_NICKNAME"), true);
  } finally {
    await client.close();
    await restarted.close();
    await rm(home, { recursive: true, force: true });
  }
});
