#!/usr/bin/env node
// Merge only our named definition. Never replace another hook or initialize user data.
import { readFile, mkdir, writeFile, rename, rm, lstat } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
const quote = (text) => "'" + text.replaceAll("'", "'\\''") + "'";
try {
  let uninstall = false;
  let hooksFile;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--uninstall' && !uninstall) uninstall = true;
    else if (args[i] === '--hooks-file' && hooksFile === undefined && args[i + 1] && !args[i + 1].startsWith('--')) hooksFile = args[++i];
    else throw new Error('Usage: node install-native-hooks.mjs [--uninstall] [--hooks-file <path>]');
  }
  const target = resolve(hooksFile ?? join(homedir(), '.gemini/config/hooks.json'));
  let previous;
  let config = {};
  try {
    if ((await lstat(target)).isSymbolicLink()) throw new Error('Refusing a symlink hooks file');
    previous = await readFile(target, 'utf8');
    config = JSON.parse(previous);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Invalid hooks file');
  const key = 'agent-aiko-native';
  const hook = quote(process.execPath) + ' ' + quote(fileURLToPath(new URL('./aiko-native-hook.mjs', import.meta.url)));
  const definition = {
    SessionStart: [{ type: 'command', command: hook + ' session', timeout: 5 }],
    PreToolUse: [{ matcher: '^(write_to_file|replace_file_content|multi_replace_file_content|run_command)$',
      hooks: [{ type: 'command', command: hook + ' pre-tool', timeout: 5 }] }],
  };
  // A changed definition could belong to the user; do not silently replace it.
  if (key in config && JSON.stringify(config[key]) !== JSON.stringify(definition)) {
    throw new Error('agent-aiko-native already exists with different settings; merge manually');
  }
  if (uninstall && !(key in config)) { process.stdout.write('Agent-Aiko hooks are not configured.\n'); }
  else if (!uninstall && key in config) { process.stdout.write('Agent-Aiko hooks already configured.\n'); }
  else {
    if (uninstall) delete config[key];
    else config[key] = definition;
    await mkdir(dirname(target), { recursive: true });
    if (previous !== undefined) await writeFile(target + '.aiko-backup-' + randomUUID(), previous, { mode: 0o600, flag: 'wx' });
    const temporary = target + '.tmp-' + randomUUID();
    try {
      await writeFile(temporary, JSON.stringify(config, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      // Refuse to overwrite edits made since the original read.
      let current;
      try { current = await readFile(target, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (current !== previous) throw new Error('Hooks changed during installation; retry');
      await rename(temporary, target);
    } finally { await rm(temporary, { force: true }); }
    process.stdout.write(`Agent-Aiko hooks ${uninstall ? 'removed' : 'configured'}: ${target}\n`);
  }
} catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
