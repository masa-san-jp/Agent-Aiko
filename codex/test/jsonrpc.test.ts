// node:test ベースの jsonrpc レイヤーの単体テスト。
//
//   node --import tsx --test test/jsonrpc.test.ts
//
// 設計の正本: 非公開設計メモ v0.3.1 §6.1

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { LineBuffer, encode, parseIncoming } from "../src/codex-client/jsonrpc.js";

describe("LineBuffer", () => {
  it("splits chunks at newlines", () => {
    const buf = new LineBuffer();
    const lines = buf.push("hello\nworld\n");
    assert.deepEqual(lines, ["hello", "world"]);
  });

  it("buffers partial lines across chunks", () => {
    const buf = new LineBuffer();
    assert.deepEqual(buf.push("hel"), []);
    assert.deepEqual(buf.push("lo\nworl"), ["hello"]);
    assert.deepEqual(buf.push("d\n"), ["world"]);
  });

  it("ignores empty lines", () => {
    const buf = new LineBuffer();
    assert.deepEqual(buf.push("a\n\n\nb\n"), ["a", "b"]);
  });
});

describe("parseIncoming", () => {
  it("parses success response", () => {
    const msg = parseIncoming('{"jsonrpc":"2.0","id":42,"result":{"ok":true}}');
    assert.equal("id" in msg && msg.id, 42);
    assert.deepEqual("result" in msg && msg.result, { ok: true });
  });

  it("parses error response", () => {
    const msg = parseIncoming('{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"bad"}}');
    assert.ok("error" in msg);
    if ("error" in msg) {
      assert.equal(msg.error.code, -32601);
      assert.equal(msg.error.message, "bad");
    }
  });

  it("parses notification", () => {
    const msg = parseIncoming('{"jsonrpc":"2.0","method":"turn/started","params":{"turnId":"t1"}}');
    assert.ok(!("id" in msg));
    assert.equal(msg.method, "turn/started");
  });

  it("rejects malformed payload", () => {
    assert.throws(() => parseIncoming("[]"));
    assert.throws(() => parseIncoming('{"jsonrpc":"2.0"}'));
  });
});

describe("encode", () => {
  it("appends newline", () => {
    const wire = encode({ jsonrpc: "2.0", id: 1, method: "ping" });
    assert.equal(wire.endsWith("\n"), true);
    assert.deepEqual(JSON.parse(wire.trim()), { jsonrpc: "2.0", id: 1, method: "ping" });
  });
});
