#!/usr/bin/env node
// `aiko` の実体。設計書 §4.4。

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { run } from "./run.js";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as { version: string };

// 対話できるときだけ ask を渡す。パイプ越しに configure を叩かれても、
// 黙って既定値の Profile を作らずに済む。
const interactive = process.stdin.isTTY === true && process.stdout.isTTY === true;
const rl = interactive
  ? createInterface({ input: process.stdin, output: process.stdout })
  : undefined;

run(process.argv.slice(2), pkg.version, {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
  ...(rl
    ? {
        ask: async (question: string, options?: { default?: string }) => {
          const suffix = options?.default ? ` [${options.default}]` : "";
          return (await rl.question(`${question}${suffix}: `)).trim();
        },
      }
    : {}),
})
  .then((code) => {
    process.exitCode = code;
  })
  .finally(() => rl?.close())
  .catch((err: unknown) => {
    process.stderr.write(`aiko: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
