// 配布物の取得と照合。MCP 設計書 Phase 5。
//
// installer（bash）と同じことを TypeScript でやる。**照合に失敗したら展開しない**のも同じ。
// tar だけ外部コマンドに任せる——Node に展開の口が無く、そのために依存を1つ増やすより、
// どの対象 OS にも在る道具を呼ぶほうが軽い。

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { expectedDigest, sha256 } from "./apply-update.js";

const run = promisify(execFile);

export class DownloadError extends Error {
  override readonly name = "DownloadError";
  constructor(
    message: string,
    readonly reason: "fetch-failed" | "checksum-missing" | "checksum-mismatch" | "extract-failed",
  ) {
    super(message);
  }
}

/** 取得口。テストから差し替える。 */
export type FetchBytes = (url: string) => Promise<Uint8Array>;

export const fetchBytesFromNetwork: FetchBytes = async (url) => {
  const res = await fetch(url, { headers: { "user-agent": "aiko-cli" } });
  if (!res.ok) throw new DownloadError(`${url} を取得できません（${res.status}）`, "fetch-failed");
  return new Uint8Array(await res.arrayBuffer());
};

export interface DownloadInput {
  tag: string;
  destDir: string;
  baseUrl?: string;
  fetchBytes?: FetchBytes;
}

/** 取得 → 照合 → 展開。展開先の `agent-aiko-<tag>` を返す。 */
export async function downloadVerifiedRelease(input: DownloadInput): Promise<string> {
  const base =
    input.baseUrl ?? "https://github.com/masa-san-jp/Agent-Aiko/releases/download";
  const get = input.fetchBytes ?? fetchBytesFromNetwork;
  const name = `agent-aiko-${input.tag}.tar.gz`;

  await mkdir(input.destDir, { recursive: true });
  const archive = await get(`${base}/${input.tag}/${name}`);
  const sums = new TextDecoder().decode(await get(`${base}/${input.tag}/SHA256SUMS`));

  const expected = expectedDigest(sums, name);
  if (expected === undefined) {
    throw new DownloadError(`SHA256SUMS に ${name} がありません`, "checksum-missing");
  }
  const actual = sha256(archive);
  if (actual !== expected) {
    // 落ちたものを別経路で入れ直さない。検証していないものを入れるのと同じになる。
    throw new DownloadError(`配布物の checksum が一致しません（${input.tag}）`, "checksum-mismatch");
  }

  const archivePath = join(input.destDir, name);
  await writeFile(archivePath, archive);
  try {
    await run("tar", ["-xzf", archivePath, "-C", input.destDir]);
  } catch (err) {
    throw new DownloadError(
      `配布物を展開できません: ${err instanceof Error ? err.message : String(err)}`,
      "extract-failed",
    );
  }
  return join(input.destDir, `agent-aiko-${input.tag}`);
}
