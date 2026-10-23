import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export interface LocalHttpOptions {
  /** Shared local bearer credential; generate with randomBytes(32).toString("base64url"). */
  token: string;
  /** Phase 1 remains loopback-only; remote OAuth is a separate phase. */
  port?: number;
  maxSessions?: number;
  idleTimeoutMs?: number;
}

/** Each MCP session owns its server and ProfileStore; there is no shared client state. */
export async function startLocalHttpServer(
  createServerForSession: () => McpServer,
  options: LocalHttpOptions,
): Promise<{ url: URL; close: () => Promise<void> }> {
  const port = options.port ?? 3000;
  const maxSessions = options.maxSessions ?? 32;
  const idleTimeoutMs = options.idleTimeoutMs ?? 15 * 60_000;
  if (typeof options.token !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(options.token)) {
    throw new Error("AIKO_HTTP_TOKEN must be a random base64url token of 43–128 characters");
  }
  const tokenHash = createHash("sha256").update(options.token).digest();
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid HTTP port");
  if (!Number.isInteger(maxSessions) || maxSessions < 1) throw new Error("Invalid session limit");
  if (!Number.isFinite(idleTimeoutMs) || idleTimeoutMs < 1) throw new Error("Invalid idle timeout");

  type Session = { server: McpServer; transport: StreamableHTTPServerTransport; touched: number; active: number };
  const sessions = new Map<string, Session>();
  let authority = "";
  let closing = false;
  function reply(res: ServerResponse, status: number, message: string): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: message }));
  }
  async function remove(id: string): Promise<void> {
    const session = sessions.get(id);
    if (!session) return;
    sessions.delete(id);
    await session.server.close();
  }
  async function expire(): Promise<void> {
    const now = Date.now();
    await Promise.all([...sessions].filter(([, s]) => s.active === 0 && now - s.touched >= idleTimeoutMs)
      .map(([id]) => remove(id)));
  }
  const http = createServer((req, res) => {
    void (async () => {
      // Validate before creating a session or exposing local persona/user data.
      if (req.headers.host !== authority ||
          (req.headers.origin !== undefined && req.headers.origin !== `http://${authority}`)) {
        reply(res, 403, "Forbidden host or origin");
        return;
      }
      if (req.url !== "/mcp") { reply(res, 404, "Not found"); return; }
      const authorization = req.headers.authorization;
      const bearer = typeof authorization === "string" ? /^Bearer ([A-Za-z0-9_-]{43,128})$/i.exec(authorization) : null;
      const authHeaders = req.rawHeaders.filter((_, i) => i % 2 === 0 && req.rawHeaders[i]?.toLowerCase() === "authorization").length;
      if (authHeaders !== 1 || !bearer || !timingSafeEqual(tokenHash, createHash("sha256").update(bearer[1]!).digest())) {
        res.setHeader("WWW-Authenticate", 'Bearer realm="aiko-local"');
        reply(res, 401, "Unauthorized");
        return;
      }
      if (closing) { reply(res, 503, "Server closing"); return; }
      if (req.method !== "POST" && req.method !== "DELETE") {
        res.setHeader("Allow", "POST, DELETE");
        reply(res, 405, "Method not allowed");
        return;
      }
      await expire();
      const supplied = req.headers["mcp-session-id"];
      if (supplied !== undefined && typeof supplied !== "string") {
        reply(res, 400, "Invalid session ID"); return;
      }
      let id = supplied;
      let session = id ? sessions.get(id) : undefined;
      if (supplied !== undefined && !session) { reply(res, 404, "Unknown session"); return; }
      if (!session) {
        if (req.method !== "POST") { reply(res, 400, "Session required"); return; }
        if (sessions.size >= maxSessions) { reply(res, 503, "Session limit reached"); return; }
        id = randomUUID();
        const sessionId = id;
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => sessionId,
          enableJsonResponse: true,
          maxRequestBodySize: 1024 * 1024,
        });
        const server = createServerForSession();
        session = { server, transport, touched: Date.now(), active: 0 };
        sessions.set(id, session);
        try {
          // SDK's HTTP accessor types include undefined; its Transport optional
          // properties omit it under exactOptionalPropertyTypes.
          await server.connect(transport as Transport);
          const onclose = transport.onclose;
          transport.onclose = () => { sessions.delete(sessionId); onclose?.(); };
        } catch (error) { await remove(id); throw error; }
      }
      const currentId = id as string;
      session.active += 1;
      try {
        await session.transport.handleRequest(req, res);
      } finally {
        session.active -= 1;
        session.touched = Date.now();
        // Invalid initialize requests must not consume a session slot.
        if (!session.transport.sessionId) await remove(currentId);
      }
    })().catch(() => {
      if (!res.headersSent) reply(res, 500, "Internal server error");
      else if (!res.writableEnded) res.end();
    });
  });
  http.requestTimeout = 30_000;
  http.headersTimeout = 10_000;
  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(port, "127.0.0.1", () => { http.off("error", reject); resolve(); });
  });
  const address = http.address();
  if (!address || typeof address === "string") throw new Error("HTTP address unavailable");
  authority = `127.0.0.1:${address.port}`;
  const timer = setInterval(() => { void expire().catch(() => {}); }, Math.min(idleTimeoutMs, 60_000));
  timer.unref();
  return {
    url: new URL(`http://${authority}/mcp`),
    close: async () => {
      closing = true;
      clearInterval(timer);
      const stopped = new Promise<void>((resolve, reject) => http.close((err) => err ? reject(err) : resolve()));
      await Promise.allSettled([...sessions.keys()].map(remove));
      http.closeAllConnections();
      await stopped;
    },
  };
}
