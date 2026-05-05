// MockTransport — テスト用の Transport 実装。
//
// CodexClient に注入することで、stdin への書込内容を検査し、
// 任意のタイミングで stdout チャンク（JSON-RPC レスポンス／通知）を流せる。

import type { Transport } from "../src/codex-client/transport.js";

export class MockTransport implements Transport {
  /** これまでに write された行（改行除去後）。 */
  readonly writes: string[] = [];
  #stdoutHandler: ((chunk: Buffer) => void) | null = null;
  #exitHandlers: Array<(code: number | null, signal: NodeJS.Signals | null) => void> = [];
  #started = false;

  start(): void {
    this.#started = true;
  }

  async stop(): Promise<void> {
    this.#started = false;
  }

  isStarted(): boolean {
    return this.#started;
  }

  write(data: string): void {
    if (!this.#started) {
      throw new Error("MockTransport not started");
    }
    // CodexClient は 1 行 1 メッセージで encode するので末尾の改行を取り除いて記録
    const trimmed = data.endsWith("\n") ? data.slice(0, -1) : data;
    this.writes.push(trimmed);
  }

  onStdout(handler: (chunk: Buffer) => void): void {
    this.#stdoutHandler = handler;
  }

  onExit(handler: (code: number | null, signal: NodeJS.Signals | null) => void): void {
    this.#exitHandlers.push(handler);
  }

  /** 受信側を 1 行のメッセージで叩く。 */
  pushIncoming(payload: object): void {
    if (this.#stdoutHandler === null) {
      throw new Error("no stdout handler attached");
    }
    this.#stdoutHandler(Buffer.from(`${JSON.stringify(payload)}\n`, "utf8"));
  }

  /** 受信した最後の write を JSON.parse して返す。 */
  lastWrite(): { jsonrpc: string; id?: number; method: string; params?: unknown } {
    const last = this.writes[this.writes.length - 1];
    if (last === undefined) {
      throw new Error("no writes recorded");
    }
    return JSON.parse(last) as { jsonrpc: string; id?: number; method: string; params?: unknown };
  }

  /** プロセスが死んだことをシミュレートする。 */
  simulateExit(code: number | null = 1, signal: NodeJS.Signals | null = null): void {
    this.#started = false;
    for (const h of this.#exitHandlers) h(code, signal);
  }
}
