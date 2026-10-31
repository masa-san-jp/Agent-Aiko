import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";

export type Channel = "stable" | "beta";

export interface ReleaseInfo {
  tag: string;
  prerelease: boolean;
  url: string;
}

export interface UpdateCheckResult {
  current: string;
  latest?: ReleaseInfo;
  /** 新しいものがあるか。判断できなければ undefined。 */
  updateAvailable?: boolean;
  /** 判断できなかった理由。 */
  error?: string;
  /** 何が起きたか。「取得に失敗した」と「その channel にまだ無い」を混ぜない。 */
  reason?: "fetch-failed" | "no-release" | "incomparable";
}

/** Release 一覧の取得口。テストから差し替えるために切ってある。 */
export type FetchReleases = () => Promise<ReleaseInfo[]>;

const RELEASES_URL = "https://api.github.com/repos/masa-san-jp/Agent-Aiko/releases?per_page=30";

export const fetchReleasesFromGitHub: FetchReleases = async () => {
  const res = await fetch(RELEASES_URL, {
    headers: { accept: "application/vnd.github+json", "user-agent": "aiko-cli" },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const body = (await res.json()) as Array<{
    tag_name?: string;
    prerelease?: boolean;
    draft?: boolean;
    html_url?: string;
  }>;
  return body
    .filter((r) => r.draft !== true && typeof r.tag_name === "string")
    .map((r) => ({
      tag: r.tag_name as string,
      prerelease: r.prerelease === true,
      url: r.html_url ?? "",
    }));
};

/** `v1.2.3` / `v1.2.3-beta.4` を比較可能な形にする。tag でないものは null。 */
export function parseVersion(tag: string): { core: number[]; pre: string | null } | null {
  const m = /^v(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(tag);
  if (!m) return null;
  return {
    core: [Number(m[1]), Number(m[2]), Number(m[3])],
    pre: m[4] ?? null,
  };
}

/** 配布コマンド自身ではなく、実際に導入されたデータの版を読む。 */
export async function readInstalledVersion(home: string): Promise<string | undefined> {
  const path = join(home, "version");
  let stat;
  try { stat = await lstat(path); } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > 256) throw new Error("版ファイルが通常のファイルではありません");
  const value = (await readFile(path, "utf8")).trim();
  const tag = value.startsWith("v") ? value : `v${value}`;
  return parseVersion(tag) ? tag : undefined;
}

/** a が b より新しければ 1、古ければ -1、同じなら 0。比較できなければ null。
 *  SemVer と同じく、prerelease は同じ数字の正式版より古い。 */
export function compareVersions(a: string, b: string): number | null {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    const d = (pa.core[i] as number) - (pb.core[i] as number);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  if (pa.pre === pb.pre) return 0;
  if (pa.pre === null) return 1;
  if (pb.pre === null) return -1;
  return pa.pre > pb.pre ? 1 : pa.pre < pb.pre ? -1 : 0;
}

export async function checkForUpdate(
  currentVersion: string,
  channel: Channel,
  fetchReleases: FetchReleases = fetchReleasesFromGitHub,
): Promise<UpdateCheckResult> {
  let releases: ReleaseInfo[];
  try {
    releases = await fetchReleases();
  } catch (err) {
    // 取れなかったことを「最新です」に丸めない。分からないときは分からないと返す。
    return {
      current: currentVersion,
      reason: "fetch-failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const candidates = releases
    .filter((r) => (channel === "stable" ? !r.prerelease : true))
    .filter((r) => parseVersion(r.tag) !== null);

  if (candidates.length === 0) {
    return { current: currentVersion, reason: "no-release", error: `${channel} にはまだ公開されたものがありません` };
  }

  let latest = candidates[0] as ReleaseInfo;
  for (const r of candidates) {
    if ((compareVersions(r.tag, latest.tag) ?? 0) > 0) latest = r;
  }

  // package.json の version は `0.1.0` 形式、tag は `v0.1.0` 形式。
  const cmp = compareVersions(currentVersion.startsWith("v") ? currentVersion : `v${currentVersion}`, latest.tag);
  if (cmp === null) {
    return { current: currentVersion, latest, reason: "incomparable", error: "版を比較できませんでした" };
  }
  return { current: currentVersion, latest, updateAvailable: cmp < 0 };
}

export function renderCheck(result: UpdateCheckResult, channel: Channel, commandName = "aiko"): string {
  const lines = [`いま使っているもの: ${result.current}`];
  if (result.error && !result.latest) {
    // 「見に行けなかった」のか「まだ何も出していない」のかは、利用者にとって別の話。
    lines.push(
      result.reason === "no-release" ? result.error : `確認できませんでした: ${result.error}`,
    );
    return lines.join("\n") + "\n";
  }
  if (result.latest) {
    lines.push(`${channel} の最新: ${result.latest.tag}`);
    if (result.error) {
      lines.push(`  ${result.error}`);
    } else if (result.updateAvailable) {
      lines.push("", "新しいものがあります。", `  ${result.latest.url}`);
      lines.push("", `更新するには ${commandName} update を実行してください。`);
    } else {
      lines.push("", "最新です。");
    }
  }
  return lines.join("\n") + "\n";
}
