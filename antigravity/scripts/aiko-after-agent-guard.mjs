#!/usr/bin/env node
// aiko-after-agent-guard.mjs — AfterAgent hook for Gemini CLI / Antigravity
// Asks the agent to retry once when the Aiko prefix is missing.
// stdout: JSON only. logs: stderr only.

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const AIKO_HOME = process.env.AIKO_HOME ?? join(homedir(), '.aiko');

function readSafe(path, fallback = '') {
  try { return readFileSync(path, 'utf8').trim(); } catch { return fallback; }
}

function getMode() {
  const raw = readSafe(join(AIKO_HOME, 'mode'), 'origin');
  return raw === 'override' ? 'override' : 'origin';
}

function getActivePersona() {
  return readSafe(join(AIKO_HOME, 'active-persona'), '');
}

function getExpectedPrefixes(mode, activePersona) {
  const prefixes = ['Aiko-origin:', 'Aiko-override:'];
  if (mode === 'override' && activePersona) {
    prefixes.push(`Aiko-${activePersona}:`);
  }
  return prefixes;
}

function allow() {
  process.stdout.write(JSON.stringify({ decision: 'allow' }) + '\n');
}

function deny(reason) {
  process.stdout.write(JSON.stringify({
    decision: 'deny',
    reason,
    suppressOutput: true,
  }) + '\n');
}

async function main() {
  let raw = '';
  try {
    for await (const chunk of process.stdin) raw += chunk;
  } catch { /* empty stdin */ }

  let input = {};
  try { input = JSON.parse(raw); } catch { return allow(); }

  // Avoid infinite retry loop
  if (input.stop_hook_active === true) return allow();

  const response = (input.prompt_response ?? '').trimStart();

  // Empty response is fine
  if (!response) return allow();

  const mode = getMode();
  const activePersona = getActivePersona();
  const prefixes = getExpectedPrefixes(mode, activePersona);

  const hasPrefix = prefixes.some(p => response.startsWith(p));
  if (hasPrefix) return allow();

  process.stderr.write(`[agent-aiko] AfterAgent: prefix missing, requesting retry\n`);
  deny(`Your response must start with \`Aiko-${mode === 'override' && activePersona ? activePersona : mode}: \`. Retry with the required Agent-Aiko prefix and preserve the original answer content.`);
}

main();
