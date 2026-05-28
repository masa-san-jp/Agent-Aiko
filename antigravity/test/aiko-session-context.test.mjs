// aiko-session-context.test.mjs — tests for SessionStart hook
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';

const SCRIPT = new URL('../scripts/aiko-session-context.mjs', import.meta.url).pathname;

function setupAikoHome(base) {
  const home = join(base, '.aiko');
  mkdirSync(join(home, 'persona', 'origin'), { recursive: true });
  mkdirSync(join(home, 'persona', 'override'), { recursive: true });
  mkdirSync(join(home, 'persona', 'overrides'), { recursive: true });
  mkdirSync(join(home, 'capability', 'rules'), { recursive: true });
  writeFileSync(join(home, 'persona', 'origin', 'persona.md'), 'アイコ origin persona');
  writeFileSync(join(home, 'persona', 'aiko-origin.md'), 'アイコ origin persona');
  writeFileSync(join(home, 'persona', 'INVARIANTS.md'), '## 不変条項\n- アイコであり続ける');
  writeFileSync(join(home, 'persona', 'override', 'persona.md'), 'アイコ override persona');
  writeFileSync(join(home, 'mode'), 'origin');
  writeFileSync(join(home, 'active-persona'), '');
  writeFileSync(join(home, 'user.md'), '- 名前: テストユーザー');
  return home;
}

function run(aikoHome, { input = '{}' } = {}) {
  const result = spawnSync('node', [SCRIPT], {
    env: { ...process.env, AIKO_HOME: aikoHome },
    input,
    encoding: 'utf8',
    timeout: 10000,
  });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status ?? 0 };
}

let tmpBase;
test.beforeEach(() => { tmpBase = mkdtempSync(join(tmpdir(), 'aiko-hook-test-')); });
test.afterEach(() => { rmSync(tmpBase, { recursive: true, force: true }); });

// AG-HOOK-S-001: 正常な ~/.aiko/ → stdout が parse 可能
test('AG-HOOK-S-001: valid ~/.aiko produces parseable JSON', () => {
  const home = setupAikoHome(tmpBase);
  const r = run(home);
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  const parsed = JSON.parse(r.stdout);
  assert.ok(parsed.hookSpecificOutput?.additionalContext);
});

// AG-HOOK-S-002: additionalContext に INVARIANTS が含まれる
test('AG-HOOK-S-002: additionalContext contains INVARIANTS', () => {
  const home = setupAikoHome(tmpBase);
  const r = run(home);
  const parsed = JSON.parse(r.stdout);
  assert.ok(parsed.hookSpecificOutput.additionalContext.includes('不変条項'));
});

// AG-HOOK-S-003: active persona 選択時 prefix が Aiko-review
test('AG-HOOK-S-003: named persona prefix is Aiko-<name>', () => {
  const home = setupAikoHome(tmpBase);
  mkdirSync(join(home, 'persona', 'overrides', 'review'), { recursive: true });
  writeFileSync(join(home, 'persona', 'overrides', 'review', 'persona.md'), 'review persona');
  writeFileSync(join(home, 'mode'), 'override');
  writeFileSync(join(home, 'active-persona'), 'review');
  const r = run(home);
  const parsed = JSON.parse(r.stdout);
  assert.ok(parsed.systemMessage?.includes('Aiko-review'), `got: ${parsed.systemMessage}`);
  assert.ok(parsed.hookSpecificOutput.additionalContext.includes('Aiko-review:'));
});

// AG-HOOK-S-004: 未初期化 → exit 0、systemMessage あり
test('AG-HOOK-S-004: uninitialized returns exit 0 with systemMessage', () => {
  const uninitHome = join(tmpBase, 'empty');
  const r = run(uninitHome);
  assert.equal(r.status, 0, 'should not exit non-zero');
  const parsed = JSON.parse(r.stdout);
  assert.ok(parsed.systemMessage, 'should have systemMessage');
});

// AG-HOOK-S-005: stdout に JSON 以外が混ざらない
test('AG-HOOK-S-005: stdout is pure JSON', () => {
  const home = setupAikoHome(tmpBase);
  const r = run(home);
  assert.doesNotThrow(() => JSON.parse(r.stdout), 'stdout must be valid JSON');
});
