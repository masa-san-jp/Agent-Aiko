// aiko-after-agent-guard.test.mjs — tests for AfterAgent hook
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';

const SCRIPT = new URL('../scripts/aiko-after-agent-guard.mjs', import.meta.url).pathname;

function run(aikoHome, input) {
  const result = spawnSync('node', [SCRIPT], {
    env: { ...process.env, AIKO_HOME: aikoHome },
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: 10000,
  });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status ?? 0 };
}

function parseDecision(stdout) {
  return JSON.parse(stdout).decision;
}

let tmpBase;
let aikoHome;
test.beforeEach(() => {
  tmpBase = mkdtempSync(join(tmpdir(), 'aiko-aa-test-'));
  aikoHome = join(tmpBase, '.aiko');
  mkdirSync(join(aikoHome, 'persona', 'origin'), { recursive: true });
  writeFileSync(join(aikoHome, 'mode'), 'origin');
  writeFileSync(join(aikoHome, 'active-persona'), '');
});
test.afterEach(() => { rmSync(tmpBase, { recursive: true, force: true }); });

// AG-HOOK-AA-001: Aiko-origin: prefix → allow
test('AG-HOOK-AA-001: response with Aiko-origin: prefix is allowed', () => {
  const r = run(aikoHome, { prompt_response: 'Aiko-origin: こんにちは！', stop_hook_active: false });
  assert.equal(parseDecision(r.stdout), 'allow');
});

// AG-HOOK-AA-002: no prefix → deny
test('AG-HOOK-AA-002: response without prefix is denied', () => {
  const r = run(aikoHome, { prompt_response: '了解しました。お手伝いします。', stop_hook_active: false });
  assert.equal(parseDecision(r.stdout), 'deny');
});

// AG-HOOK-AA-003: no prefix + stop_hook_active=true → allow (avoid infinite retry)
test('AG-HOOK-AA-003: no prefix with stop_hook_active=true is allowed', () => {
  const r = run(aikoHome, { prompt_response: '了解しました。お手伝いします。', stop_hook_active: true });
  assert.equal(parseDecision(r.stdout), 'allow');
});

// AG-HOOK-AA-004: empty response → allow
test('AG-HOOK-AA-004: empty response is allowed', () => {
  const r = run(aikoHome, { prompt_response: '', stop_hook_active: false });
  assert.equal(parseDecision(r.stdout), 'allow');
});
