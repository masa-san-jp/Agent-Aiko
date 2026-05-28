#!/usr/bin/env node
// aiko-session-context.mjs — SessionStart hook for Gemini CLI / Antigravity
// Reads ~/.aiko/ and injects Agent-Aiko runtime context as additionalContext.
// stdout: JSON only. logs: stderr only.

import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const AIKO_HOME = process.env.AIKO_HOME ?? join(homedir(), '.aiko');

function readSafe(path, fallback = '') {
  try { return readFileSync(path, 'utf8').trim(); } catch { return fallback; }
}

function isInitialized() {
  return existsSync(join(AIKO_HOME, 'persona', 'origin', 'persona.md')) ||
         existsSync(join(AIKO_HOME, 'persona', 'aiko-origin.md'));
}

function getMode() {
  const raw = readSafe(join(AIKO_HOME, 'mode'), 'origin');
  return raw === 'override' ? 'override' : 'origin';
}

function getActivePersona() {
  return readSafe(join(AIKO_HOME, 'active-persona'), '');
}

function getPrefix(mode, activePersona) {
  if (mode === 'override' && activePersona) return `Aiko-${activePersona}`;
  if (mode === 'override') return 'Aiko-override';
  return 'Aiko-origin';
}

function resolvePersonaPath(mode, activePersona) {
  if (mode === 'origin') {
    const p1 = join(AIKO_HOME, 'persona', 'origin', 'persona.md');
    const p2 = join(AIKO_HOME, 'persona', 'aiko-origin.md');
    return existsSync(p1) ? p1 : p2;
  }
  if (activePersona) {
    const p1 = join(AIKO_HOME, 'persona', 'overrides', activePersona, 'persona.md');
    const p2 = join(AIKO_HOME, 'persona', 'overrides', `${activePersona}.md`);
    return existsSync(p1) ? p1 : p2;
  }
  const p1 = join(AIKO_HOME, 'persona', 'override', 'persona.md');
  const p2 = join(AIKO_HOME, 'persona', 'aiko-override.md');
  return existsSync(p1) ? p1 : p2;
}

function getInvariants() {
  const p1 = join(AIKO_HOME, 'persona', 'INVARIANTS.md');
  const p2 = join(AIKO_HOME, 'INVARIANTS.md');
  if (existsSync(p1)) return readSafe(p1);
  if (existsSync(p2)) return readSafe(p2);
  return '';
}

function buildAdditionalContext() {
  const mode = getMode();
  const activePersona = getActivePersona();
  const prefix = getPrefix(mode, activePersona);
  const personaPath = resolvePersonaPath(mode, activePersona);

  const persona = readSafe(personaPath, '（人格ファイルが見つかりません）');
  const invariants = getInvariants();

  const rulesBasePath = join(AIKO_HOME, 'capability', 'rules', 'rules-base.md');
  const rules = readSafe(rulesBasePath);

  let personaRules = '';
  if (mode === 'override') {
    const rp = activePersona
      ? join(AIKO_HOME, 'persona', 'overrides', activePersona, 'rules.md')
      : join(AIKO_HOME, 'persona', 'override', 'rules.md');
    personaRules = readSafe(rp);
  }

  const userPath = (() => {
    if (mode === 'override' && activePersona) {
      const p = join(AIKO_HOME, 'persona', 'overrides', activePersona, 'user.md');
      if (existsSync(p)) return p;
    }
    if (mode === 'override') {
      const p = join(AIKO_HOME, 'persona', 'override', 'user.md');
      if (existsSync(p)) return p;
    }
    return join(AIKO_HOME, 'user.md');
  })();
  const user = readSafe(userPath);

  const lines = [
    '# Agent-Aiko Runtime Context',
    '',
    'あなたは AI エージェント「アイコ」です。',
    '',
    '# Runtime State',
    '',
    `- mode: ${mode}`,
    `- activePersona: ${activePersona}`,
    `- prefix: ${prefix}`,
    '',
  ];

  if (invariants) lines.push('# 不変条項（常に最優先で遵守）', '', invariants, '');
  lines.push('# 人格', '', persona, '');
  if (rules) lines.push('# 運用ルール', '', rules, '');
  if (personaRules) lines.push('# 人格固有ルール', '', personaRules, '');
  if (user) lines.push('# ユーザー', '', user, '');
  lines.push(
    '# 出力プレフィックス',
    '',
    `すべての応答冒頭に「${prefix}: 」を付けてください。`,
    '',
    '# INVARIANTS と人格が矛盾した場合',
    '',
    'INVARIANTS を優先します。',
  );

  return lines.join('\n');
}

async function main() {
  let _input = '';
  try {
    for await (const chunk of process.stdin) _input += chunk;
  } catch { /* stdin may be empty in tests */ }

  if (!isInitialized()) {
    process.stderr.write('[agent-aiko] ~/.aiko/ not initialized\n');
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        additionalContext: '# Agent-Aiko Runtime Context\n\nAgent-Aiko is not initialized. Ask the user to run `bash antigravity/scripts/install.sh`.',
      },
      systemMessage: 'Agent-Aiko is not initialized. Run the installer.',
      suppressOutput: false,
    }) + '\n');
    return;
  }

  try {
    const mode = getMode();
    const activePersona = getActivePersona();
    const prefix = getPrefix(mode, activePersona);
    const ctx = buildAdditionalContext();

    process.stderr.write(`[agent-aiko] context loaded: ${prefix}\n`);
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { additionalContext: ctx },
      systemMessage: `Agent-Aiko context loaded: ${prefix}`,
      suppressOutput: true,
    }) + '\n');
  } catch (err) {
    process.stderr.write(`[agent-aiko] error: ${err.message}\n`);
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { additionalContext: '# Agent-Aiko Runtime Context\n\n（コンテキストの読み込みに失敗しました）' },
      systemMessage: `Agent-Aiko context load failed: ${err.message}`,
      suppressOutput: false,
    }) + '\n');
  }
}

main();
