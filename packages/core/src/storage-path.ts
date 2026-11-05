import { lstat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

/** 利用者が選んだ保存先の内側で、リンクを通じて別の場所を操作しない。 */
export async function assertStoragePath(home: string, path: string): Promise<void> {
  const root = resolve(home);
  const rel = relative(root, resolve(path));
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error("利用者の保存先の外は操作できません");
  }
  let current = root;
  for (const part of rel.split(sep)) {
    current = join(current, part);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new Error("保存先にシンボリックリンクがあるため操作できません");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
  }
}
