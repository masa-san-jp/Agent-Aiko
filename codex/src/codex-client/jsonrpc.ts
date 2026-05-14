// JSON-RPC 2.0 framing layer.
//
// codex app-server は stdio トランスポートで 1 行 1 メッセージの JSON を喋る。
// 設計の正本: Agent-Lab/Agent-team/agents/aiko/dev-docs/2026-05-05-Agent-Aiko-Codex-design.md v0.3.1 §6.1
//
// Codex 公式仕様に準拠し、ワイヤ上は jsonrpc: "2.0" ヘッダを省略する形でも
// 受け付けるが、本クライアントは明示的に付与して送信する。

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: JsonValue;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: JsonValue;
}

export interface JsonRpcSuccessResponse {
  jsonrpc: "2.0";
  id: number | string;
  result: JsonValue;
}

export interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  id: number | string;
  error: { code: number; message: string; data?: JsonValue };
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

export type IncomingMessage = JsonRpcResponse | JsonRpcNotification;

/** codex app-server からの 1 行 JSON をパースする。形が崩れていたら throw する。 */
export function parseIncoming(line: string): IncomingMessage {
  const obj = JSON.parse(line) as Record<string, unknown>;
  if (typeof obj !== "object" || obj === null) {
    throw new Error("invalid JSON-RPC payload: not an object");
  }
  if (typeof obj["method"] === "string") {
    // notification or server-initiated request — 本クライアントは notification として扱う
    return {
      jsonrpc: "2.0",
      method: obj["method"],
      ...(obj["params"] !== undefined ? { params: obj["params"] as JsonValue } : {}),
    };
  }
  if ("id" in obj && (typeof obj["id"] === "number" || typeof obj["id"] === "string")) {
    if ("error" in obj && obj["error"] != null) {
      const err = obj["error"] as { code: number; message: string; data?: JsonValue };
      return {
        jsonrpc: "2.0",
        id: obj["id"] as number | string,
        error: err,
      };
    }
    return {
      jsonrpc: "2.0",
      id: obj["id"] as number | string,
      result: (obj["result"] ?? null) as JsonValue,
    };
  }
  throw new Error("invalid JSON-RPC payload: neither response nor notification");
}

/** stdout のバイトストリームを行単位の JSON-RPC メッセージに変換するバッファ。 */
export class LineBuffer {
  #buf = "";

  /** 受信したチャンクを取り込み、完成した行（改行で区切られた文字列）を返す。 */
  push(chunk: Buffer | string): string[] {
    this.#buf += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    const lines: string[] = [];
    let idx = this.#buf.indexOf("\n");
    while (idx !== -1) {
      const line = this.#buf.slice(0, idx).trim();
      this.#buf = this.#buf.slice(idx + 1);
      if (line.length > 0) {
        lines.push(line);
      }
      idx = this.#buf.indexOf("\n");
    }
    return lines;
  }

  /** 残バッファを破棄する（プロセス終了時用）。 */
  reset(): void {
    this.#buf = "";
  }
}

/** JSON-RPC リクエスト／通知をワイヤフォーマットの 1 行文字列に整形する。 */
export function encode(message: JsonRpcRequest | JsonRpcNotification): string {
  return `${JSON.stringify(message)}\n`;
}
