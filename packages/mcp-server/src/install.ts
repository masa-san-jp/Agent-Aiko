// `aiko-mcp install` の中身。
//
// 導入で詰まるのは「自分の使っているクライアントの設定がどこにあるか」を
// 利用者が知らないところ。置き場と書式はこちらが知っているので、こちらが書く。
//
// 触っていいものの線引きは1つだけ——**入っていないものには触らない**。
// 設定を書く場所があるということは、そのクライアントが一度は起動した、ということ。
// 置き場が無いのに作ると、使っていないアプリの設定を勝手に生やすことになる。

import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** MCP 設定に書き込む1件。ここを変えたら README の手書き手順も合わせる。 */
const SERVER_KEY = "aiko";
const ENTRY = { command: "npx", args: ["-y", "aiko-mcp"] };

export interface InstallIO {
  out: (text: string) => void;
  err: (text: string) => void;
}

export interface InstallDeps {
  home: string;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  /** そのコマンドが PATH にあるか。 */
  lookPath: (command: string) => Promise<boolean>;
  /** クライアント付属のコマンドを実行する。 */
  run: (command: string, args: readonly string[]) => Promise<{ code: number; stderr: string }>;
  now: () => Date;
  io: InstallIO;
}

interface CliTarget {
  id: string;
  label: string;
  kind: "cli";
  command: string;
  args: readonly string[];
  verify: string;
}

interface FileTarget {
  id: string;
  label: string;
  kind: "file";
  /** ここが無ければ「入っていない」と見なす。 */
  dir: string;
  path: string;
  verify: string;
}

type Target = CliTarget | FileTarget;

const USAGE = `使い方: npx aiko-mcp install [オプション]

入っている AI クライアントを探して、aiko の MCP 設定を書き込みます。
入っていないクライアントには何もしません。

  --dry-run             何を書くかだけ表示して、実際には書かない
  --client <id>         対象を絞る（カンマ区切り・複数回指定可）
  --force               同じ名前で違う設定が入っていても置き換える
  --help                この使い方を表示する

対象にできるクライアント:
  claude           Claude Code（claude mcp add）
  codex            Codex CLI（codex mcp add）
  vscode           VS Code（code --add-mcp）
  cursor           Cursor（~/.cursor/mcp.json）
  claude-desktop   Claude Desktop（claude_desktop_config.json）

終了コード:
  0   1つ以上に入った、またはすでに入っていた
  1   入っているクライアントが無い、または書き込みに失敗した
  2   オプションの指定が違う
`;

/** Claude Desktop の設定の置き場。OS ごとに違う。 */
function claudeDesktopDir(deps: InstallDeps): string | undefined {
  if (deps.platform === "darwin") {
    return join(deps.home, "Library", "Application Support", "Claude");
  }
  if (deps.platform === "win32") {
    const appData = deps.env["APPDATA"];
    return appData ? join(appData, "Claude") : undefined;
  }
  return join(deps.home, ".config", "Claude");
}

function targets(deps: InstallDeps): Target[] {
  const list: Target[] = [
    {
      id: "claude",
      label: "Claude Code",
      kind: "cli",
      command: "claude",
      // -s user を付けるのは、プロジェクトごとに入れ直さなくて済むようにするため。
      args: ["mcp", "add", SERVER_KEY, "-s", "user", "--", ENTRY.command, ...ENTRY.args],
      verify: "claude mcp list",
    },
    {
      id: "codex",
      label: "Codex CLI",
      kind: "cli",
      command: "codex",
      args: ["mcp", "add", SERVER_KEY, "--", ENTRY.command, ...ENTRY.args],
      verify: "codex mcp list",
    },
    {
      id: "vscode",
      label: "VS Code",
      kind: "cli",
      command: "code",
      args: ["--add-mcp", JSON.stringify({ name: SERVER_KEY, ...ENTRY })],
      verify: "VS Code を開き直して MCP の一覧を見る",
    },
    {
      id: "cursor",
      label: "Cursor",
      kind: "file",
      dir: join(deps.home, ".cursor"),
      path: join(deps.home, ".cursor", "mcp.json"),
      verify: "Cursor を開き直して Settings › MCP を見る",
    },
  ];

  const desktop = claudeDesktopDir(deps);
  if (desktop) {
    list.push({
      id: "claude-desktop",
      label: "Claude Desktop",
      kind: "file",
      dir: desktop,
      path: join(desktop, "claude_desktop_config.json"),
      verify: "Claude Desktop を開き直して設定 › コネクタを見る",
    });
  }
  return list;
}

async function isPresent(target: Target, deps: InstallDeps): Promise<boolean> {
  return target.kind === "cli" ? deps.lookPath(target.command) : existsSync(target.dir);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 中身で比べる。JSON の文字列にして比べると、キーの並び順が違うだけで別物になる。 */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => sameValue(item, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length && keys.every((key) => sameValue(a[key], b[key]))
    );
  }
  return false;
}

interface Outcome {
  target: Target;
  state: "added" | "already" | "conflict" | "failed";
  detail?: string;
}

/** JSON 設定に1件足す。既にあるものは残す。 */
async function writeFileTarget(
  target: FileTarget,
  deps: InstallDeps,
  options: { force: boolean; dryRun: boolean },
): Promise<Outcome> {
  const existed = existsSync(target.path);
  let config: Record<string, unknown> = {};
  if (existed) {
    const raw = await readFile(target.path, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      // 読めないものを書き直すと、利用者が手で書いた設定を丸ごと消すことになる。
      return {
        target,
        state: "failed",
        detail: `設定を読めませんでした（${err instanceof Error ? err.message : String(err)}）。手で直すまで触りません: ${target.path}`,
      };
    }
    // JSON として読めても、形が想定と違えば同じこと。配列や文字列を
    // オブジェクトとして扱うと、書き戻したときに元の中身が消える。
    if (!isPlainObject(parsed) || (parsed["mcpServers"] !== undefined && !isPlainObject(parsed["mcpServers"]))) {
      return {
        target,
        state: "failed",
        detail: `設定の形が想定と違います。手で直すまで触りません: ${target.path}`,
      };
    }
    config = parsed;
  }

  const servers = (config["mcpServers"] ?? {}) as Record<string, unknown>;
  const current = servers[SERVER_KEY];
  if (current !== undefined) {
    if (sameValue(current, ENTRY)) {
      return { target, state: "already", detail: target.path };
    }
    if (!options.force) {
      return {
        target,
        state: "conflict",
        detail: `${target.path} に別の ${SERVER_KEY} が入っています。置き換えるなら --force`,
      };
    }
  }

  if (options.dryRun) return { target, state: "added", detail: target.path };

  // 書き換える前に控えを取る。戻したくなったとき、利用者の手元にあるのはこれだけ。
  if (existed) {
    const stamp = deps.now().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
    await writeFile(`${target.path}.aiko-bak-${stamp}`, await readFile(target.path, "utf8"), "utf8");
  }

  const next = { ...config, mcpServers: { ...servers, [SERVER_KEY]: ENTRY } };
  // 同じディレクトリに書いてから差し替える。途中で落ちても半分書けた設定は残らない。
  await mkdir(target.dir, { recursive: true });
  const tmp = `${target.path}.aiko-tmp`;
  await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await rename(tmp, target.path);
  return { target, state: "added", detail: target.path };
}

async function runCliTarget(
  target: CliTarget,
  deps: InstallDeps,
  options: { dryRun: boolean },
): Promise<Outcome> {
  if (options.dryRun) {
    return { target, state: "added", detail: `${target.command} ${target.args.join(" ")}` };
  }
  const result = await deps.run(target.command, target.args);
  if (result.code === 0) return { target, state: "added", detail: target.verify };
  // クライアント側の言い分をこちらで言い換えない（「すでに入っています」なのか
  // 「権限がありません」なのかは、向こうのほうが正確に知っている）。
  return { target, state: "failed", detail: result.stderr.trim() || `終了コード ${result.code}` };
}

export async function runInstall(argv: readonly string[], deps: InstallDeps): Promise<number> {
  const { io } = deps;
  let dryRun = false;
  let force = false;
  const only: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      io.out(USAGE);
      return 0;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--force") {
      force = true;
    } else if (arg === "--client") {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) {
        io.err("--client にはクライアント名が要ります\n");
        return 2;
      }
      only.push(...value.split(",").filter(Boolean));
      i += 1;
    } else {
      io.err(`知らないオプションです: ${String(arg)}\n\n${USAGE}`);
      return 2;
    }
  }

  const all = targets(deps);
  const known = new Set(all.map((t) => t.id));
  const unknown = only.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    io.err(`知らないクライアントです: ${unknown.join(", ")}\n\n${USAGE}`);
    return 2;
  }

  const wanted = only.length > 0 ? all.filter((t) => only.includes(t.id)) : all;
  const present: Target[] = [];
  for (const target of wanted) {
    if (await isPresent(target, deps)) present.push(target);
  }

  if (present.length === 0) {
    io.err("設定を書けるクライアントが見つかりませんでした。\n");
    io.err("手で入れるなら、使っているクライアントの MCP 設定にこれを足してください:\n");
    io.err(`  ${SERVER_KEY}: ${ENTRY.command} ${ENTRY.args.join(" ")}\n`);
    return 1;
  }

  io.out(dryRun ? "入れるとしたら、こうなる:\n\n" : "見つかったクライアントに入れる:\n\n");

  const outcomes: Outcome[] = [];
  for (const target of present) {
    const outcome =
      target.kind === "cli"
        ? await runCliTarget(target, deps, { dryRun })
        : await writeFileTarget(target, deps, { dryRun, force });
    outcomes.push(outcome);

    const mark = { added: dryRun ? "→" : "✓", already: "・", conflict: "✗", failed: "✗" }[
      outcome.state
    ];
    const state = { added: dryRun ? "" : "入れた", already: "すでに入っている", conflict: "", failed: "" }[
      outcome.state
    ];
    io.out(`  ${mark} ${target.label}${state ? ` — ${state}` : ""}\n`);
    if (outcome.detail) io.out(`      ${outcome.detail}\n`);
  }

  const failed = outcomes.filter((o) => o.state === "conflict" || o.state === "failed");
  for (const outcome of failed) {
    io.err(`\n${outcome.target.label}: ${outcome.detail ?? "失敗しました"}\n`);
  }

  if (!dryRun && outcomes.some((o) => o.state === "added")) {
    io.out("\nクライアントを開き直すと使えるようになる。\n");
  }
  return failed.length > 0 ? 1 : 0;
}
