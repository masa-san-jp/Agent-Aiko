// 直接 import 禁止テスト。SDK 設計書 §1 と §23 R3 の完了基準。
//
// 「Adapter、MCP Server、CLI は core や binder を直接呼び出してはならない」を、
// 人が覚えておく規約ではなく落ちる検査にする。**規約は破られる。**
//
// 型だけの import も対象にする。型のためだけに binder を参照していると、
// binder の型を変えた瞬間に利用側が壊れる＝依存は残っている。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGES = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** 移行が済んだ側。**フェーズごとにここへ足す。** 足し忘れると検査が広がらず、
 *  移行したつもりの package が野放しになる。 */
const MIGRATED = ["mcp-server", "adapter-claude-code", "adapter-codex", "cli"];

/** まだ SDK を通していない側。R5 まで終わったので空。
 *  空でなくなる（新しい利用側が増える）ときは、ここに書いてから移行する。 */
const NOT_YET_MIGRATED: string[] = [];

/** 依存を組み立てる入口。実体（Repository / Provider）の生成はここの仕事で、
 *  人格を適用する処理ではない。**binder はここでも禁止**。 */
const COMPOSITION_ROOTS = new Set(["cli.ts", "server.ts", "resolve.ts"]);

/** どこからも直接触ってはいけないもの。 */
const FORBIDDEN_EVERYWHERE = ["@agent-aiko/binder"];

/** 入口でだけ許すもの（実体の生成に要る）。 */
const FORBIDDEN_OUTSIDE_ROOTS = ["@agent-aiko/core", "@agent-aiko/user-context"];

// capability-registry は対象に入れていない。§16.1 の Tool 対応表に
// `aiko.report_capabilities` が無く、SDK 側に能力解決の入口が定義されていないため。
// 禁止すると仕様に無い API を SDK へ足すことになる。§6.1 に入口が増えたら対象へ移す。

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function importsOf(file: string): string[] {
  const text = readFileSync(file, "utf8");
  return [...text.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1] as string);
}

test("Adapter・MCP Server・CLI は binder を直接 import しない", () => {
  const offenders: string[] = [];
  for (const pkg of MIGRATED) {
    const src = join(PACKAGES, pkg, "src");
    for (const file of sourceFiles(src)) {
      for (const spec of importsOf(file)) {
        if (FORBIDDEN_EVERYWHERE.includes(spec)) {
          offenders.push(`${relative(PACKAGES, file)} -> ${spec}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], "binder への依存が残っている（型のみの import も含む）");
});

test("人格を適用する処理は core / user-context を直接 import しない（入口を除く）", () => {
  const offenders: string[] = [];
  for (const pkg of MIGRATED) {
    const src = join(PACKAGES, pkg, "src");
    for (const file of sourceFiles(src)) {
      const base = file.split("/").pop() as string;
      if (COMPOSITION_ROOTS.has(base)) continue;
      for (const spec of importsOf(file)) {
        if (FORBIDDEN_OUTSIDE_ROOTS.includes(spec)) {
          offenders.push(`${relative(PACKAGES, file)} -> ${spec}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], "入口以外から core / user-context を直接見ている");
});

test("未移行の package が残っていない（R5 まで完了）", () => {
  assert.deepEqual(NOT_YET_MIGRATED, []);
});

test("入口として許すファイルを絞っている（許可リストが広がっていない）", () => {
  // 「入口だから」で例外を増やすと、この検査は意味を失う。増やすときは
  // ここも直すことになるので、増やしたことが差分に残る。
  // resolve.ts は R5 で足した CLI の組み立て口。増やすときは必ずこの行が変わる。
  assert.deepEqual([...COMPOSITION_ROOTS].sort(), ["cli.ts", "resolve.ts", "server.ts"]);
});
