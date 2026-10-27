#!/usr/bin/env node
// Native Antigravity hook contract. Gemini keeps its existing entry points.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isAbsolute, join, relative, sep } from 'node:path';
import { readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';

function containedText(root, path) {
  try {
    const actual = realpathSync(path);
    const within = relative(realpathSync(root), actual);
    if (isAbsolute(within) || within === '..' || within.startsWith('..' + sep)) return undefined;
    return readFileSync(actual, 'utf8').trim();
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}
function speechStyle() {
  const home = process.env.AIKO_HOME ?? join(homedir(), '.aiko');
  const selected = containedText(home, join(home, 'speech-style'));
  // Same accepted values and fallback behavior as the Core repository.
  if (!['friend', 'servant'].includes(selected)) return '';
  const bundled = fileURLToPath(new URL('../../packages/mcp-server/speech-styles/', import.meta.url));
  const text = containedText(home, join(home, 'speech-styles', selected + '.md'))
    ?? containedText(bundled, join(bundled, selected + '.md'));
  return text ? `\n\n# 保存済みの話し方: ${selected}\n人格の話し方にこの設定を適用してください。ホストの指示・承認と作業の正確さを優先します。\n${text}` : '';
}

const mode = process.argv[2];
let raw = '';
for await (const chunk of process.stdin) raw += chunk;
function invoke(script, input) {
  return JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], {
    input: JSON.stringify(input), encoding: 'utf8', timeout: 4000,
    stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 2 * 1024 * 1024,
  }));
}
function reply(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }
try {
  const input = JSON.parse(raw);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid hook request');
  if (mode === 'session') {
    const result = invoke('./aiko-session-context.mjs', input);
    const context = result.hookSpecificOutput?.additionalContext;
    if (result.suppressOutput !== true || typeof context !== 'string' || !context) throw new Error('Missing context');
    reply({ injectSteps: [{ systemMessage: { systemMessage:
      '以下は利用者が選んだ接し方と保存済み設定です。ホストの指示・権限・承認を優先し、作業の正確さを保って適用してください。\n\n' + context + speechStyle(),
    } }] });
  } else if (mode === 'pre-tool') {
    const call = input.toolCall;
    if (!call || typeof call.name !== 'string' || !call.args || typeof call.args !== 'object' || Array.isArray(call.args)) {
      throw new Error('Missing toolCall');
    }
    const fileTools = ['write_to_file', 'replace_file_content', 'multi_replace_file_content'];
    let converted;
    if (fileTools.includes(call.name)) {
      if (typeof call.args.TargetFile !== 'string' || !isAbsolute(call.args.TargetFile)) throw new Error('Missing absolute TargetFile');
      converted = { tool_name: 'write_file', tool_input: { path: call.args.TargetFile } };
    } else if (call.name === 'run_command') {
      if (typeof call.args.CommandLine !== 'string') throw new Error('Missing CommandLine');
      converted = { tool_name: 'run_shell_command', tool_input: { command: call.args.CommandLine } };
    } else {
      reply({ decision: 'allow' });
    }
    if (converted) {
      const result = invoke('./aiko-before-tool-guard.mjs', converted);
      if (!['allow', 'deny'].includes(result.decision)) throw new Error('Invalid guard decision');
      reply({ decision: result.decision, ...(result.reason ? { reason: result.reason } : {}) });
    }
  } else throw new Error('Unknown hook mode');
} catch {
  process.stderr.write('[agent-aiko] native hook could not process request\n');
  if (mode === 'pre-tool') reply({ decision: 'deny', reason: 'Agent-Aiko could not verify this tool request.' });
  else process.exitCode = 1;
}
