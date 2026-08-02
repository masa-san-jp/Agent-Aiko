#!/usr/bin/env node
// stdio エントリ。設計書 §7.1（初期標準は stdio）。
//
// stdout は MCP のフレームが流れる経路なので、ここへ人間向けの文字列を書いては
// いけない。診断は stderr へ出す。

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FileSystemPersonaRepository } from "@agent-aiko/core";
import {
  readUserMarkdown,
  resolveUserProfilePath,
  userMarkdownCandidates,
  UserContextProvider,
} from "@agent-aiko/user-context";
import { createAikoServer, SERVER_VERSION } from "./aiko-server.js";
import { runInstall } from "./install.js";

const personaId = process.env["AIKO_PERSONA_ID"] ?? "aiko";
const aikoHome = process.env["AIKO_HOME"];
// AIKO_USER_PROFILE が無くても、aiko configure が置いた既定のファイルを拾う。
// 置き場の決め方は core に集約してある（ここで独自に組み立てると configure と食い違う）。
const userProfilePath = resolveUserProfilePath(
  aikoHome ?? join(homedir(), ".aiko"),
  process.env["AIKO_USER_PROFILE"],
  existsSync,
);
// 既定は ~/.aiko。別の場所を指せるようにしておくと、実バイナリのまま検証できる。

async function main(): Promise<void> {
  const provider = new UserContextProvider();
  // User Profile を解決できないのは §6.5 の fail-closed 条件。既定値で埋めて
  // 起動すると、誰のものか分からない関係情報で人格が立ち上がる。
  const base = userProfilePath
    ? await provider.loadFromFile(userProfilePath)
    : provider.resolve({ schema_version: 1, user_id: "default" });

  // user.md があれば重ねる。無ければ何も足さない——**呼び名を知らないまま起動する**
  // のが既定で、名前は利用者が教えたときだけ持つ。
  const home = aikoHome ?? join(homedir(), ".aiko");
  const md = await readUserMarkdown(userMarkdownCandidates(home));
  const user = md ? provider.withMarkdown(base, md.user) : base;

  const server = createAikoServer({
    // 同梱人格の場所。利用者側に何も無くても起動できるようにする（入れた直後の
    // 「人格が読めません」を無くす）。利用者が置いていればそちらが必ず優先される。
    aikoHome: home,
    personaRepository: new FileSystemPersonaRepository({
      ...(aikoHome ? { aikoHome } : {}),
      bundledDir: join(dirname(fileURLToPath(import.meta.url)), "..", "persona"),
    }),
    user,
    personaId,
  });

  await server.connect(new StdioServerTransport());
}

const USAGE = `使い方: npx aiko-mcp [コマンド]

  （引数なし）   MCP サーバーとして起動する（クライアントが呼ぶのはこれ）
  install        入っている AI クライアントに aiko の MCP 設定を書き込む
  --help         この使い方を表示する
  --version      版を表示する

install の細かい指定は npx aiko-mcp install --help
`;

/** そのコマンドが PATH にあるか。which に頼らず自分で探す（Windows も同じ経路で見る）。 */
async function lookPath(command: string): Promise<boolean> {
  const isWindows = process.platform === "win32";
  const dirs = (process.env["PATH"] ?? "").split(isWindows ? ";" : ":");
  const exts = isWindows ? (process.env["PATHEXT"] ?? ".EXE;.CMD;.BAT").split(";") : [""];
  return dirs.some((dir) => dir && exts.some((ext) => existsSync(join(dir, command + ext))));
}

function runCommand(
  command: string,
  args: readonly string[],
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    // shell は使わない。引数はこちらが組み立てた定数だけだが、shell を挟むと
    // VS Code へ渡す JSON の引用符が環境ごとに壊れる。
    execFile(command, [...args], (err, _stdout, stderr) => {
      if (!err) return resolve({ code: 0, stderr });
      const code = typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 1;
      resolve({ code, stderr: stderr || err.message });
    });
  });
}

/** MCP サーバーとして呼ばれたのか、人が叩いたのかを分ける。 */
async function cli(argv: readonly string[]): Promise<number | undefined> {
  const [command, ...rest] = argv;
  if (command === undefined) return undefined;

  if (command === "install") {
    return runInstall(rest, {
      home: homedir(),
      platform: process.platform,
      env: process.env,
      lookPath,
      run: runCommand,
      now: () => new Date(),
      io: {
        out: (text) => process.stdout.write(text),
        err: (text) => process.stderr.write(text),
      },
    });
  }
  if (command === "--help" || command === "-h" || command === "help") {
    process.stdout.write(USAGE);
    return 0;
  }
  if (command === "--version" || command === "-v") {
    process.stdout.write(`${SERVER_VERSION}\n`);
    return 0;
  }
  if (!command.startsWith("-")) {
    process.stderr.write(`知らないコマンドです: ${command}\n\n${USAGE}`);
    return 2;
  }
  // 知らないフラグは黙って無視してサーバーとして起動する。クライアントが
  // 独自の引数を足してくることがあり、そこで起動できなくなるほうが困る。
  return undefined;
}

cli(process.argv.slice(2))
  .then(async (code) => {
    if (code !== undefined) {
      process.exitCode = code;
      return;
    }
    await main();
  })
  .catch((err: unknown) => {
    process.stderr.write(
      `aiko-mcp: 起動できませんでした: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exitCode = 1;
  });
