// 実際の stdio MCP を使い、保存先の中に仕込まれたリンクを検証する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const entry = process.env["AIKO_TEST_ENTRY"] ?? join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "server.js");
const symlinkOptions = { skip: process.platform === "win32" };

test("MCP の人格削除は保存先の外へ続く親リンクをたどらない", async () => {
  const root = await mkdtemp(join(tmpdir(), "aiko-mcp-boundary-"));
  const home = join(root, "home");
  const outside = join(root, "another-user");
  const victim = join(outside, "victim");
  const client = new Client({ name: "boundary-fixture", version: "1" });
  try {
    await mkdir(join(home, "persona"), { recursive: true });
    await mkdir(victim, { recursive: true });
    await writeFile(join(victim, "persona.md"), "OUTSIDE PERSONA\n");
    await writeFile(join(victim, "keep.txt"), "OUTSIDE USER DATA\n");
    await symlink(outside, join(home, "persona", "overrides"), process.platform === "win32" ? "junction" : "dir");
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry], env: { HOME: root, AIKO_HOME: home, PATH: process.env["PATH"] ?? "" } }));
    const result = await client.callTool({ name: "aiko.delete_persona", arguments: { name: "victim" } });
    assert.equal(result.isError, true);
    assert.equal(await readFile(join(victim, "keep.txt"), "utf8"), "OUTSIDE USER DATA\n");
    assert.equal(await readFile(join(victim, "persona.md"), "utf8"), "OUTSIDE PERSONA\n");
  } finally { await client.close(); await rm(root, { recursive: true, force: true }); }
});

test("MCP の人格提案は保存先の外へ続く親リンクを書き込まない", async () => {
  const root = await mkdtemp(join(tmpdir(), "aiko-mcp-boundary-"));
  const home = join(root, "home");
  const outside = join(root, "outside");
  const client = new Client({ name: "boundary-fixture", version: "1" });
  try {
    await mkdir(join(home, "persona"), { recursive: true });
    await mkdir(outside, { recursive: true });
    await symlink(outside, join(home, "persona", "proposals"), process.platform === "win32" ? "junction" : "dir");
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry], env: { HOME: root, AIKO_HOME: home, PATH: process.env["PATH"] ?? "" } }));
    const result = await client.callTool({ name: "aiko.save_persona", arguments: { name: "victim", content: "FIXTURE" } });
    assert.equal(result.isError, true);
    assert.equal(existsSync(join(outside, "victim")), false);
  } finally { await client.close(); await rm(root, { recursive: true, force: true }); }
});

test("MCP の人格削除は同じフォルダの利用者データを残す", async () => {
  const root = await mkdtemp(join(tmpdir(), "aiko-mcp-boundary-"));
  const home = join(root, "home");
  const personaDir = join(home, "persona", "overrides", "custom");
  const client = new Client({ name: "boundary-fixture", version: "1" });
  try {
    await mkdir(personaDir, { recursive: true });
    await writeFile(join(personaDir, "persona.md"), "CUSTOM PERSONA\n");
    await writeFile(join(personaDir, "user.md"), "USER DATA\n");
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry], env: { HOME: root, AIKO_HOME: home, PATH: process.env["PATH"] ?? "" } }));
    const result = await client.callTool({ name: "aiko.delete_persona", arguments: { name: "custom" } });
    assert.notEqual(result.isError, true);
    assert.equal(existsSync(join(personaDir, "persona.md")), false);
    assert.equal(await readFile(join(personaDir, "user.md"), "utf8"), "USER DATA\n");
  } finally { await client.close(); await rm(root, { recursive: true, force: true }); }
});

test("MCP のユーザー設定は保存先外へのリンクを読まない", symlinkOptions, async () => {
  const root = await mkdtemp(join(tmpdir(), "aiko-mcp-boundary-"));
  const home = join(root, "home");
  const outside = join(root, "outside.md");
  try {
    await mkdir(home, { recursive: true });
    await writeFile(outside, "address: OUTSIDE_PRIVATE_FIXTURE\n");
    await symlink(outside, join(home, "user.md"));
    const result = spawnSync(process.execPath, [entry], { encoding: "utf8", input: "", timeout: 5000, env: { HOME: root, AIKO_HOME: home, PATH: process.env["PATH"] ?? "" } });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stderr + result.stdout, /OUTSIDE_PRIVATE_FIXTURE/);
    assert.equal(await readFile(outside, "utf8"), "address: OUTSIDE_PRIVATE_FIXTURE\n");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("MCP の呼び名の提案は保存先外へのリンクを読まず書き換えない", symlinkOptions, async () => {
  const root = await mkdtemp(join(tmpdir(), "aiko-mcp-boundary-"));
  const home = join(root, "home");
  const outside = join(root, "outside.md");
  const client = new Client({ name: "boundary-fixture", version: "1" });
  try {
    await mkdir(home, { recursive: true });
    await writeFile(outside, "呼び方: OUTSIDE_PRIVATE_FIXTURE\n");
    await symlink(outside, join(home, "user-proposal.md"));
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry], env: { HOME: root, AIKO_HOME: home, PATH: process.env["PATH"] ?? "" } }));
    const result = await client.callTool({ name: "aiko.remember_user", arguments: { name: "fixture" } });
    assert.equal(result.isError, true);
    assert.doesNotMatch(JSON.stringify(result), /OUTSIDE_PRIVATE_FIXTURE/);
    assert.equal(await readFile(outside, "utf8"), "呼び方: OUTSIDE_PRIVATE_FIXTURE\n");
  } finally { await client.close(); await rm(root, { recursive: true, force: true }); }
});

test("MCP の既定プロフィールは保存先外へのリンクを読まない", symlinkOptions, async () => {
  const root = await mkdtemp(join(tmpdir(), "aiko-mcp-boundary-"));
  const home = join(root, "home");
  const outside = join(root, "outside.json");
  try {
    await mkdir(home, { recursive: true });
    await writeFile(outside, '{"schema_version":1,"user_id":"OUTSIDE_PRIVATE_FIXTURE"}');
    await symlink(outside, join(home, "user-profile.json"));
    const result = spawnSync(process.execPath, [entry], { encoding: "utf8", input: "", timeout: 5000, env: { HOME: root, AIKO_HOME: home, PATH: process.env["PATH"] ?? "" } });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /シンボリックリンク/);
    assert.doesNotMatch(result.stderr + result.stdout, /OUTSIDE_PRIVATE_FIXTURE/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("利用者が明示した保存先外のプロフィールは引き続き使える", async () => {
  const root = await mkdtemp(join(tmpdir(), "aiko-mcp-boundary-"));
  const home = join(root, "home");
  const profile = join(root, "chosen-profile.json");
  const client = new Client({ name: "boundary-fixture", version: "1" });
  try {
    await mkdir(home, { recursive: true });
    await writeFile(profile, '{"schema_version":1,"user_id":"fixture"}');
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry], env: { HOME: root, AIKO_HOME: home, AIKO_USER_PROFILE: profile, PATH: process.env["PATH"] ?? "" } }));
    const prompts = await client.listPrompts();
    assert.ok(prompts.prompts.some((prompt) => prompt.name === "aiko.activate"));
  } finally { await client.close(); await rm(root, { recursive: true, force: true }); }
});

test("MCP の人格読み込みは保存先外へのリンクを読まない", symlinkOptions, async () => {
  const root = await mkdtemp(join(tmpdir(), "aiko-mcp-boundary-"));
  const home = join(root, "home");
  const outside = join(root, "outside.md");
  const client = new Client({ name: "boundary-fixture", version: "1" });
  try {
    await mkdir(join(home, "persona", "origin"), { recursive: true });
    await writeFile(outside, "OUTSIDE_PRIVATE_FIXTURE\n");
    await symlink(outside, join(home, "persona", "origin", "persona.md"));
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry], env: { HOME: root, AIKO_HOME: home, PATH: process.env["PATH"] ?? "" } }));
    const prompt = await client.getPrompt({ name: "aiko.activate" });
    assert.doesNotMatch(JSON.stringify(prompt), /OUTSIDE_PRIVATE_FIXTURE/);
    assert.match(JSON.stringify(prompt), /シンボリックリンク|適用でき/);
  } finally { await client.close(); await rm(root, { recursive: true, force: true }); }
});
