import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { acceptLocalAvatar } = require("../desktop/origin-check.js");

test("Origin がある接続は拒否し、無い接続は受ける", () => {
  assert.equal(acceptLocalAvatar({ origin: "https://evil.example" }), false);
  assert.equal(acceptLocalAvatar({ req: { headers: { origin: "http://localhost" } } }), false);
  assert.equal(acceptLocalAvatar({ origin: "" }), true);
  assert.equal(acceptLocalAvatar({}), true);
  assert.equal(acceptLocalAvatar({ req: { headers: {} } }), true);
});
