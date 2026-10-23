// Claude Code 向け Runtime Adapter。設計書 §8.1 / §3.4。
//
// 合成した人格を system 級の指示として Claude Code へ渡す。手段は §8.5 で実測
// 確認済みの `--system-prompt-file` / `--append-system-prompt-file`。
//
// CLAUDE.md には触らない。§8.1 が「既存 CLAUDE.md を上書きしない」と定めている
// うえ、ファイルを書き換えずに済む手段があるなら、そもそも触る理由がない。
//
// Binding に失敗したら起動用の引数を作らない（§3.4 Fail Closed）。人格が無い
// まま claude が立ち上がったら、それは Aiko ではない。

import { constants } from "node:fs";
import { lstat, mkdir, mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createRuntimeSdk,
  RuntimeSdkError,
  type InjectionMethod,
  type PersonaRepository,
  type ResolvedUserContext,
  type RuntimeProfile,
} from "@agent-aiko/runtime-sdk";

/** 既定の注入手段。base を置き換える側を使う。 */
export const DEFAULT_INJECTION: InjectionMethod = "claude-code:system-prompt-file";

export interface PrepareOptions {
  personaRepository: PersonaRepository;
  user: ResolvedUserContext;
  personaId?: string;
  capabilityManifest?: unknown;
  outputPrefix?: string;
  /** 既定の人格指示を置き換えるか、後ろに足すか。 */
  mode?: "replace" | "append";
  /** 指示文を書き出すディレクトリ。既定は $XDG_RUNTIME_DIR か os の一時領域。 */
  stateDir: string;
}

export interface PreparedLaunch {
  /** claude に渡す引数。実行はしない。 */
  args: string[];
  /** 書き出した指示文のパス（0600）。 */
  instructionsPath: string;
  profile: RuntimeProfile;
}

export class AdapterError extends Error {
  override readonly name = "AdapterError";

  constructor(
    message: string,
    readonly detail: { stage: string },
  ) {
    super(message);
  }
}

/** 指示文の置き場。固定名の共有ディレクトリにはしない。 */
export async function resolveStateDir(env: NodeJS.ProcessEnv): Promise<string> {
  const explicit = env["AIKO_STATE_DIR"];
  if (explicit) return explicit;
  const parent = env["XDG_RUNTIME_DIR"] || tmpdir();
  return mkdtemp(join(parent, "aiko-claude-code-"));
}

/** 起動に必要なものを用意する。ここでは claude を起動しない。
 *  「引数を作る」と「起動する」を分けておくと、起動せずに中身を検証できる。 */
export async function prepareLaunch(options: PrepareOptions): Promise<PreparedLaunch> {
  const mode = options.mode ?? "replace";
  const injectionMethod: InjectionMethod =
    mode === "append"
      ? "claude-code:append-system-prompt-file"
      : "claude-code:system-prompt-file";

  // R3: Binder を直接呼ばず Runtime SDK を通す（SDK 設計書 §1・§23 R3）。
  // Adapter はホスト固有の処理（引数の組み立てとファイル書き出し）だけを持つ。
  const sdk = createRuntimeSdk({
    personaRepository: options.personaRepository,
    user: options.user,
  });

  let profile: RuntimeProfile;
  try {
    const bundle = await sdk.prepareLaunch({
      requestId: `claude-code-${Date.now()}`,
      personaRef: { personaId: options.personaId ?? "aiko" },
      userRef: { userId: options.user.context.id },
      runtime: { id: "claude-code", version: "1" },
      // §17.1: Adapter は自分が使える注入手段を申告する。SDK に推測させない。
      injectionCapability: { systemLevel: [injectionMethod] },
      requestedConsistencyLevel: 2,
      ...(options.capabilityManifest === undefined
        ? {}
        : { capabilityManifest: options.capabilityManifest }),
      ...(options.outputPrefix ? { outputPrefix: options.outputPrefix } : {}),
    });
    profile = bundle.profile;
  } catch (err) {
    // 合成できないなら引数を作らない。呼び出し側が「とりあえず起動」できないよう、
    // 部分的な結果を返さず例外で止める（§3.4）。
    // §10.3: SDK のエラーコードを別の意味へ置き換えない。理由はそのまま伝える。
    throw new AdapterError(
      `人格を合成できなかったため Claude Code を起動しません: ${
        err instanceof RuntimeSdkError
          ? err.userMessage
          : err instanceof Error
            ? err.message
            : String(err)
      }`,
      { stage: "binding" },
    );
  }

  const instructionsPath = await writeInstructions(options.stateDir, profile);

  const flag =
    injectionMethod === "claude-code:append-system-prompt-file"
      ? "--append-system-prompt-file"
      : "--system-prompt-file";

  return { args: [flag, instructionsPath], instructionsPath, profile };
}

/** 指示文をファイルへ書く。§11.3 が Runtime Profile を 0600 と定めている。
 *  指示文には呼称など利用者の情報が入るため、他ユーザーから読めてはいけない。
 *
 *  置き場は自分の uid で 0700 の実ディレクトリだけを使う。既にあるディレクトリの
 *  持ち主も権限も見ずに mkdir すると、先に作っておいた共有ディレクトリへ
 *  指示文を書かされる。ファイルは O_CREAT|O_EXCL|O_NOFOLLOW で作る。
 *  writeFile と chmod はシンボリックリンクを辿るので使わない。 */
async function writeInstructions(stateDir: string, profile: RuntimeProfile): Promise<string> {
  await assertPrivateStateDir(stateDir);
  // profile_id をファイル名にすると、同じ合成結果は同じファイルに落ちる。
  const path = join(stateDir, `runtime-profile-${profile.profile_id}.md`);
  await writePrivateFile(path, profile.instructions);
  return path;
}

async function assertPrivateStateDir(stateDir: string): Promise<void> {
  let info = await lstat(stateDir).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== "ENOENT") throw err;
    return undefined;
  });
  if (info === undefined) {
    await mkdir(stateDir, { recursive: true, mode: 0o700 });
    info = await lstat(stateDir);
  }
  const uid = process.getuid?.();
  const mode = info.mode & 0o777;
  const owned = uid === undefined || info.uid === uid;
  if (!info.isDirectory() || info.isSymbolicLink() || !owned || (mode & 0o077) !== 0) {
    throw new AdapterError(
      "指示文の置き場が自分だけのディレクトリではありません。起動を中止します",
      { stage: "instructions" },
    );
  }
}

/** 新規ファイルを 0600 で作る。既存のシンボリックリンクは辿らず、中止する。
 *  自分が所有する通常ファイルが既にあるときだけ、一度外して作り直す。 */
async function writePrivateFile(path: string, content: string): Promise<void> {
  const noFollow = constants.O_NOFOLLOW;
  if (process.platform !== "win32" && !noFollow) {
    throw new AdapterError("この OS では指示文をリンクを辿らずに書けません。起動を中止します", {
      stage: "instructions",
    });
  }
  const flags = constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (noFollow ?? 0);
  try {
    await createExclusive(path, flags, content);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") throw err;
    const info = await lstat(path);
    const uid = process.getuid?.();
    const owned = uid === undefined || info.uid === uid;
    if (!info.isFile() || info.isSymbolicLink() || !owned) {
      throw new AdapterError(
        "指示文の書き出し先がシンボリックリンクか、自分のファイルではありません。起動を中止します",
        { stage: "instructions" },
      );
    }
    await rm(path);
    await createExclusive(path, flags, content);
  }
}

async function createExclusive(path: string, flags: number, content: string): Promise<void> {
  const handle = await open(path, flags, 0o600);
  try {
    // open の mode は umask で削られる。fd への chmod はリンクを辿らない。
    await handle.chmod(0o600);
    await handle.writeFile(content, "utf8");
  } finally {
    await handle.close();
  }
}
