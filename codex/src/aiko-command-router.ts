// Aiko slash command router — `/aiko-*` コマンドを受け取り、~/.aiko/ への
// 書込・mode 切替・人格カスタマイズ・差分表示などを処理する。
//
// 設計の正本: 非公開設計メモ v0.3.1 §6.4 / §6.7

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { appendOverrideHistory } from "./aiko-history.js";
import type { AikoRuntime } from "./aiko-runtime.js";

/** スラッシュコマンドのパース結果。 */
export interface ParsedSlashCommand {
  /** `aiko-mode` `aiko-override` 等（先頭 `/` 抜き、別名は正規化されない生のまま）。 */
  name: string;
  /** スペース 1 つ以降のすべての残文字列。空なら空文字。 */
  args: string;
}

/** 入力が `/` で始まる行ならパースして返す。それ以外は null。 */
export function parseSlashCommand(line: string): ParsedSlashCommand | null {
  if (!line.startsWith("/")) return null;
  const trimmed = line.slice(1).trimEnd();
  const sp = trimmed.indexOf(" ");
  if (sp < 0) return { name: trimmed, args: "" };
  return { name: trimmed.slice(0, sp), args: trimmed.slice(sp + 1).trim() };
}

/** コマンド実行結果。 */
export interface CommandResult {
  /** REPL に表示する文字列（複数行可）。 */
  output: string;
  /**
   * 実行後に thread を再起動する必要があるか（mode 変更 / persona 編集後）。
   * shell は true なら `runtime.restartThread()` を呼ぶ。
   */
  needsRestart?: boolean;
}

export interface AikoCommandRouterOptions {
  aikoHome?: string;
  runtime: AikoRuntime;
  /**
   * /aiko-reset の確認 prompt（"y/n" 入力を受け付ける関数）。
   * 未指定時の既定は **常に false（キャンセル）** を返す。
   * /aiko-reset は破壊的操作なので、明示的に確認関数を渡さなければ実行できない設計にする。
   */
  confirm?: (message: string) => Promise<boolean>;
}

/** 既知の slash command 名（alias 含む）。 */
export const KNOWN_COMMANDS = new Set([
  "aiko-mode",
  "aiko-origin",
  "aiko-org",
  "aiko-override",
  "aiko-or",
  "aiko-reset",
  "aiko-export",
  "aiko-diff",
  "aiko-personas",
  "aiko-new",
  "aiko-select",
  "aiko-delete",
]);

export class AikoCommandRouter {
  readonly #aikoHome: string;
  readonly #runtime: AikoRuntime;
  readonly #confirm: (message: string) => Promise<boolean>;

  constructor(opts: AikoCommandRouterOptions) {
    this.#aikoHome = opts.aikoHome ?? join(homedir(), ".aiko");
    this.#runtime = opts.runtime;
    // 既定は安全側（キャンセル）。/aiko-reset を有効化したい場合は明示的に confirm を渡す
    this.#confirm = opts.confirm ?? (async () => false);
  }

  /** 既知コマンドかどうかだけを返す（shell が unknown を user input にしない判断に使用）。 */
  isKnown(name: string): boolean {
    return KNOWN_COMMANDS.has(name);
  }

  /** name + args を受けて実行する。未知コマンドは throw（呼び出し側でキャッチして表示）。 */
  async execute(name: string, args: string): Promise<CommandResult> {
    switch (name) {
      case "aiko-mode":
        return this.#cmdMode(args);
      case "aiko-origin":
      case "aiko-org":
        return this.#cmdOrigin();
      case "aiko-override":
      case "aiko-or":
        return this.#cmdOverride(args);
      case "aiko-reset":
        return this.#cmdReset(args);
      case "aiko-export":
        return this.#cmdExport(args);
      case "aiko-diff":
        return this.#cmdDiff(args);
      case "aiko-personas":
        return this.#cmdPersonas();
      case "aiko-new":
        return this.#cmdNew(args);
      case "aiko-select":
        return this.#cmdSelect(args);
      case "aiko-delete":
        return this.#cmdDelete(args);
      default:
        throw new Error(`unknown command: /${name}`);
    }
  }

  // ─────────────────────────────────────
  // 個別コマンド
  // ─────────────────────────────────────

  async #cmdMode(args: string): Promise<CommandResult> {
    const current = await this.#readCurrentMode();
    if (args.length === 0) {
      return { output: `現在のモードは ${current} です。` };
    }
    const target = args.trim();
    if (target !== "origin" && target !== "override") {
      return { output: `不正な引数: '${target}'。 origin か override を指定してください。` };
    }
    if (target === current) {
      return { output: `既に ${target} モードです。` };
    }
    await this.#writeMode(target);
    await appendOverrideHistory(
      { ts: new Date().toISOString(), action: "mode-set", instruction: target },
      this.#aikoHome
    );
    return {
      output: `モードを ${target} に切り替えました。スレッドを再起動します。`,
      needsRestart: true,
    };
  }

  async #cmdOrigin(): Promise<CommandResult> {
    const current = await this.#readCurrentMode();
    if (current === "origin") {
      return { output: "既に アイコ（オリジナル）モードです。" };
    }
    await this.#writeMode("origin");
    await appendOverrideHistory(
      { ts: new Date().toISOString(), action: "mode-set", instruction: "origin" },
      this.#aikoHome
    );
    return {
      output: "アイコ（オリジナル）に切り替えました。次回から自動で起動します。",
      needsRestart: true,
    };
  }

  async #cmdOverride(args: string): Promise<CommandResult> {
    // 引数なし（空白のみ含む）→ mode を override に切替
    const trimmedArgs = args.trim();
    if (trimmedArgs.length === 0) {
      const current = await this.#readCurrentMode();
      if (current === "override") {
        return { output: "既に アイコ（カスタマイズ）モードです。" };
      }
      await this.#writeMode("override");
      await appendOverrideHistory(
        { ts: new Date().toISOString(), action: "mode-set", instruction: "override" },
        this.#aikoHome
      );
      return {
        output: "アイコ（カスタマイズ）に切り替えました。次回から自動で起動します。",
        needsRestart: true,
      };
    }

    // 引数あり → INVARIANTS チェック → override.md 更新 → mode を override に
    const invariantsPath = await this.#invariantsPath();
    const invariants = await readFile(invariantsPath, "utf8");

    const verdict = await this.#runtime.runInvariantsCheck(invariants, trimmedArgs);
    if (verdict.violates) {
      const clauses = verdict.clauses.length > 0 ? `\n該当条項: ${verdict.clauses.join(", ")}` : "";
      return {
        output:
          `指示は INVARIANTS に違反すると判定されたため、override を更新しません。\n` +
          `理由: ${verdict.reason || "（理由未取得）"}${clauses}`,
      };
    }

    // 既存 override に指示を追記する形（spec §6.4 では明確な合成方針が無いので、
    // 「ユーザー指示」セクションを末尾に追記する保守的な実装にする）
    const overridePath = await this.#activeOverridePersonaPath();
    const existing = await readFile(overridePath, "utf8");
    const merged = mergeOverrideInstruction(existing, trimmedArgs);
    await writeFile(overridePath, merged, "utf8");

    await this.#writeMode("override");
    await appendOverrideHistory(
      {
        ts: new Date().toISOString(),
        action: "override",
        instruction: trimmedArgs,
        summary: summarizeInstruction(trimmedArgs),
      },
      this.#aikoHome
    );
    return {
      output:
        `アイコ（カスタマイズ）を更新しました。次回から自動で起動します。\n` +
        `指示: ${summarizeInstruction(trimmedArgs)}`,
      needsRestart: true,
    };
  }

  async #cmdReset(args: string): Promise<CommandResult> {
    const target = args.trim() || (await this.#readActivePersona());
    const targetPath = target
      ? await this.#namedPersonaPath(target)
      : await this.#defaultOverridePath();
    if (target && !targetPath) {
      return { output: `エラー：人格「${target}」が見つかりません。/aiko-personas で一覧を確認できます。` };
    }
    const ok = await this.#confirm(
      target
        ? `「${target}」の内容をリセットします。本当によろしいですか？(y/N)`
        : "あなたに合わせてカスタマイズした内容をリセットします。本当にお別れですか？(y/N)"
    );
    if (!ok) {
      return { output: "リセットをキャンセルしました。" };
    }
    const originPath = await this.#originPersonaPath();
    const origin = await readFile(originPath, "utf8");
    await writeFile(targetPath ?? (await this.#defaultOverridePath()), origin, "utf8");
    if (!target) await this.#writeMode("origin");
    await appendOverrideHistory(
      { ts: new Date().toISOString(), action: "reset", instruction: target },
      this.#aikoHome
    );
    return {
      output: target
        ? `リセット完了。人格「${target}」をオリジナルの内容で初期化しました。`
        : "リセット完了。アイコ（オリジナル）に戻り、次回から自動で起動します。",
      needsRestart: true,
    };
  }

  async #cmdExport(args: string): Promise<CommandResult> {
    const target = args.trim() || (await this.#readActivePersona());
    const overridePath = target
      ? await this.#namedPersonaPath(target)
      : await this.#defaultOverridePath();
    if (!overridePath) {
      return { output: `エラー：人格「${target}」が見つかりません。/aiko-personas で一覧を確認できます。` };
    }
    const originPath = await this.#originPersonaPath();
    const override = await readFile(overridePath, "utf8");
    const origin = await readFile(originPath, "utf8");
    const label = target ? `overrides/${target}/persona.md` : "aiko-override.md";
    const diff = unifiedDiff("origin/persona.md", label, origin, override);
    return {
      output: [
        `===== ${label}（全文） =====`,
        override,
        "===== origin との diff =====",
        diff || "（差分なし）",
        "",
        "===== 再現手順 =====",
        target
          ? `1. /aiko-new ${target} で人格を作成し、上記全文を ~/.aiko/persona/overrides/${target}/persona.md に貼り付ける`
          : "1. 上記全文を ~/.aiko/persona/aiko-override.md に貼り付ける",
        target ? `2. /aiko-select ${target} で切り替える` : "2. /aiko-override で override モードに切り替える",
      ].join("\n"),
    };
  }

  async #cmdDiff(args: string): Promise<CommandResult> {
    const target = args.trim() || (await this.#readActivePersona());
    const overridePath = target
      ? await this.#namedPersonaPath(target)
      : await this.#defaultOverridePath();
    if (!overridePath) {
      return { output: `エラー：人格「${target}」が見つかりません。/aiko-personas で一覧を確認できます。` };
    }
    const originPath = await this.#originPersonaPath();
    const override = await readFile(overridePath, "utf8");
    const origin = await readFile(originPath, "utf8");
    if (override === origin) {
      return { output: "アイコ（オリジナル）と指定した人格は同一です。" };
    }
    const label = target ? `overrides/${target}/persona.md` : "aiko-override.md";
    return {
      output: unifiedDiff("origin/persona.md", label, origin, override),
    };
  }

  async #cmdPersonas(): Promise<CommandResult> {
    const mode = await this.#readCurrentMode();
    const active = mode === "override" ? await this.#readActivePersona() : "";
    const names = await this.#listNamedPersonas();
    const lines = ["利用可能な人格:"];
    lines.push(`${mode === "origin" ? "★" : " "} [origin]   Aiko-origin（オリジナル、変更不可）`);
    lines.push(`${mode === "override" && !active ? "★" : " "} [override] Aiko-override（デフォルトカスタマイズ）`);
    for (const name of names) {
      lines.push(`${mode === "override" && active === name ? "★" : " "} [${name}]     overrides/${name}/persona.md`);
    }
    if (active && !names.includes(active)) {
      lines.push(`⚠ アクティブ人格ファイル overrides/${active}/persona.md が見つかりません。デフォルト override にフォールバックしています。`);
    }
    return { output: lines.join("\n") };
  }

  async #cmdNew(args: string): Promise<CommandResult> {
    const name = args.trim();
    const validation = validatePersonaName(name);
    if (validation) return { output: validation };
    if (await this.#namedPersonaPath(name)) {
      return { output: `エラー：「${name}」はすでに存在します。/aiko-select ${name} で切り替えられます。` };
    }
    const dir = join(this.#aikoHome, "persona", "overrides", name);
    await mkdir(dir, { recursive: true });
    const origin = await readFile(await this.#originPersonaPath(), "utf8");
    await writeFile(join(dir, "persona.md"), origin, "utf8");
    await writeFile(join(dir, "user.md"), "name:\naddress:\n", "utf8");
    await writeFile(join(dir, "README.md"), `# ${name}\n\n名前付き人格 ${name} のローカル設定です。\n`, "utf8");
    await this.#writeActivePersona(name);
    await this.#writeMode("override");
    await appendOverrideHistory(
      { ts: new Date().toISOString(), action: "new-persona", instruction: name, name, base: "origin" },
      this.#aikoHome
    );
    return {
      output: `人格「${name}」を作成しました（overrides/${name}/persona.md）。\n現在のプレフィックスは Aiko-${name}: です。`,
      needsRestart: true,
    };
  }

  async #cmdSelect(args: string): Promise<CommandResult> {
    const name = args.trim() || "override";
    if (name === "origin") {
      await this.#writeMode("origin");
      await this.#writeActivePersona("");
      return { output: "アイコ（オリジナル）に切り替えました。プレフィックスは Aiko-origin: です。", needsRestart: true };
    }
    if (name === "override") {
      await this.#writeMode("override");
      await this.#writeActivePersona("");
      return { output: "アイコ（カスタマイズ）に切り替えました。プレフィックスは Aiko-override: です。", needsRestart: true };
    }
    if (!(await this.#namedPersonaPath(name))) {
      return { output: `エラー：人格「${name}」が見つかりません。\n/aiko-personas で利用可能な人格を確認できます。` };
    }
    await this.#writeMode("override");
    await this.#writeActivePersona(name);
    return { output: `人格「${name}」に切り替えました。プレフィックスは Aiko-${name}: です。`, needsRestart: true };
  }

  async #cmdDelete(args: string): Promise<CommandResult> {
    const name = args.trim();
    const validation = validatePersonaName(name);
    if (validation) return { output: name ? validation : "削除する人格名を指定してください。例: /aiko-delete example" };
    const active = await this.#readActivePersona();
    if (active === name) {
      return { output: `エラー：「${name}」は現在アクティブな人格のため削除できません。\n先に /aiko-select で別の人格に切り替えてから削除してください。` };
    }
    const path = await this.#namedPersonaPath(name);
    if (!path) {
      return { output: `エラー：人格「${name}」が見つかりません。\n/aiko-personas で利用可能な人格を確認できます。` };
    }
    const ok = await this.#confirm(`「${name}」を削除します。元に戻せません。本当によろしいですか？(y/N)`);
    if (!ok) return { output: "削除をキャンセルしました。" };
    await rm(join(this.#aikoHome, "persona", "overrides", name), { recursive: true, force: true });
    await rm(join(this.#aikoHome, "persona", "overrides", `${name}.md`), { force: true });
    await appendOverrideHistory(
      { ts: new Date().toISOString(), action: "delete-persona", instruction: name, name },
      this.#aikoHome
    );
    return { output: `人格「${name}」を削除しました。` };
  }

  // ─────────────────────────────────────
  // helpers
  // ─────────────────────────────────────

  async #writeMode(mode: "origin" | "override"): Promise<void> {
    await writeFile(join(this.#aikoHome, "mode"), `${mode}\n`, "utf8");
  }

  async #readActivePersona(): Promise<string> {
    try {
      return (await readFile(join(this.#aikoHome, "active-persona"), "utf8")).trim();
    } catch (err) {
      if (isNotFound(err)) return "";
      throw err;
    }
  }

  async #writeActivePersona(name: string): Promise<void> {
    await writeFile(join(this.#aikoHome, "active-persona"), name ? `${name}\n` : "", "utf8");
  }

  async #originPersonaPath(): Promise<string> {
    return firstExistingPath([
      join(this.#aikoHome, "persona", "origin", "persona.md"),
      join(this.#aikoHome, "persona", "aiko-origin.md"),
    ]);
  }

  async #defaultOverridePath(): Promise<string> {
    const path = await firstExistingPath(
      [
        join(this.#aikoHome, "persona", "override", "persona.md"),
        join(this.#aikoHome, "persona", "aiko-override.md"),
      ],
      true
    );
    if (path) return path;
    const fallback = join(this.#aikoHome, "persona", "aiko-override.md");
    await mkdir(join(this.#aikoHome, "persona"), { recursive: true });
    await writeFile(fallback, await readFile(await this.#originPersonaPath(), "utf8"), "utf8");
    return fallback;
  }

  async #activeOverridePersonaPath(): Promise<string> {
    const active = await this.#readActivePersona();
    if (!active) return this.#defaultOverridePath();
    return (await this.#namedPersonaPath(active)) ?? (await this.#defaultOverridePath());
  }

  async #namedPersonaPath(name: string): Promise<string | undefined> {
    return firstExistingPath(
      [
        join(this.#aikoHome, "persona", "overrides", name, "persona.md"),
        join(this.#aikoHome, "persona", "overrides", `${name}.md`),
      ],
      true
    );
  }

  async #invariantsPath(): Promise<string> {
    return firstExistingPath([
      join(this.#aikoHome, "INVARIANTS.md"),
      join(this.#aikoHome, "persona", "INVARIANTS.md"),
    ]);
  }

  async #listNamedPersonas(): Promise<string[]> {
    const dir = join(this.#aikoHome, "persona", "overrides");
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      return entries
        .flatMap((entry) => {
          if (entry.isDirectory()) return [entry.name];
          if (entry.isFile() && entry.name.endsWith(".md")) return [entry.name.slice(0, -3)];
          return [];
        })
        .filter((name) => !RESERVED_PERSONA_NAMES.has(name))
        .sort();
    } catch (err) {
      if (isNotFound(err)) return [];
      throw err;
    }
  }

  /** ディスクから現在の mode を読む（ランタイムのキャッシュは restartThread を呼ばないと
   *  古いままなので、コマンド分岐は毎回ディスクを真として扱う）。
   *  不在（ENOENT）のみ "origin" にフォールバックし、それ以外（EACCES/EPERM 等）は
   *  rethrow して呼び出し側に観測させる。 */
  async #readCurrentMode(): Promise<"origin" | "override"> {
    try {
      const raw = (await readFile(join(this.#aikoHome, "mode"), "utf8")).trim();
      return raw === "override" ? "override" : "origin";
    } catch (err) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: unknown }).code === "ENOENT"
      ) {
        return "origin";
      }
      throw err;
    }
  }
}

// ─────────────────────────────────────
// pure helpers (export for testability)
// ─────────────────────────────────────

const RESERVED_PERSONA_NAMES = new Set(["origin", "override", "default", ".", "..", ""]);

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

function validatePersonaName(name: string): string | undefined {
  if (!name) return "エラー：人格名を指定してください。例: example, teacher, casual-aiko";
  if (RESERVED_PERSONA_NAMES.has(name)) return `エラー：「${name}」は予約名のため使用できません。`;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(name)) {
    return "エラー：人格名には小文字英数字とハイフンのみ使用できます。先頭・末尾のハイフンは使えません。";
  }
  return undefined;
}

async function firstExistingPath(paths: string[], optional?: false): Promise<string>;
async function firstExistingPath(paths: string[], optional: true): Promise<string | undefined>;
async function firstExistingPath(paths: string[], optional = false): Promise<string | undefined> {
  let lastNotFound: unknown;
  for (const path of paths) {
    try {
      await readFile(path, "utf8");
      return path;
    } catch (err) {
      if (!isNotFound(err)) throw err;
      lastNotFound = err;
    }
  }
  if (optional) return undefined;
  throw lastNotFound ?? Object.assign(new Error("ENOENT"), { code: "ENOENT" });
}

/** ユーザー指示を override.md の末尾に追記する保守的なマージ。 */
export function mergeOverrideInstruction(existing: string, instruction: string): string {
  const trimmed = existing.trimEnd();
  const ts = new Date().toISOString();
  return `${trimmed}\n\n## ユーザー指示（${ts}）\n\n${instruction.trim()}\n`;
}

/** 1 行サマリ（最初の改行までで最大 60 文字）。 */
export function summarizeInstruction(instruction: string): string {
  const head = instruction.split(/\r?\n/)[0]?.trim() ?? "";
  return head.length > 60 ? `${head.slice(0, 60)}…` : head;
}

/** ごくシンプルな unified diff（外部依存なし）。差分が無ければ空文字を返す。 */
export function unifiedDiff(
  fromName: string,
  toName: string,
  fromText: string,
  toText: string
): string {
  if (fromText === toText) return "";
  const fromLines = fromText.split("\n");
  const toLines = toText.split("\n");
  const lcs = longestCommonSubsequenceMatrix(fromLines, toLines);
  const ops = backtrackDiff(fromLines, toLines, lcs);
  const lines: string[] = [`--- ${fromName}`, `+++ ${toName}`];
  for (const op of ops) {
    if (op.kind === "eq") lines.push(` ${op.text}`);
    else if (op.kind === "del") lines.push(`-${op.text}`);
    else lines.push(`+${op.text}`);
  }
  return lines.join("\n");
}

interface DiffOp {
  kind: "eq" | "del" | "add";
  text: string;
}

function longestCommonSubsequenceMatrix(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i += 1) {
    const ai = a[i - 1];
    const row = dp[i] as number[];
    const prev = dp[i - 1] as number[];
    for (let j = 1; j <= n; j += 1) {
      if (ai === b[j - 1]) {
        row[j] = (prev[j - 1] as number) + 1;
      } else {
        const up = prev[j] as number;
        const left = row[j - 1] as number;
        row[j] = up >= left ? up : left;
      }
    }
  }
  return dp;
}

function backtrackDiff(a: string[], b: string[], dp: number[][]): DiffOp[] {
  const ops: DiffOp[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      ops.push({ kind: "eq", text: a[i - 1] as string });
      i -= 1;
      j -= 1;
    } else {
      const up = (dp[i - 1] as number[])[j] as number;
      const left = (dp[i] as number[])[j - 1] as number;
      if (up >= left) {
        ops.push({ kind: "del", text: a[i - 1] as string });
        i -= 1;
      } else {
        ops.push({ kind: "add", text: b[j - 1] as string });
        j -= 1;
      }
    }
  }
  while (i > 0) {
    ops.push({ kind: "del", text: a[i - 1] as string });
    i -= 1;
  }
  while (j > 0) {
    ops.push({ kind: "add", text: b[j - 1] as string });
    j -= 1;
  }
  return ops.reverse();
}
