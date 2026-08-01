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
import { cp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

/** 利用者のもの。更新でも巻き戻しでも書き換えない。 */
export const USER_OWNED_PATHS: readonly string[] = [
  "mode",
  "user.md",
  "override-history.jsonl",
  "active-persona",
  "persona/aiko-override.md",
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
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(root, entry);
    const info = await stat(full);
    if (info.isDirectory()) out.push(...(await listFiles(full, base)));
    else out.push(relative(base, full));
  }
  return out;
}

export interface ApplyUpdateInput {
  aikoHome: string;
  /** 展開済み配布物の中の、~/.aiko に対応するディレクトリ。 */
  templateAikoDir: string;
  version: string;
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

  const updated: string[] = [];
  for (const rel of candidates) {
    const dst = join(input.aikoHome, rel);
    // 既にあるものだけ退避する。新規追加は巻き戻し時に消せないが、
    // 消すほうが危ない（利用者が後から置いたものと見分けが付かない）。
    const existing = await readFile(dst).catch(() => undefined);
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
    `${JSON.stringify({ version: input.version, createdAt: input.now.toISOString(), files: updated }, null, 2)}\n`,
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
    const meta = await readFile(join(backupRoot, dir, "backup.json"), "utf8").catch(() => undefined);
    if (meta === undefined) continue;
    const parsed = JSON.parse(meta) as { version?: string; createdAt?: string };
    backups.push({
      dir: join(backupRoot, dir),
      version: parsed.version ?? "unknown",
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
  const [latest] = await listBackups(input.backupRoot);
  if (latest === undefined) return undefined;

  const files = (await listFiles(latest.dir)).filter((rel) => rel !== "backup.json");
  const restored: string[] = [];
  for (const rel of files) {
    if (isUserOwned(rel)) continue; // 退避には入らないはずだが、念のため二重に守る
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
