// codex app-server child process lifecycle.
//
// Transport インターフェース（transport.ts）の実機実装。
// 設計の正本: 2026-05-05-Agent-Aiko-Codex-design.md（masa-san-jp/Agent-Aiko-dev リポ） v0.3.1 §6.5

import { type ChildProcess, spawn } from "node:child_process";

import type { Transport } from "./transport.js";

export interface ProcessManagerOptions {
  /** codex バイナリのパス。既定は 'codex'（PATH 解決）。 */
  serverPath?: string;
  /** CODEX_HOME 環境変数の上書き値。 */
  codexHome?: string;
  /** stderr の各行を購読するコールバック。 */
  onLog?: (line: string) => void;
}

/**
 * codex app-server を子プロセスとして起動・管理する。
 * stdio は pipe で、JSON-RPC framing は呼び出し側（CodexClient）が担う。
 */
export class ProcessManager implements Transport {
  #proc: ChildProcess | null = null;
  readonly #options: ProcessManagerOptions;
  #stderrBuf = "";
  readonly #exitListeners: Array<
    (code: number | null, signal: NodeJS.Signals | null) => void
  > = [];
  readonly #stdoutListeners: Array<(chunk: Buffer) => void> = [];

  constructor(options: ProcessManagerOptions = {}) {
    this.#options = options;
  }

  /** プロセスを起動する。既に起動済みの場合は何もしない。 */
  start(): void {
    if (this.#proc !== null) {
      return;
    }
    const bin = this.#options.serverPath ?? "codex";
    const env = { ...process.env };
    if (this.#options.codexHome !== undefined) {
      env["CODEX_HOME"] = this.#options.codexHome;
    }
    const child = spawn(bin, ["app-server"], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.#proc = child;

    // 既に登録済みの stdout リスナーを子プロセスへ接続
    for (const handler of this.#stdoutListeners) {
      child.stdout?.on("data", handler);
    }

    child.stderr?.on("data", (chunk: Buffer) => {
      this.#stderrBuf += chunk.toString("utf8");
      let idx = this.#stderrBuf.indexOf("\n");
      while (idx !== -1) {
        const line = this.#stderrBuf.slice(0, idx);
        this.#stderrBuf = this.#stderrBuf.slice(idx + 1);
        this.#options.onLog?.(line);
        idx = this.#stderrBuf.indexOf("\n");
      }
    });

    child.on("exit", (code, signal) => {
      this.#proc = null;
      for (const listener of this.#exitListeners) {
        listener(code, signal);
      }
    });

    child.on("error", (err) => {
      this.#options.onLog?.(`[spawn error] ${err.message}`);
    });
  }

  /** stdin に書き込む（行単位の JSON-RPC を流す前提）。 */
  write(data: string): void {
    if (this.#proc === null) {
      throw new Error("ProcessManager not started");
    }
    if (!this.#proc.stdin || this.#proc.stdin.destroyed) {
      throw new Error("stdin is not writable");
    }
    this.#proc.stdin.write(data);
  }

  /** stdout のチャンクを購読する。 */
  onStdout(handler: (chunk: Buffer) => void): void {
    this.#stdoutListeners.push(handler);
    // 既に start() 済みなら子プロセスにも繋ぐ
    if (this.#proc !== null) {
      this.#proc.stdout?.on("data", handler);
    }
  }

  /** プロセスが予期せず終了したときに呼ばれるリスナーを登録する。 */
  onExit(
    handler: (code: number | null, signal: NodeJS.Signals | null) => void
  ): void {
    this.#exitListeners.push(handler);
  }

  /** プロセスを停止する。SIGTERM 後 5 秒以内に終了しなければ SIGKILL。 */
  async stop(): Promise<void> {
    const proc = this.#proc;
    if (proc === null) {
      return;
    }
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
      }, 5000);
      proc.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      try {
        proc.stdin?.end();
        proc.kill("SIGTERM");
      } catch {
        // 既に終了している場合は exit イベント側で resolve される
      }
    });
  }
}
