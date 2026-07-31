#!/usr/bin/env node
// `aiko` の実体。設計書 §4.4。

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { run } from "./run.js";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as { version: string };

run(process.argv.slice(2), pkg.version, {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
})
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    process.stderr.write(`aiko: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
