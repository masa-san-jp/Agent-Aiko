// `aiko uninstall`。MCP 設計書 §4.4 / Phase 5。
//
// **推測で消さない。** installer が置いたものは `.install-manifest` に記録されている。
// 消すのはそこに載っているものだけで、載っていないファイルは利用者が後から
// 置いたものとして残す。一覧が無ければ何も消さない——「たぶんこれは配布物のもの」で
// 消すのは、この道具で一番やってはいけないこと。
//
// 消したあと何が残っているかを必ず出す。消えたものより、残っているものを
// 知りたいのが利用者側の関心。

import { readdir, readFile, rm, rmdir, stat } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { isUserOwned } from "./apply-update.js";

export const MANIFEST_NAME = ".install-manifest";

export interface UninstallPlan {
  /** 消す対象。manifest にあり、実在し、利用者のものでないもの。 */
  removable: string[];
  /** 残すもの（利用者のもの、または manifest に無いもの）。 */
  kept: string[];
  /** manifest が無い。この場合は何も消さない。 */
  manifestMissing: boolean;
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
    const info = await stat(full).catch(() => undefined);
    if (info === undefined) continue;
    if (info.isDirectory()) out.push(...(await listFiles(full, base)));
    else out.push(relative(base, full).split(sep).join("/"));
  }
  return out;
}

export async function planUninstall(aikoHome: string): Promise<UninstallPlan> {
  const manifest = await readFile(join(aikoHome, MANIFEST_NAME), "utf8").catch(() => undefined);
  const present = await listFiles(aikoHome);

  if (manifest === undefined) {
    return { removable: [], kept: present, manifestMissing: true };
  }

  const installed = new Set(
    manifest
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  );

  const removable = present.filter((rel) => installed.has(rel) && !isUserOwned(rel));
  const kept = present.filter((rel) => !removable.includes(rel) && rel !== MANIFEST_NAME);
  return { removable, kept, manifestMissing: false };
}

export interface UninstallResult {
  removed: string[];
  kept: string[];
}

export async function uninstall(aikoHome: string): Promise<UninstallResult> {
  const plan = await planUninstall(aikoHome);
  if (plan.manifestMissing) return { removed: [], kept: plan.kept };

  for (const rel of plan.removable) {
    await rm(join(aikoHome, rel), { force: true });
  }
  await rm(join(aikoHome, MANIFEST_NAME), { force: true });

  // 空になったディレクトリだけ畳む。中身が残っているところは触らない。
  const dirs = [...new Set(plan.removable.map((rel) => dirname(rel)))]
    .filter((dir) => dir !== ".")
    .sort((a, b) => b.length - a.length);
  for (const dir of dirs) {
    await rmdir(join(aikoHome, dir)).catch(() => undefined);
  }

  return { removed: plan.removable, kept: plan.kept };
}

export function renderUninstall(result: UninstallResult, aikoHome: string): string {
  const lines = [`${result.removed.length} 件を削除しました`];
  if (result.kept.length > 0) {
    lines.push("", `${aikoHome} に残したもの（${result.kept.length} 件）:`);
    for (const rel of result.kept.slice(0, 20)) lines.push(`  ${rel}`);
    if (result.kept.length > 20) lines.push(`  ほか ${result.kept.length - 20} 件`);
    lines.push("", "呼び名・自分で書いた人格・記録は消していません。");
    lines.push("完全に消すなら、上の場所ごと手で削除してください。");
  }
  return `${lines.join("\n")}\n`;
}

export function renderManifestMissing(aikoHome: string): string {
  return [
    `${aikoHome} に導入時の記録（${MANIFEST_NAME}）がありません`,
    "何が配布物のもので何がマサさんのものか区別できないため、何も削除しません。",
    "手で削除する場合は、user.md と persona/ の中身を先に退避してください。",
    "",
  ].join("\n");
}
