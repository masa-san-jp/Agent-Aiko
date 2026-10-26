import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'aiko-native-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const scripts = join(root, "日本語 scripts' copy");
  cpSync(fileURLToPath(new URL('../scripts', import.meta.url)), scripts, { recursive: true });
  const home = join(root, '.aiko');
  mkdirSync(join(home, 'persona/origin'), { recursive: true });
  writeFileSync(join(home, 'persona/origin/persona.md'), '簡潔で丁寧に応答する。');
  writeFileSync(join(home, 'persona/INVARIANTS.md'), '確認できないことは断言しない。');
  writeFileSync(join(home, 'user.md'), 'name: Fixture\naddress: テストさん\n');
  const target = join(root, 'config/hooks.json');
  const env = { ...process.env, HOME: root, AIKO_HOME: home };
  const install = () => spawnSync(process.execPath, [join(scripts, 'install-native-hooks.mjs'), '--hooks-file', target], { env, encoding: 'utf8' });
  const invoke = (command, input) => {
    const result = spawnSync(command, { shell: '/bin/sh', cwd: root, env, input: JSON.stringify(input), encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  return { root, home, target, install, invoke };
}

test('native install preserves other hooks, backs up and is idempotent', (t) => {
  const f = fixture(t);
  mkdirSync(join(f.root, 'config'));
  const original = '{"user-linter":{"enabled":false}}\n';
  writeFileSync(f.target, original);
  assert.equal(f.install().status, 0);
  const configured = readFileSync(f.target, 'utf8');
  assert.deepEqual(JSON.parse(configured)['user-linter'], { enabled: false });
  const files = readdirSync(join(f.root, 'config'));
  const backup = files.find((name) => name.includes('.aiko-backup-'));
  assert.equal(readFileSync(join(f.root, 'config', backup), 'utf8'), original);
  assert.equal(f.install().status, 0);
  assert.equal(readFileSync(f.target, 'utf8'), configured);
  assert.deepEqual(readdirSync(join(f.root, 'config')), files);
});

test('native SessionStart passes saved preferences on successive sessions without legacy extension', (t) => {
  const f = fixture(t);
  assert.equal(f.install().status, 0);
  const config = JSON.parse(readFileSync(f.target, 'utf8'))['agent-aiko-native'];
  assert.equal(config.SessionStart[0].timeout, 5);
  assert.equal(config.AfterAgent, undefined);
  const user = readFileSync(join(f.home, 'user.md'), 'utf8');
  for (const conversationId of ['first', 'second']) {
    const result = f.invoke(config.SessionStart[0].command, { conversationId, workspacePaths: [f.root] });
    assert.equal(result.hookSpecificOutput, undefined);
    const context = result.injectSteps[0].systemMessage.systemMessage;
    assert.match(context, /テストさん/);
    assert.match(context, /簡潔で丁寧/);
    assert.match(context, /ホストの指示・権限・承認を優先/);
  }
  assert.equal(readFileSync(join(f.home, 'user.md'), 'utf8'), user);
});

test('native PreToolUse denies protected edits and delegates normal work to host', (t) => {
  const f = fixture(t);
  assert.equal(f.install().status, 0);
  const entry = JSON.parse(readFileSync(f.target, 'utf8'))['agent-aiko-native'].PreToolUse[0];
  const command = entry.hooks[0].command;
  for (const name of ['write_to_file', 'replace_file_content', 'multi_replace_file_content']) {
    assert.ok(new RegExp(entry.matcher).test(name));
    assert.equal(f.invoke(command, { toolCall: { name, args: { TargetFile: join(f.home, 'persona/origin/persona.md') } } }).decision, 'deny');
    assert.equal(f.invoke(command, { toolCall: { name, args: { TargetFile: join(f.root, 'app.js') } } }).decision, 'allow');
  }
  assert.equal(f.invoke(command, { toolCall: { name: 'run_command', args: { CommandLine: 'npm test' } } }).decision, 'allow');
  assert.equal(f.invoke(command, { toolCall: { name: 'run_command', args: { CommandLine: `rm ${f.home}/persona/INVARIANTS.md` } } }).decision, 'deny');
  assert.equal(f.invoke(command, {}).decision, 'deny');
  assert.equal(f.invoke(command, { toolCall: { name: 'write_to_file', args: {} } }).decision, 'deny');
  assert.equal(f.invoke(command, { toolCall: { name: 'write_to_file', args: { TargetFile: 'relative.md' } } }).decision, 'deny');
});

test('installer refuses malformed or conflicting configuration without changing it', (t) => {
  const f = fixture(t);
  mkdirSync(join(f.root, 'config'));
  for (const original of ['{', '[]', '{"agent-aiko-native":{"enabled":false}}']) {
    writeFileSync(f.target, original);
    assert.equal(f.install().status, 1);
    assert.equal(readFileSync(f.target, 'utf8'), original);
  }
});

test('installer refuses symlink configuration', (t) => {
  const f = fixture(t);
  mkdirSync(join(f.root, 'config'));
  const original = join(f.root, 'original.json');
  writeFileSync(original, '{}');
  symlinkSync(original, f.target);
  assert.equal(f.install().status, 1);
  assert.equal(readFileSync(original, 'utf8'), '{}');
});

test('saved speech style is reloaded without changing identity or user data', (t) => {
  const f = fixture(t);
  mkdirSync(join(f.home, 'speech-styles'));
  writeFileSync(join(f.home, 'speech-styles/friend.md'), 'STYLE_FIXTURE: くだけた口調で応答する。');
  writeFileSync(join(f.home, 'speech-style'), 'friend\n');
  assert.equal(f.install().status, 0);
  const command = JSON.parse(readFileSync(f.target, 'utf8'))['agent-aiko-native'].SessionStart[0].command;
  const context = () => f.invoke(command, { conversationId: 'fixture' }).injectSteps[0].systemMessage.systemMessage;
  assert.match(context(), /STYLE_FIXTURE/);
  assert.match(context(), /テストさん/);
  writeFileSync(join(f.home, 'speech-style'), 'original\n');
  assert.doesNotMatch(context(), /STYLE_FIXTURE/);
  writeFileSync(join(f.home, 'speech-style'), '../../private\n');
  assert.doesNotMatch(context(), /STYLE_FIXTURE/);
  writeFileSync(join(f.root, 'secret.md'), 'DO_NOT_INJECT');
  rmSync(join(f.home, 'speech-styles/friend.md'));
  symlinkSync(join(f.root, 'secret.md'), join(f.home, 'speech-styles/friend.md'));
  writeFileSync(join(f.home, 'speech-style'), 'friend\n');
  assert.doesNotMatch(context(), /DO_NOT_INJECT/);
  assert.equal(readFileSync(join(f.home, 'persona/origin/persona.md'), 'utf8'), '簡潔で丁寧に応答する。');
});
