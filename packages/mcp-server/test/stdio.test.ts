// stdio の実バイナリを起動して MCP の往復をさせる。設計書 §7.1。
//
// InMemoryTransport のテストはサーバーの中身を確かめるもので、実際に
// `node dist/server.js` として起動したときに動くかは別の話。stdout に人間向けの
// 文字列が混ざるだけでフレームが壊れるが、それは InMemory では絶対に出ない。

import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
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
      "aiko.evaluate_action",
      "aiko.get_runtime_profile",
      "aiko.health",
      "aiko.remember_user",
      "aiko.report_capabilities",
      "aiko.validate_response",
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
