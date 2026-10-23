#!/usr/bin/env node
// aiko-before-tool-guard.mjs — BeforeTool hook for Gemini CLI / Antigravity
// Blocks direct edits to Agent-Aiko protected files.
// stdout: JSON only. logs: stderr only.
//
// シェルの拒否リストは、コマンド文字列に保護パスがそのまま書いてあるときだけ効く。
// python や node が開くファイル、変数に入れたパス、エンコードしたコマンドは見えない。
// そこは止められない。JSON が読めないときと、正規化できた保護パスへの write/replace は拒否する。

import { realpathSync } from 'fs';
import { basename, dirname, isAbsolute, join, normalize, resolve } from 'path';
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

const PATH_KEYS = ['path', 'file_path', 'filepath', 'absolute_path', 'target_file'];

const SHELL_INVARIANTS_DENY = [
  /[~$].*\.aiko\/persona\/origin\/persona\.md/,
  /\.claude\/aiko\/persona\/origin\/persona\.md/,
];
const SHELL_DESTRUCTIVE_OPS = /[>|;`]|sed\s+-i|perl\s+-pi|\brm\b|\bmv\b|\bcp\b|\btee\b/;
const SHELL_PROTECTED_TERMS = [/INVARIANTS\.md/, /aiko-origin\.md/];

function expandUser(p) {
  return p.replace(/^~\//, `${HOME}/`).replace(/^\$HOME\//, `${HOME}/`);
}

/** 字句上の絶対パスと、存在する親を realpath したパス。`./` と `..` とリンクを同じ形にする。 */
function canonicalForms(p) {
  const expanded = expandUser(p);
  const lexical = normalize(isAbsolute(expanded) ? expanded : resolve(expanded));
  const forms = new Set([lexical]);
  const missing = [];
  let current = lexical;
  for (;;) {
    try {
      let rebuilt = realpathSync(current);
      for (let i = missing.length - 1; i >= 0; i -= 1) rebuilt = normalize(resolve(rebuilt, missing[i]));
      forms.add(rebuilt);
      break;
    } catch {
      const parent = dirname(current);
      if (parent === current) break;
      missing.push(basename(current));
      current = parent;
    }
  }
  return forms;
}

const PROTECTED_FILES = [
  ...PROTECTED_PATHS,
  join(process.cwd(), '.claude', 'aiko', 'persona', 'origin', 'persona.md'),
  join(process.cwd(), '.claude', 'aiko', 'persona', 'aiko-origin.md'),
  join(process.cwd(), '.claude', 'aiko', 'persona', 'INVARIANTS.md'),
];

function isProtectedPath(p) {
  if (!p || typeof p !== 'string') return false;
  const forms = canonicalForms(p);
  for (const target of PROTECTED_FILES) {
    if (typeof target !== 'string') continue;
    const targetForms = canonicalForms(target);
    for (const form of forms) {
      if (targetForms.has(form)) return true;
    }
  }
  // origin ディレクトリ配下はファイル名が変わっても守る。overrides は含めない。
  const originForms = canonicalForms(join(AIKO_HOME, 'persona', 'origin'));
  for (const form of forms) {
    for (const root of originForms) {
      if (form === root || form.startsWith(`${root}/`)) return true;
    }
  }
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

  // 読めない入力を通すと、保護パスへの書き込みを検査できない。
  if (raw.trim().length === 0) {
    return deny('Agent-Aiko guard could not read the tool request.');
  }
  let input;
  try { input = JSON.parse(raw); } catch {
    return deny('Agent-Aiko guard could not read the tool request.');
  }

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
