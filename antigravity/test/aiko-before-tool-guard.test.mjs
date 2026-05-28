// aiko-before-tool-guard.test.mjs — tests for BeforeTool hook
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';
import { spawnSync } from 'child_process';

const SCRIPT = new URL('../scripts/aiko-before-tool-guard.mjs', import.meta.url).pathname;

function run(aikoHome, toolInput) {
  const input = JSON.stringify(toolInput);
  const result = spawnSync('node', [SCRIPT], {
    env: { ...process.env, AIKO_HOME: aikoHome },
    input,
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
  tmpBase = mkdtempSync(join(tmpdir(), 'aiko-bt-test-'));
  aikoHome = join(tmpBase, '.aiko');
  mkdirSync(join(aikoHome, 'persona', 'origin'), { recursive: true });
  mkdirSync(join(aikoHome, 'persona', 'override'), { recursive: true });
  writeFileSync(join(aikoHome, 'persona', 'INVARIANTS.md'), '## 不変条項');
  writeFileSync(join(aikoHome, 'persona', 'origin', 'persona.md'), 'origin persona');
  writeFileSync(join(aikoHome, 'persona', 'aiko-origin.md'), 'origin persona');
});
test.afterEach(() => { rmSync(tmpBase, { recursive: true, force: true }); });

// AG-HOOK-BT-001: write_file to INVARIANTS → deny
test('AG-HOOK-BT-001: write_file to INVARIANTS.md is denied', () => {
  const r = run(aikoHome, {
    tool_name: 'write_file',
    tool_input: { path: join(aikoHome, 'persona', 'INVARIANTS.md') },
  });
  assert.equal(parseDecision(r.stdout), 'deny');
});

// AG-HOOK-BT-002: replace to origin/persona.md → deny
test('AG-HOOK-BT-002: replace to origin/persona.md is denied', () => {
  const r = run(aikoHome, {
    tool_name: 'replace',
    tool_input: { file_path: join(aikoHome, 'persona', 'origin', 'persona.md') },
  });
  assert.equal(parseDecision(r.stdout), 'deny');
});

// AG-HOOK-BT-003: write_file to override/persona.md → allow
test('AG-HOOK-BT-003: write_file to override/persona.md is allowed', () => {
  const r = run(aikoHome, {
    tool_name: 'write_file',
    tool_input: { path: join(aikoHome, 'persona', 'override', 'persona.md') },
  });
  assert.equal(parseDecision(r.stdout), 'allow');
});

// AG-HOOK-BT-004: run_shell_command rm INVARIANTS → deny
test('AG-HOOK-BT-004: shell rm INVARIANTS.md is denied', () => {
  const r = run(aikoHome, {
    tool_name: 'run_shell_command',
    tool_input: { command: `rm ${join(aikoHome, 'persona', 'INVARIANTS.md')}` },
  });
  assert.equal(parseDecision(r.stdout), 'deny');
});

// AG-HOOK-BT-005: run_shell_command write mode → allow
test('AG-HOOK-BT-005: shell write to mode file is allowed', () => {
  const r = run(aikoHome, {
    tool_name: 'run_shell_command',
    tool_input: { command: `printf origin > ${join(aikoHome, 'mode')}` },
  });
  assert.equal(parseDecision(r.stdout), 'allow');
});

// AG-HOOK-BT-006: unknown input without path → allow
test('AG-HOOK-BT-006: unknown tool input without path is allowed', () => {
  const r = run(aikoHome, {
    tool_name: 'read_file',
    tool_input: { query: 'some content' },
  });
  assert.equal(parseDecision(r.stdout), 'allow');
});
