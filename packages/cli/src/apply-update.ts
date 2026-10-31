// `aiko update` の適用と `aiko rollback`。MCP 設計書 Phase 5 / §16。
//
// §16 は「update / rollback で User Profile を失わない」と定めている。
// **失わない一番確実なやり方は、触らないこと。** 更新も巻き戻しも、
// 配布物が持っている側のファイルしか書かない。利用者のものは読みも書きもしない。
//
// どれが利用者のものかは installer が既に決めている（copy_aiko_template_tree の
// 除外一覧）。ここに同じ一覧を持つのは重複だが、bash と TypeScript をまたぐので
// 参照はできない。**代わりに、ずれたら落ちるテストを置いてある。**

import { createHash } from "node:crypto";
import { cp, lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";

/** 利用者のもの。更新でも巻き戻しでも書き換えない。 */
export const USER_OWNED_PATHS: readonly string[] = [
  "mode",
  "backups",
  "user.md",
  "user-profile.json",
  "user-proposal.md",
  "override-history.jsonl",
  "active-persona",
  "speech-style",
  "speech-style-proposal",
  "speech-styles",
  "persona/origin/user.md",
  "persona/aiko-override.md",
  "persona/override",
  "persona/overrides",
  "persona/proposals",
  "capability/rules/rules-base.md",
];

export function isUserOwned(rel: string): boolean {
  const normalized = rel.split(sep).join("/");
  return USER_OWNED_PATHS.some((owned) => normalized === owned || normalized.startsWith(`${owned}/`));
}

async function listFiles(root: string, base = root): Promise<string[]> {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return out;
    throw err;
  }
  for (const entry of entries) {
    const full = join(root, entry);
    const info = await lstat(full);
    if (info.isDirectory()) out.push(...(await listFiles(full, base)));
    else out.push(relative(base, full));
  }
  return out;
}

/** 利用者が選んだルートの内側でリンクを辿ると、別の利用者ファイルを書き換えうる。 */
async function assertNoSymlinks(base: string, rel: string): Promise<void> {
  let path = base;
  for (const part of rel.split(sep).filter(Boolean)) {
    if (part === "." || part === "..") throw new Error("不正なパスです");
    path = join(path, part);
    try {
      const info = await lstat(path);
      if (info.isSymbolicLink()) throw new Error(`シンボリックリンクがあるため中止します: ${path}`);
      if (!info.isFile() && !info.isDirectory()) throw new Error(`通常のファイルやディレクトリではないため中止します: ${path}`);
      if (info.isFile() && info.nlink > 1) throw new Error(`ハードリンクがあるため中止します: ${path}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
  }
}

/** 保守対象と退避先は、書き込み前に全件検査する。 */
async function assertBackupRoot(aikoHome: string, backupRoot: string): Promise<void> {
  const rel = relative(aikoHome, backupRoot);
  if (rel && rel !== ".." && !rel.startsWith(`..${sep}`)) {
    await assertNoSymlinks(aikoHome, rel);
  } else {
    await assertNoSymlinks(dirname(backupRoot), basename(backupRoot));
  }
}

export interface ApplyUpdateInput {
  aikoHome: string;
  /** 展開済み配布物の中の、~/.aiko に対応するディレクトリ。 */
  templateAikoDir: string;
  version: string;
  previousVersion?: string;
  backupRoot: string;
  now: Date;
}

export interface ApplyUpdateResult {
  backupDir: string;
  updated: string[];
  /** 触らなかった利用者のもの。数えて出す——「消えていない」を目に見えるようにする。 */
  preserved: string[];
}

export async function applyUpdate(input: ApplyUpdateInput): Promise<ApplyUpdateResult> {
  const stamp = input.now.toISOString().replace(/[:.]/g, "-");
  const backupDir = join(input.backupRoot, `${stamp}-${input.version}`);
  const candidates = (await listFiles(input.templateAikoDir)).filter((rel) => !isUserOwned(rel));
  await assertBackupRoot(input.aikoHome, input.backupRoot);
  await assertNoSymlinks(input.aikoHome, "version");
  for (const rel of candidates) {
    await assertNoSymlinks(input.templateAikoDir, rel);
    await assertNoSymlinks(input.aikoHome, rel);
    await assertNoSymlinks(input.backupRoot, join(`${stamp}-${input.version}`, rel));
  }
  await assertNoSymlinks(input.backupRoot, join(`${stamp}-${input.version}`, "backup.json"));

  const updated: string[] = [];
  for (const rel of candidates) {
    const dst = join(input.aikoHome, rel);
    // 既にあるものだけ退避する。新規追加は巻き戻し時に消せないが、
    // 消すほうが危ない（利用者が後から置いたものと見分けが付かない）。
    const existing = await readFile(dst).catch((err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") return undefined;
      throw err;
    });
    if (existing !== undefined) {
      await mkdir(dirname(join(backupDir, rel)), { recursive: true });
      await writeFile(join(backupDir, rel), existing);
    }
    await mkdir(dirname(dst), { recursive: true });
    await cp(join(input.templateAikoDir, rel), dst);
    updated.push(rel);
  }

  const preserved = (await listFiles(input.aikoHome)).filter((rel) => isUserOwned(rel));

  await mkdir(backupDir, { recursive: true });
  await writeFile(
    join(backupDir, "backup.json"),
    `${JSON.stringify({ format: 2, version: input.previousVersion ?? "unknown", updatedTo: input.version, createdAt: input.now.toISOString(), files: updated }, null, 2)}\n`,
  );
  await writeFile(join(input.aikoHome, "version"), `${input.version}\n`);

  return { backupDir, updated, preserved };
}

export interface Backup {
  dir: string;
  version: string;
  createdAt: string;
}

export async function listBackups(backupRoot: string): Promise<Backup[]> {
  const dirs = await readdir(backupRoot).catch(() => [] as string[]);
  const backups: Backup[] = [];
  for (const dir of dirs) {
    await assertNoSymlinks(backupRoot, join(dir, "backup.json"));
    const meta = await readFile(join(backupRoot, dir, "backup.json"), "utf8").catch(() => undefined);
    if (meta === undefined) continue;
    const parsed = JSON.parse(meta) as { format?: number; version?: string; createdAt?: string };
    backups.push({
      dir: join(backupRoot, dir),
      version: parsed.format === 2 ? (parsed.version ?? "unknown") : "unknown",
      createdAt: parsed.createdAt ?? "",
    });
  }
  return backups.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export interface RollbackResult {
  restoredFrom: string;
  restored: string[];
}

/** 直近の退避へ戻す。利用者のものは退避に入っていないので、そもそも戻らない。 */
export async function rollback(input: {
  aikoHome: string;
  backupRoot: string;
}): Promise<RollbackResult | undefined> {
  await assertBackupRoot(input.aikoHome, input.backupRoot);
  const [latest] = await listBackups(input.backupRoot);
  if (latest === undefined) return undefined;

  const files = (await listFiles(latest.dir)).filter((rel) => rel !== "backup.json" && !isUserOwned(rel));
  await assertNoSymlinks(input.aikoHome, "version");
  for (const rel of files) {
    await assertNoSymlinks(latest.dir, rel);
    await assertNoSymlinks(input.aikoHome, rel);
  }
  const restored: string[] = [];
  for (const rel of files) {
    const dst = join(input.aikoHome, rel);
    await mkdir(dirname(dst), { recursive: true });
    await cp(join(latest.dir, rel), dst);
    restored.push(rel);
  }
  await writeFile(join(input.aikoHome, "version"), `${latest.version}\n`);
  return { restoredFrom: latest.dir, restored };
}

/** 配布物の取得。tar の展開だけ外部コマンドに任せる（Node に tar は無い）。 */
export interface DownloadedRelease {
  tag: string;
  /** 展開先のルート。中に agent-aiko-<tag>/ がある。 */
  dir: string;
}

export function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** SHA256SUMS の中から目的のファイルの期待値を取る。 */
export function expectedDigest(sums: string, fileName: string): string | undefined {
  for (const line of sums.split("\n")) {
    const [digest, name] = line.trim().split(/\s+/);
    if (name?.replace(/^\*/, "") === fileName) return digest;
  }
  return undefined;
}
