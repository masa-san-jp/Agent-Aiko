#!/usr/bin/env node
// aiko-before-tool-guard.mjs — BeforeTool hook for Gemini CLI / Antigravity
// Blocks direct edits to Agent-Aiko protected files.
// stdout: JSON only. logs: stderr only.

import { join } from 'path';
import { homedir } from 'os';

const AIKO_HOME = process.env.AIKO_HOME ?? join(homedir(), '.aiko');
const HOME = process.env.HOME ?? homedir();

const PROTECTED_PATHS = [
  join(AIKO_HOME, 'persona', 'origin', 'persona.md'),
  join(AIKO_HOME, 'persona', 'aiko-origin.md'),
  join(AIKO_HOME, 'persona', 'INVARIANTS.md'),
  join(AIKO_HOME, 'INVARIANTS.md'),
  // legacy project-local paths
  '.claude/aiko/persona/origin/persona.md',
  '.claude/aiko/persona/aiko-origin.md',
  '.claude/aiko/persona/INVARIANTS.md',
];

const PROTECTED_PREFIXES = [
  join(AIKO_HOME, 'persona', 'origin') + '/',
];

const PATH_KEYS = ['path', 'file_path', 'filepath', 'absolute_path', 'target_file'];

const SHELL_INVARIANTS_DENY = [
  /[~$].*\.aiko\/persona\/origin\/persona\.md/,
  /\.claude\/aiko\/persona\/origin\/persona\.md/,
];
const SHELL_DESTRUCTIVE_OPS = /[>|;`]|sed\s+-i|perl\s+-pi|\brm\b|\bmv\b|\bcp\b|\btee\b/;
const SHELL_PROTECTED_TERMS = [/INVARIANTS\.md/, /aiko-origin\.md/];

function isProtectedPath(p) {
  if (!p) return false;
  const normalized = p.replace(/^~\//, `${HOME}/`).replace(/^\$HOME\//, `${HOME}/`);
  if (PROTECTED_PATHS.some(pp => normalized === pp)) return true;
  if (PROTECTED_PREFIXES.some(prefix => normalized.startsWith(prefix))) return true;
  // relative project-local legacy paths (suffix-match only for specific non-common names)
  const legacyRelPaths = [
    '.claude/aiko/persona/origin/persona.md',
    '.claude/aiko/persona/aiko-origin.md',
    '.claude/aiko/persona/INVARIANTS.md',
  ];
  if (legacyRelPaths.some(lp => normalized === lp || normalized.endsWith('/' + lp))) return true;
  return false;
}

const ABS_PROTECTED_ALWAYS = [
  join(AIKO_HOME, 'persona', 'origin', 'persona.md'),
  join(AIKO_HOME, 'persona', 'aiko-origin.md'),
];
const ABS_PROTECTED_DESTRUCTIVE = [
  join(AIKO_HOME, 'persona', 'INVARIANTS.md'),
  join(AIKO_HOME, 'INVARIANTS.md'),
];

function checkShellCommand(cmd) {
  if (!cmd) return false;
  const expanded = cmd.replace(/~\//g, `${HOME}/`).replace(/\$HOME\//g, `${HOME}/`);
  // Check original form (catches ~/ and $HOME/ literal patterns)
  for (const re of SHELL_INVARIANTS_DENY) {
    if (re.test(cmd)) return true;
  }
  if (SHELL_DESTRUCTIVE_OPS.test(expanded)) {
    // Block destructive operations against origin persona and INVARIANTS
    for (const p of ABS_PROTECTED_ALWAYS) {
      if (expanded.includes(p)) return true;
    }
    for (const termRe of SHELL_PROTECTED_TERMS) {
      if (termRe.test(expanded)) return true;
    }
    for (const p of ABS_PROTECTED_DESTRUCTIVE) {
      if (expanded.includes(p)) return true;
    }
  }
  return false;
}

function deny(reason) {
  process.stdout.write(JSON.stringify({
    decision: 'deny',
    reason,
    suppressOutput: true,
  }) + '\n');
}

function allow() {
  process.stdout.write(JSON.stringify({ decision: 'allow' }) + '\n');
}

async function main() {
  let raw = '';
  try {
    for await (const chunk of process.stdin) raw += chunk;
  } catch { /* empty stdin */ }

  let input = {};
  try { input = JSON.parse(raw); } catch { return allow(); }

  const toolName = input.tool_name ?? '';
  const toolInput = input.tool_input ?? {};

  if (toolName === 'run_shell_command') {
    const cmd = toolInput.command ?? '';
    if (checkShellCommand(cmd)) {
      process.stderr.write(`[agent-aiko] BeforeTool: blocked shell command\n`);
      return deny('Agent-Aiko protected file cannot be modified directly. Use /aiko-or or an override persona instead.');
    }
    return allow();
  }

  if (toolName === 'write_file' || toolName === 'replace') {
    for (const key of PATH_KEYS) {
      const p = toolInput[key];
      if (p && isProtectedPath(p)) {
        process.stderr.write(`[agent-aiko] BeforeTool: blocked write to ${p}\n`);
        return deny('Agent-Aiko protected file cannot be modified directly. Use /aiko-or or an override persona instead.');
      }
    }
    return allow();
  }

  return allow();
}

main();
