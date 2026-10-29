import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { acceptPersonaProposals, acceptUserProposal } from "@agent-aiko/runtime-sdk";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const entry = join(packageDir, "dist", "server.js");
const commonFiles = [
  "dist/server.js", "dist/index.js", "package.json", "persona/origin/persona.md",
  "persona/INVARIANTS.md", "persona/speech-styles/friend.md", "persona/speech-styles/servant.md",
];

async function packageHashes(): Promise<string[]> {
  return Promise.all(commonFiles.map(async (path) =>
    createHash("sha256").update(await readFile(join(packageDir, path))).digest("hex"),
  ));
}

async function connect(home: string): Promise<Client> {
  const client = new Client({ name: "user-isolation-fixture", version: "1" });
  const env: Record<string, string> = { HOME: home, AIKO_HOME: home };
  if (process.env["PATH"]) env["PATH"] = process.env["PATH"];
  if (process.env["SystemRoot"]) env["SystemRoot"] = process.env["SystemRoot"];
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry], env }));
  return client;
}

async function activation(client: Client): Promise<string> {
  const prompt = await client.getPrompt({ name: "aiko.activate" });
  return String((prompt.messages[0]?.content as { text?: string } | undefined)?.text ?? "");
}

test("one user's changes do not alter another user's settings or the bundled persona", async () => {
  const root = await mkdtemp(join(tmpdir(), "aiko-user-isolation-"));
  const firstHome = join(root, "first");
  const secondHome = join(root, "second");
  await Promise.all([mkdir(firstHome), mkdir(secondHome)]);
  await writeFile(join(firstHome, "user.md"), "address: FIXTURE_FIRST\n");
  await writeFile(join(secondHome, "user.md"), "address: FIXTURE_SECOND\n");
  const before = await packageHashes();
  const clients: Client[] = [];
  try {
    const first = await connect(firstHome);
    clients.push(first);
    const second = await connect(secondHome);
    clients.push(second);
    assert.match(await activation(first), /FIXTURE_FIRST/);
    assert.match(await activation(second), /FIXTURE_SECOND/);

    const userProposal = await first.callTool({ name: "aiko.remember_user", arguments: { address: "FIXTURE_FIRST_UPDATED" } });
    const personaProposal = await first.callTool({ name: "aiko.save_persona", arguments: { name: "fixture", content: "FIXTURE_CUSTOM_PERSONA" } });
    assert.notEqual(userProposal.isError, true);
    assert.notEqual(personaProposal.isError, true);
    assert.equal(await acceptUserProposal(firstHome), true);
    assert.deepEqual((await acceptPersonaProposals(firstHome)).saved, ["fixture"]);

    assert.equal(await readFile(join(secondHome, "user.md"), "utf8"), "address: FIXTURE_SECOND\n");
    assert.deepEqual(await readdir(secondHome), ["user.md"]);
    const secondPrompt = await activation(second);
    assert.match(secondPrompt, /FIXTURE_SECOND/);
    assert.doesNotMatch(secondPrompt, /FIXTURE_FIRST_UPDATED|FIXTURE_CUSTOM_PERSONA/);
    assert.deepEqual(await packageHashes(), before);

    const restarted = await connect(firstHome);
    clients.push(restarted);
    assert.match(await activation(restarted), /FIXTURE_FIRST_UPDATED/);
  } finally {
    await Promise.all(clients.map((client) => client.close()));
    await rm(root, { recursive: true, force: true });
  }
});
