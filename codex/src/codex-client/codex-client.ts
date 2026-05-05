// CodexClient — high-level client for codex app-server.
//
// 設計の正本: dev-docs/2026-05-05-Agent-Aiko-Codex-design.md v0.3.1 §6.1

import {
  type IncomingMessage,
  type JsonRpcNotification,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonValue,
  LineBuffer,
  encode,
  parseIncoming,
} from "./jsonrpc.js";
import { ProcessManager } from "./process-manager.js";
import type { Transport } from "./transport.js";
import type {
  AccountInfo,
  AskOptions,
  AskResult,
  CodexClientOptions,
  StartThreadOptions,
} from "./types.js";

interface PendingRequest {
  resolve: (value: JsonValue) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
  /**
   * 応答受信時に Promise resolve より前に同期実行されるコールバック。
   * stdout チャンクに response＋notification が混ざっている場合、
   * 後続の notification ハンドラが見る activeTurn の状態をここで更新できる。
   */
  onResolve?: (value: JsonValue) => void;
}

interface ActiveTurn {
  threadId: string;
  /** turn/start レスポンスで確定する turnId。確定前は __pending__ プレースホルダ。 */
  turnId: string;
  resolveAsk: (result: AskResult) => void;
  rejectAsk: (reason: Error) => void;
  buffer: string[];
  abortListener: (() => void) | null;
  abortSignal: AbortSignal | undefined;
  onStarted: ((turnId: string) => void) | undefined;
  onDelta: ((chunk: string) => void) | undefined;
  /** 既に解決済み（resolve または reject 済み）かのフラグ。 */
  settled: boolean;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const PROTOCOL_VERSION = "2024-11-05";
const CLIENT_NAME = "@agent-aiko/codex";
/** initialize で advertise するクライアントバージョン。本ファイルが単一情報源。 */
export const CLIENT_VERSION = "0.2.0";

/** CodexClient コンストラクタの内部オプション（テスト用 transport 注入を含む）。 */
export interface CodexClientInternalOptions extends CodexClientOptions {
  /** テスト等で Transport 実装を差し替えるためのフック。指定時は ProcessManager を作らない。 */
  transport?: Transport;
}

/**
 * codex app-server との JSON-RPC 通信を抽象化する高レベルクライアント。
 *
 * 使い方：
 * ```ts
 * const client = new CodexClient();
 * await client.start();
 * const { threadId } = await client.startThread({ baseInstructions: "..." });
 * const { text } = await client.ask({ threadId, text: "hello", onDelta });
 * await client.stop();
 * ```
 */
export class CodexClient {
  readonly #options: CodexClientOptions;
  readonly #transport: Transport;
  readonly #buffer = new LineBuffer();
  readonly #pending = new Map<number, PendingRequest>();
  /** 進行中ターン（threadId をキーに 1 件のみ管理）。 */
  readonly #activeTurns = new Map<string, ActiveTurn>();
  #nextId = 1;
  #ready = false;
  #startPromise: Promise<this> | null = null;

  constructor(options: CodexClientInternalOptions = {}) {
    const { transport, ...publicOptions } = options;
    this.#options = publicOptions;
    if (transport !== undefined) {
      this.#transport = transport;
    } else {
      const pmOptions: {
        serverPath?: string;
        codexHome?: string;
        onLog?: (line: string) => void;
      } = {};
      if (publicOptions.serverPath !== undefined) pmOptions.serverPath = publicOptions.serverPath;
      if (publicOptions.codexHome !== undefined) pmOptions.codexHome = publicOptions.codexHome;
      if (publicOptions.onLog !== undefined) pmOptions.onLog = publicOptions.onLog;
      this.#transport = new ProcessManager(pmOptions);
    }
    this.#transport.onExit((code, signal) => this.#handleExit(code, signal));
  }

  /**
   * App Server を起動し initialize → initialized ハンドシェイクを完了させる。
   * 並列に呼ばれた場合は同じ Promise を返す（ハンドシェイクの二重発行を防ぐ）。
   */
  async start(): Promise<this> {
    if (this.#ready) {
      return this;
    }
    if (this.#startPromise !== null) {
      return this.#startPromise;
    }
    this.#startPromise = (async (): Promise<this> => {
      try {
        this.#transport.start();
        this.#transport.onStdout((chunk) => this.#handleChunk(chunk));
        await this.#request("initialize", {
          protocolVersion: PROTOCOL_VERSION,
          clientInfo: { name: CLIENT_NAME, version: CLIENT_VERSION },
        });
        this.#notify("initialized", {});
        this.#ready = true;
        return this;
      } catch (err) {
        this.#startPromise = null;
        throw err;
      }
    })();
    return this.#startPromise;
  }

  /** App Server を停止する。 */
  async stop(): Promise<void> {
    this.#ready = false;
    this.#startPromise = null;
    // 進行中の pending と turn をすべて reject する
    for (const [, p] of this.#pending) {
      clearTimeout(p.timer);
      p.reject(new Error("CodexClient stopped"));
    }
    this.#pending.clear();
    for (const [, t] of this.#activeTurns) {
      this.#settleTurn(t, () => t.rejectAsk(new Error("CodexClient stopped")));
    }
    this.#activeTurns.clear();
    await this.#transport.stop();
    this.#buffer.reset();
  }

  /**
   * account/read で認証状態を取得する。
   *
   * 実機スキーマ（codex-cli 0.128.0、v2/GetAccountResponse）：
   *   { account: Account | null, requiresOpenaiAuth: boolean }
   *   Account = { type: "apiKey" } | { type: "chatgpt", email, planType } | { type: "amazonBedrock" }
   *
   * 本メソッドは AccountInfo に展開して返す。account が null（未ログイン）なら
   * authMode は null。
   */
  async getAccount(): Promise<AccountInfo> {
    const raw = (await this.#request("account/read", { refreshToken: false })) as {
      account?: { type?: string; email?: string; planType?: string } | null;
      requiresOpenaiAuth?: boolean;
    };
    const account = raw.account ?? null;
    const type = account?.type;
    const authMode: AccountInfo["authMode"] =
      type === "apiKey" || type === "chatgpt" || type === "amazonBedrock" ? type : null;
    const info: AccountInfo = { authMode };
    if (account && typeof account.email === "string") {
      info.email = account.email;
    }
    if (account && typeof account.planType === "string") {
      info.planType = account.planType;
    }
    if (typeof raw.requiresOpenaiAuth === "boolean") {
      info.requiresOpenaiAuth = raw.requiresOpenaiAuth;
    }
    return info;
  }

  /** thread/start で新規スレッドを作成し、threadId を返す。 */
  async startThread(opts: StartThreadOptions): Promise<{ threadId: string }> {
    const params: Record<string, JsonValue> = {
      baseInstructions: opts.baseInstructions,
    };
    if (opts.developerInstructions !== undefined) {
      params["developerInstructions"] = opts.developerInstructions;
    }
    if (opts.model !== undefined) {
      params["model"] = opts.model;
    }
    if (opts.serviceTier !== undefined) {
      params["serviceTier"] = opts.serviceTier;
    }
    if (opts.ephemeral !== undefined) {
      params["ephemeral"] = opts.ephemeral;
    }
    // 実機スキーマ（v2/ThreadStartResponse）: { thread: Thread, model, modelProvider, ... }
    // threadId は response.thread.id にある（トップレベルの threadId フィールドは存在しない）
    const result = (await this.#request("thread/start", params)) as {
      thread?: { id?: string };
    };
    const threadId = result.thread?.id;
    if (typeof threadId !== "string") {
      throw new Error(`thread/start returned no thread.id: ${JSON.stringify(result)}`);
    }
    return { threadId };
  }

  /**
   * 1 ターン実行する。
   *
   * フロー：
   *   1. turn/start リクエストを送信し、応答（TurnStartResponse: {turn: {id, ...}}）から turnId を取得
   *   2. activeTurns に turnId を記録、onStarted を呼び出す
   *   3. item/agentMessage/delta 通知を集約しつつ onDelta を呼び出す
   *   4. turn/completed 通知で resolve、turn.status === "failed" で reject
   *   5. AbortSignal が abort されたら turn/interrupt を発行
   *
   * 同一 threadId に対する並列 ask() は拒否する（spec §6.7：1 スレッド 1 ターンが原則）。
   *
   * 設計の正本: dev-docs/2026-05-05-Agent-Aiko-Codex-design.md v0.3.1 §6.1 / §6.7
   */
  async ask(opts: AskOptions): Promise<AskResult> {
    if (this.#activeTurns.has(opts.threadId)) {
      throw new Error(
        `thread ${opts.threadId} already has an in-flight turn (one turn per thread is the contract)`
      );
    }
    if (opts.abortSignal?.aborted === true) {
      throw new Error("aborted before turn started");
    }

    const params: Record<string, JsonValue> = {
      threadId: opts.threadId,
      input: [{ type: "text", text: opts.text, text_elements: [] }],
    };

    // turn/start リクエスト送信前に activeTurns プレースホルダを置く。
    // notification が response より前に届くケースの保険。
    const placeholderId = `__pending__${this.#nextId}`;
    const askPromise = new Promise<AskResult>((resolve, reject) => {
      const turn: ActiveTurn = {
        threadId: opts.threadId,
        turnId: placeholderId,
        resolveAsk: resolve,
        rejectAsk: reject,
        buffer: [],
        abortListener: null,
        abortSignal: opts.abortSignal,
        onStarted: opts.onStarted,
        onDelta: opts.onDelta,
        settled: false,
      };
      this.#activeTurns.set(opts.threadId, turn);

      if (opts.abortSignal) {
        const listener = (): void => {
          if (!turn.turnId.startsWith("__pending__")) {
            this.interrupt(turn.threadId, turn.turnId).catch(() => {
              // interrupt 失敗は無視（後続の turn/completed でハンドリング）
            });
          }
        };
        turn.abortListener = listener;
        opts.abortSignal.addEventListener("abort", listener);
      }
    });
    // ask() が turn/start await で throw して返る場合、askPromise が
    // 呼び出し側に到達せず orphan 化する。後段で handleExit などが
    // turn.rejectAsk を呼ぶと unhandledRejection になるため、ここで
    // 念のため handler を 1 つ attach しておく（throw 経路は別チェーンで
    // 呼び出し側に伝わるため、この swallow は実害がない）。
    askPromise.catch(() => undefined);

    // turn/start request → response.turn.id で turnId を確定。
    // onResolve コールバックで同期的に turn.turnId を更新する。これにより、
    // 同一 chunk に turn/start response＋item/.../delta＋turn/completed が
    // 含まれていても、各 notification が確定 turnId を見られる。
    try {
      await this.#request("turn/start", params, (result) => {
        const r = result as { turn: { id: string } };
        const turnId = r.turn.id;
        const turn = this.#activeTurns.get(opts.threadId);
        if (turn !== undefined && turn.turnId === placeholderId) {
          turn.turnId = turnId;
          turn.onStarted?.(turnId);
          if (turn.abortSignal?.aborted === true) {
            this.interrupt(opts.threadId, turnId).catch(() => {
              // 失敗は turn/completed の流れで救う
            });
          }
        }
      });
    } catch (err) {
      const turn = this.#activeTurns.get(opts.threadId);
      if (turn !== undefined) {
        this.#activeTurns.delete(opts.threadId);
        if (turn.abortListener && turn.abortSignal) {
          turn.abortSignal.removeEventListener("abort", turn.abortListener);
        }
      }
      throw err;
    }

    return askPromise;
  }

  /** 進行中ターンを turn/interrupt で打ち切る。 */
  async interrupt(threadId: string, turnId: string): Promise<void> {
    await this.#request("turn/interrupt", { threadId, turnId });
  }

  /**
   * 内部：JSON-RPC リクエストを送信し、応答を待つ。
   * @param onResolve 応答受信時に Promise resolve より前に同期実行される副作用フック。
   */
  async #request(
    method: string,
    params: JsonValue,
    onResolve?: (value: JsonValue) => void
  ): Promise<JsonValue> {
    const id = this.#nextId++;
    const req: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    const timeoutMs = this.#options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    return new Promise<JsonValue>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`JSON-RPC request '${method}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      const pending: PendingRequest = { resolve, reject, timer };
      if (onResolve !== undefined) {
        pending.onResolve = onResolve;
      }
      this.#pending.set(id, pending);
      try {
        this.#transport.write(encode(req));
      } catch (err) {
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /** 内部：JSON-RPC 通知を送信する（応答を待たない）。 */
  #notify(method: string, params: JsonValue): void {
    const note: JsonRpcNotification = { jsonrpc: "2.0", method, params };
    this.#transport.write(encode(note));
  }

  /** stdout の chunk を行単位に切り、各行を JSON-RPC メッセージとして処理する。 */
  #handleChunk(chunk: Buffer): void {
    for (const line of this.#buffer.push(chunk)) {
      let msg: IncomingMessage;
      try {
        msg = parseIncoming(line);
      } catch (err) {
        this.#options.onLog?.(`[parse error] ${(err as Error).message}: ${line}`);
        continue;
      }
      if ("id" in msg) {
        this.#handleResponse(msg);
      } else {
        this.#handleNotification(msg);
      }
    }
  }

  #handleResponse(msg: JsonRpcResponse): void {
    const id = typeof msg.id === "number" ? msg.id : Number(msg.id);
    const pending = this.#pending.get(id);
    if (pending === undefined) {
      this.#options.onLog?.(`[unexpected response] id=${msg.id}`);
      return;
    }
    this.#pending.delete(id);
    clearTimeout(pending.timer);
    if ("error" in msg) {
      pending.reject(new Error(`JSON-RPC error ${msg.error.code}: ${msg.error.message}`));
    } else {
      // 同期コールバックを先に実行して、後続の同チャンク内 notification が
      // 更新後の activeTurn 状態を見られるようにする
      pending.onResolve?.(msg.result);
      pending.resolve(msg.result);
    }
  }

  #handleNotification(msg: JsonRpcNotification): void {
    const params = (msg.params ?? {}) as Record<string, JsonValue>;
    switch (msg.method) {
      case "turn/started": {
        // 通常は turn/start レスポンスで既に turnId 確定済みなので、ここでは検証のみ。
        // ただし notification が response より先に届くケースに備えて、まだプレースホルダなら埋める。
        const threadId = params["threadId"] as string;
        const turnObj = params["turn"] as { id?: string } | undefined;
        const turnId = turnObj?.id;
        if (typeof turnId === "string") {
          const turn = this.#activeTurns.get(threadId);
          if (turn !== undefined && turn.turnId.startsWith("__pending__")) {
            turn.turnId = turnId;
            turn.onStarted?.(turnId);
          }
        }
        break;
      }
      case "item/agentMessage/delta": {
        const threadId = params["threadId"] as string;
        const turnId = params["turnId"] as string | undefined;
        const delta = (params["delta"] ?? "") as string;
        const turn = this.#activeTurns.get(threadId);
        if (turn === undefined || turn.settled) break;
        // turnId が確定済みかつ通知の turnId と一致しないチャンクは破棄（古い／別ターンの混入を防止）
        if (typeof turnId === "string" && !turn.turnId.startsWith("__pending__") && turn.turnId !== turnId) {
          this.#options.onLog?.(`[stale delta] thread=${threadId} expected=${turn.turnId} got=${turnId}`);
          break;
        }
        turn.buffer.push(delta);
        turn.onDelta?.(delta);
        break;
      }
      case "turn/completed": {
        const threadId = params["threadId"] as string;
        const turnObj = params["turn"] as
          | { id?: string; status?: string; error?: { message?: string } | null }
          | undefined;
        const completedTurnId = turnObj?.id;
        const turn = this.#activeTurns.get(threadId);
        if (turn === undefined || turn.settled) break;
        // turnId 不一致は別ターンの完了通知。無視する（古い／別ターンの誤解決を防止）
        if (
          typeof completedTurnId === "string" &&
          !turn.turnId.startsWith("__pending__") &&
          turn.turnId !== completedTurnId
        ) {
          this.#options.onLog?.(`[stale completion] thread=${threadId} expected=${turn.turnId} got=${completedTurnId}`);
          break;
        }
        const status = turnObj?.status;
        if (status === "inProgress") {
          // 終端ステータスではない。完了とみなさず保留（実装上ありえないが防御的に）
          this.#options.onLog?.(`[unexpected status] turn/completed with status=inProgress, ignoring`);
          break;
        }
        if (status === "failed") {
          const message = turnObj?.error?.message ?? "turn failed";
          this.#settleTurn(turn, () => turn.rejectAsk(new Error(`turn failed: ${message}`)));
          this.#activeTurns.delete(threadId);
          break;
        }
        const text = turn.buffer.join("");
        const result: AskResult = { text, turnId: turn.turnId };
        if (status === "interrupted" || turn.abortSignal?.aborted === true) {
          result.aborted = true;
        }
        this.#settleTurn(turn, () => turn.resolveAsk(result));
        this.#activeTurns.delete(threadId);
        break;
      }
      default:
        // 未ハンドリングの notification は黙って無視（onLog 経由で観察可）
        break;
    }
  }

  /** ActiveTurn を 1 度だけ resolve/reject し、abort listener を解除するヘルパ。 */
  #settleTurn(turn: ActiveTurn, settler: () => void): void {
    if (turn.settled) return;
    turn.settled = true;
    if (turn.abortListener && turn.abortSignal) {
      turn.abortSignal.removeEventListener("abort", turn.abortListener);
    }
    settler();
  }

  #handleExit(code: number | null, _signal: NodeJS.Signals | null): void {
    this.#ready = false;
    this.#startPromise = null;
    // 部分的な JSON が次のプロセス起動時の最初のチャンクと結合して
    // パースエラーになるのを防ぐため、buffer をクリアする
    this.#buffer.reset();
    const err = new Error(`codex app-server exited unexpectedly (code=${code ?? "null"})`);
    for (const [, p] of this.#pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.#pending.clear();
    for (const [, t] of this.#activeTurns) {
      this.#settleTurn(t, () => t.rejectAsk(err));
    }
    this.#activeTurns.clear();
  }
}
