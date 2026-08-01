// installer の配布物取得。MCP 設計書 Phase 5 / §16「1コマンドで導入できる」。
//
// 見るのは1つ——**checksum が合わないものを入れないこと**。
// リポジトリから直接取る経路には検証が無いので、Release 経由にした意味は
// 「照合が実際に効くこと」が確かめられて初めて生まれる。
//
// ネットワークへは出ない。curl の file:// で、手元に作った「Release」を指す。

import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, it } from "node:test";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const INSTALLER = join(REPO_ROOT, "claude-code", "scripts", "install.sh");
const TAG = "v9.9.9";

function hasSha256sum() {
  try {
    execFileSync("sha256sum", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** 実際の template を固めて、Release と同じ形（tarball + SHA256SUMS）を作る。 */
async function makeRelease(root, { corruptChecksum = false } = {}) {
  const staging = join(root, "staging");
  const prefix = `agent-aiko-${TAG}`;
  const dl = join(root, "dl", TAG);
  await mkdir(join(staging, prefix, "claude-code"), { recursive: true });
  await mkdir(dl, { recursive: true });
  await cp(join(REPO_ROOT, "claude-code", "template"), join(staging, prefix, "claude-code", "template"), {
    recursive: true,
  });

  execFileSync("tar", ["-czf", join(dl, `${prefix}.tar.gz`), "-C", staging, prefix]);
  // macOS には sha256sum が無い。installer 側と同じ道具の選び方をする。
  const digest = hasSha256sum()
    ? execFileSync("sha256sum", [`${prefix}.tar.gz`], { cwd: dl, encoding: "utf8" })
    : execFileSync("shasum", ["-a", "256", `${prefix}.tar.gz`], { cwd: dl, encoding: "utf8" });
  await writeFile(
    join(dl, "SHA256SUMS"),
    corruptChecksum ? digest.replace(/^\w/, (c) => (c === "0" ? "1" : "0")) : digest,
  );

  // stable の解決に使う JSON。GitHub の /releases/latest と同じ形。
  const api = join(root, "api");
  await mkdir(api, { recursive: true });
  await writeFile(join(api, "latest"), JSON.stringify({ tag_name: TAG, prerelease: false }));

  return { api, dl: join(root, "dl") };
}

function runInstaller({ cwd, home, env }) {
  return execFileSync("bash", [INSTALLER, "--yes"], {
    cwd,
    env: { ...process.env, HOME: home, ...env },
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

describe("installer: 配布物の取得と照合", () => {
  let root;
  let installerCopy;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "aiko-release-test-"));
    // curl | bash と同じ状況にする。リポジトリの外に置けば同居の template は見えない。
    installerCopy = join(root, "install.sh");
    await cp(INSTALLER, installerCopy);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("checksum が合う配布物からインストールする", async () => {
    const { api, dl } = await makeRelease(root);
    const project = join(root, "project");
    await mkdir(project, { recursive: true });

    const out = execFileSync("bash", [installerCopy, "--yes"], {
      cwd: project,
      env: {
        ...process.env,
        HOME: root,
        AGENT_AIKO_RELEASE_API: `file://${api}`,
        AGENT_AIKO_RELEASE_DL: `file://${dl}`,
      },
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    assert.match(out, /checksum 照合済み/);
    assert.equal(existsSync(join(project, ".claude", "skills")), true);
  });

  it("checksum が合わない配布物は入れない", async () => {
    const { api, dl } = await makeRelease(root, { corruptChecksum: true });
    const project = join(root, "project");
    await mkdir(project, { recursive: true });

    let failed = false;
    let stderr = "";
    try {
      execFileSync("bash", [installerCopy, "--yes"], {
        cwd: project,
        env: {
          ...process.env,
          HOME: root,
          AGENT_AIKO_RELEASE_API: `file://${api}`,
          AGENT_AIKO_RELEASE_DL: `file://${dl}`,
        },
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      failed = true;
      stderr = String(err.stderr ?? "");
    }

    assert.equal(failed, true, "checksum 不一致でも終了コードが 0 だった");
    assert.match(stderr, /checksum が一致しません/);
  });

  it("checksum が合わないときは、リポジトリ取得へ回り込まない", async () => {
    // 落ちたものを別経路で入れ直すのは、検証していないものを入れるのと同じ。
    const { api, dl } = await makeRelease(root, { corruptChecksum: true });
    const project = join(root, "project");
    await mkdir(project, { recursive: true });

    try {
      execFileSync("bash", [installerCopy, "--yes"], {
        cwd: project,
        env: {
          ...process.env,
          HOME: root,
          AGENT_AIKO_RELEASE_API: `file://${api}`,
          AGENT_AIKO_RELEASE_DL: `file://${dl}`,
        },
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      // 失敗するのが正しい。ここで見たいのは「何も入っていないこと」。
    }

    assert.equal(existsSync(join(project, ".claude", "skills")), false);
  });

  it("配布物が見つからないときは、照合なしで取得したと明示する", async () => {
    // 取得先を空にする＝まだ Release が無い状態。黙って git clone すると、
    // 検証済みで入ったのか区別が付かない。
    const api = join(root, "empty-api");
    await mkdir(api, { recursive: true });
    const project = join(root, "project");
    await mkdir(project, { recursive: true });

    // git clone まで走らせるとネットワークへ出るので、失敗して構わない。
    // 見たいのは「照合なし経路へ入る前に、そう言っているか」。
    let combined = "";
    try {
      combined = execFileSync("bash", [installerCopy, "--yes"], {
        cwd: project,
        env: {
          ...process.env,
          HOME: root,
          AGENT_AIKO_RELEASE_API: `file://${api}`,
          AGENT_AIKO_RELEASE_DL: `file://${join(root, "empty-dl")}`,
        },
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      combined = String(err.stdout ?? "") + String(err.stderr ?? "");
    }

    assert.match(combined, /配布物が見つかりません/);
  });
});
