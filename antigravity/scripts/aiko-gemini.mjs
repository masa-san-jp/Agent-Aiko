#!/usr/bin/env node
// aiko-gemini.mjs — Agent-Aiko CLI for Gemini CLI / Antigravity
// Node.js 20+ / ESM / no external dependencies

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const AIKO_HOME = process.env.AIKO_HOME ?? join(homedir(), '.aiko');

const SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}$/;
const RESERVED_SLUGS = new Set(['origin', 'override', 'default', 'confirm']);

const DENY_PATTERNS = [
  /INVARIANTS(.md)?\s*(を|は)?\s*(削除|変更|無視|解除|上書き|編集|消)/i,
  /(origin|オリジナル).*(persona|人格).*(変更|編集|上書き|削除)/i,
  /(prefix|プレフィックス).*(不要|削除|外す|やめる|付けない)/i,
  /(Aiko|アイコ).*(でなく|やめ|捨て|無効)/i,
  /(ファイル保護|保護).*(解除|無効|無視)/i,
];

function readFileSafe(path, fallback = '') {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return fallback;
  }
}

function writeFileSafe(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

function isInitialized() {
  return existsSync(join(AIKO_HOME, 'persona', 'origin', 'persona.md')) ||
         existsSync(join(AIKO_HOME, 'persona', 'aiko-origin.md'));
}

function getMode() {
  const raw = readFileSafe(join(AIKO_HOME, 'mode'), 'origin');
  return raw === 'override' ? 'override' : 'origin';
}

function getActivePersona() {
  return readFileSafe(join(AIKO_HOME, 'active-persona'), '');
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
    if (existsSync(p1)) return p1;
    if (existsSync(p2)) return p2;
    return p1;
  }
  if (activePersona) {
    const p1 = join(AIKO_HOME, 'persona', 'overrides', activePersona, 'persona.md');
    const p2 = join(AIKO_HOME, 'persona', 'overrides', `${activePersona}.md`);
    if (existsSync(p1)) return p1;
    if (existsSync(p2)) return p2;
    return p1;
  }
  const p1 = join(AIKO_HOME, 'persona', 'override', 'persona.md');
  const p2 = join(AIKO_HOME, 'persona', 'aiko-override.md');
  if (existsSync(p1)) return p1;
  if (existsSync(p2)) return p2;
  return p1;
}

function resolveRulesPath(mode, activePersona) {
  if (mode === 'origin') return join(AIKO_HOME, 'capability', 'rules', 'rules-base.md');
  if (activePersona) return join(AIKO_HOME, 'persona', 'overrides', activePersona, 'rules.md');
  return join(AIKO_HOME, 'persona', 'override', 'rules.md');
}

function resolveUserPath(mode, activePersona) {
  if (mode === 'override' && activePersona) {
    const p = join(AIKO_HOME, 'persona', 'overrides', activePersona, 'user.md');
    if (existsSync(p)) return p;
  }
  if (mode === 'override') {
    const p = join(AIKO_HOME, 'persona', 'override', 'user.md');
    if (existsSync(p)) return p;
  }
  return join(AIKO_HOME, 'user.md');
}

function getInvariantsContent() {
  const p1 = join(AIKO_HOME, 'persona', 'INVARIANTS.md');
  const p2 = join(AIKO_HOME, 'INVARIANTS.md');
  if (existsSync(p1)) return readFileSafe(p1);
  if (existsSync(p2)) return readFileSafe(p2);
  return '';
}

function buildContext() {
  const mode = getMode();
  const activePersona = getActivePersona();
  const prefix = getPrefix(mode, activePersona);
  const personaPath = resolvePersonaPath(mode, activePersona);
  const userPath = resolveUserPath(mode, activePersona);

  const persona = readFileSafe(personaPath, '（人格ファイルが見つかりません）');
  const invariants = getInvariantsContent();
  const rules = readFileSafe(join(AIKO_HOME, 'capability', 'rules', 'rules-base.md'));
  const personaRules = mode === 'override' ? readFileSafe(resolveRulesPath(mode, activePersona)) : '';
  const user = readFileSafe(userPath);

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

  if (invariants) {
    lines.push('# 不変条項（常に最優先で遵守）', '', invariants, '');
  }

  lines.push('# 人格', '', persona, '');

  if (rules) {
    lines.push('# 運用ルール', '', rules, '');
  }

  if (personaRules) {
    lines.push('# 人格固有ルール', '', personaRules, '');
  }

  if (user) {
    lines.push('# ユーザー', '', user, '');
  }

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

function appendOverrideHistory(action, detail) {
  const histPath = join(AIKO_HOME, 'override-history.jsonl');
  const entry = JSON.stringify({ timestamp: new Date().toISOString(), action, detail }) + '\n';
  try {
    mkdirSync(AIKO_HOME, { recursive: true });
    appendFileSync(histPath, entry, 'utf8');
  } catch {
    // non-critical
  }
}

// --- subcommands ---

function cmdContext() {
  if (!isInitialized()) {
    console.log('# Agent-Aiko Runtime Context\n\nAgent-Aiko is not initialized. Run `bash antigravity/scripts/install.sh` to initialize.');
    process.exit(4);
  }
  console.log(buildContext());
}

function cmdStatus() {
  if (!isInitialized()) {
    console.log('Agent-Aiko is not initialized.');
    process.exit(4);
  }
  const mode = getMode();
  const activePersona = getActivePersona();
  const prefix = getPrefix(mode, activePersona);
  const personaPath = resolvePersonaPath(mode, activePersona);
  console.log(`Agent-Aiko status
- aikoHome: ${AIKO_HOME}
- mode: ${mode}
- activePersona: ${activePersona || '（なし）'}
- prefix: ${prefix}
- personaPath: ${personaPath}`);
}

function cmdMode(args) {
  if (!isInitialized()) { console.log('Agent-Aiko is not initialized.'); process.exit(4); }
  const arg = args[0] ?? '';
  if (!arg) {
    const mode = getMode();
    console.log(`現在のモードは ${mode} です。`);
    return;
  }
  if (arg !== 'origin' && arg !== 'override') {
    console.error('mode は origin または override を指定してください。');
    process.exit(1);
  }
  if (arg === 'origin') writeFileSafe(join(AIKO_HOME, 'active-persona'), '');
  writeFileSafe(join(AIKO_HOME, 'mode'), arg);
  appendOverrideHistory('mode', arg);
  console.log(`mode を ${arg} に変更しました。`);
}

function cmdOrigin() {
  if (!isInitialized()) { console.log('Agent-Aiko is not initialized.'); process.exit(4); }
  writeFileSafe(join(AIKO_HOME, 'active-persona'), '');
  writeFileSafe(join(AIKO_HOME, 'mode'), 'origin');
  appendOverrideHistory('mode', 'origin');
  console.log('mode を origin に変更しました。');
}

function cmdOverride(args) {
  if (!isInitialized()) { console.log('Agent-Aiko is not initialized.'); process.exit(4); }
  if (!args.length) {
    writeFileSafe(join(AIKO_HOME, 'mode'), 'override');
    appendOverrideHistory('mode', 'override');
    console.log('mode を override に変更しました。');
    return;
  }
  const instruction = args.join(' ');
  for (const pattern of DENY_PATTERNS) {
    if (pattern.test(instruction)) {
      console.error('この指示は INVARIANTS に違反する可能性があります。より具体的な安全な指示に分割してください。');
      process.exit(3);
    }
  }
  writeFileSafe(join(AIKO_HOME, 'mode'), 'override');
  const mode = getMode();
  const activePersona = getActivePersona();
  const targetPath = resolvePersonaPath('override', activePersona);
  const entry = `\n\n---\n\n## ユーザー指示（Antigravity / Gemini CLI override）\n\n- ${new Date().toISOString()}: ${instruction}\n`;
  try {
    appendFileSync(targetPath, entry, 'utf8');
  } catch {
    writeFileSafe(targetPath, readFileSafe(targetPath) + entry);
  }
  console.log(`override persona に指示を追記しました。`);
}

function cmdNew(args) {
  if (!isInitialized()) { console.log('Agent-Aiko is not initialized.'); process.exit(4); }
  const name = args[0] ?? '';
  if (!name) {
    console.error('名前を指定してください。例: aiko-gemini new review');
    process.exit(1);
  }
  if (!SLUG_RE.test(name)) {
    console.error('名前は英数字・ハイフン・アンダースコアのみ使用できます（32文字以内）。');
    process.exit(1);
  }
  if (RESERVED_SLUGS.has(name) || name === '.' || name === '..') {
    console.error(`"${name}" は予約済みの名前です。`);
    process.exit(1);
  }

  const dir = join(AIKO_HOME, 'persona', 'overrides', name);
  mkdirSync(dir, { recursive: true });

  const originPersona = readFileSafe(resolvePersonaPath('origin', ''), '');
  writeFileSafe(join(dir, 'persona.md'), originPersona);

  const userSrc = existsSync(join(AIKO_HOME, 'persona', 'override', 'user.md'))
    ? join(AIKO_HOME, 'persona', 'override', 'user.md')
    : join(AIKO_HOME, 'user.md');
  writeFileSafe(join(dir, 'user.md'), readFileSafe(userSrc));
  writeFileSafe(join(dir, 'rules.md'), '');
  writeFileSafe(join(dir, 'README.md'), `# ${name} persona\n\nAgent-Aiko named persona.\n`);

  writeFileSafe(join(AIKO_HOME, 'active-persona'), name);
  writeFileSafe(join(AIKO_HOME, 'mode'), 'override');

  console.log(`名前付き人格 "${name}" を作成し、選択しました。`);
}

function cmdSelect(args) {
  if (!isInitialized()) { console.log('Agent-Aiko is not initialized.'); process.exit(4); }
  const name = args[0] ?? '';
  if (!name) {
    console.error('人格名を指定してください。');
    process.exit(1);
  }
  if (name === 'origin') {
    writeFileSafe(join(AIKO_HOME, 'active-persona'), '');
    writeFileSafe(join(AIKO_HOME, 'mode'), 'origin');
    console.log('mode を origin に変更しました。');
    return;
  }
  if (name === 'override') {
    writeFileSafe(join(AIKO_HOME, 'mode'), 'override');
    writeFileSafe(join(AIKO_HOME, 'active-persona'), '');
    console.log('mode を override（名前なし）に変更しました。');
    return;
  }
  const personaDir = join(AIKO_HOME, 'persona', 'overrides', name);
  const personaFile = join(AIKO_HOME, 'persona', 'overrides', `${name}.md`);
  if (!existsSync(personaDir) && !existsSync(personaFile)) {
    console.error(`人格 "${name}" が見つかりません。`);
    process.exit(1);
  }
  writeFileSafe(join(AIKO_HOME, 'mode'), 'override');
  writeFileSafe(join(AIKO_HOME, 'active-persona'), name);
  appendOverrideHistory('select', name);
  console.log(`人格 "${name}" を選択しました。`);
}

function cmdPersonas() {
  if (!isInitialized()) { console.log('Agent-Aiko is not initialized.'); process.exit(4); }
  const mode = getMode();
  const activePersona = getActivePersona();
  const lines = ['Agent-Aiko personas'];
  lines.push(`- origin${mode === 'origin' ? ' [active]' : ''}`);
  lines.push(`- override${mode === 'override' && !activePersona ? ' [active]' : ''}`);

  const overridesDir = join(AIKO_HOME, 'persona', 'overrides');
  if (existsSync(overridesDir)) {
    try {
      const entries = readdirSync(overridesDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          const isActive = mode === 'override' && activePersona === e.name;
          lines.push(`- ${e.name}${isActive ? ' [active]' : ''}`);
        }
      }
    } catch { /* ignore */ }
  }
  console.log(lines.join('\n'));
}

function cmdDiff(args) {
  if (!isInitialized()) { console.log('Agent-Aiko is not initialized.'); process.exit(4); }
  const name = args[0] ?? '';
  const originPath = resolvePersonaPath('origin', '');
  const originLines = readFileSafe(originPath).split('\n');

  let targetPath;
  let targetLabel;
  if (!name || name === 'override') {
    targetPath = resolvePersonaPath('override', '');
    targetLabel = 'override';
  } else if (name === 'origin') {
    console.log('（origin との差分は自分自身なので空です）');
    return;
  } else {
    targetPath = join(AIKO_HOME, 'persona', 'overrides', name, 'persona.md');
    targetLabel = name;
  }
  const targetLines = readFileSafe(targetPath).split('\n');

  const diff = unifiedDiff(originLines, targetLines, 'origin', targetLabel);
  if (!diff) {
    console.log('（差分なし）');
  } else {
    console.log(diff);
  }
}

function cmdExport(args) {
  if (!isInitialized()) { console.log('Agent-Aiko is not initialized.'); process.exit(4); }
  const name = args[0] ?? '';
  const mode = getMode();
  const activePersona = getActivePersona();

  let targetName = name || (activePersona || (mode === 'override' ? 'override' : 'origin'));
  let personaPath, rulesPath;

  if (!name || name === 'origin') {
    personaPath = resolvePersonaPath('origin', '');
    rulesPath = resolveRulesPath('origin', '');
    targetName = 'origin';
  } else if (name === 'override') {
    personaPath = resolvePersonaPath('override', '');
    rulesPath = resolveRulesPath('override', '');
  } else {
    personaPath = join(AIKO_HOME, 'persona', 'overrides', name, 'persona.md');
    rulesPath = join(AIKO_HOME, 'persona', 'overrides', name, 'rules.md');
  }

  let personaContent = readFileSafe(personaPath);
  const rulesContent = readFileSafe(rulesPath);

  // Sanitize user-specific info
  personaContent = personaContent.replace(/\b(マサ|masa|msfmnkns)\b/gi, '（ユーザー名）');

  const lines = [
    '# Agent-Aiko Persona Export',
    '',
    `- exportedAt: ${new Date().toISOString()}`,
    '- source: antigravity-gemini',
    `- name: ${targetName}`,
    '',
    '## persona.md',
    '',
    personaContent,
  ];
  if (rulesContent) {
    lines.push('', '## rules.md', '', rulesContent);
  }
  console.log(lines.join('\n'));
}

function cmdReset(args) {
  if (!isInitialized()) { console.log('Agent-Aiko is not initialized.'); process.exit(4); }
  const confirmed = args.includes('--yes') || args.includes('confirm');
  const targetName = args.filter(a => a !== '--yes' && a !== 'confirm')[0] ?? '';

  if (!confirmed) {
    const mode = getMode();
    const activePersona = getActivePersona();
    const target = targetName || (activePersona || 'override');
    console.log(`Reset は破壊的操作です。

現在の状態:
- mode: ${mode}
- activePersona: ${activePersona || '（なし）'}
- reset 対象: ${target}

チャット内で確認する場合: /aiko-reset confirm${targetName ? ' ' + targetName : ''}
ターミナルで実行する場合: aiko-gemini reset${targetName ? ' ' + targetName : ''} --yes`);
    return;
  }

  const originPath = resolvePersonaPath('origin', '');
  const originContent = readFileSafe(originPath);

  if (targetName && targetName !== 'override') {
    const targetPath = join(AIKO_HOME, 'persona', 'overrides', targetName, 'persona.md');
    writeFileSafe(targetPath, originContent);
    console.log(`人格 "${targetName}" を origin にリセットしました。`);
  } else {
    const overridePath = join(AIKO_HOME, 'persona', 'override', 'persona.md');
    const legacyPath = join(AIKO_HOME, 'persona', 'aiko-override.md');
    writeFileSafe(overridePath, originContent);
    if (existsSync(legacyPath)) writeFileSafe(legacyPath, originContent);
    console.log('override persona を origin にリセットしました。');
  }
}

function cmdDelete(args) {
  if (!isInitialized()) { console.log('Agent-Aiko is not initialized.'); process.exit(4); }
  const confirmed = args.includes('--yes') || args.includes('confirm');
  const mode = getMode();
  const activePersona = getActivePersona();

  if (!activePersona || mode !== 'override') {
    console.log('削除対象の名前付き人格がありません。（origin と default override は削除できません）');
    return;
  }

  if (!confirmed) {
    console.log(`Delete は破壊的操作です。

削除対象: ${activePersona}

チャット内で確認する場合: /aiko-delete confirm
ターミナルで実行する場合: aiko-gemini delete --yes`);
    return;
  }

  const dir = join(AIKO_HOME, 'persona', 'overrides', activePersona);
  if (!existsSync(dir)) {
    console.error(`人格 "${activePersona}" のディレクトリが見つかりません。`);
    process.exit(2);
  }
  rmSync(dir, { recursive: true, force: true });
  writeFileSafe(join(AIKO_HOME, 'active-persona'), '');
  writeFileSafe(join(AIKO_HOME, 'mode'), 'origin');
  console.log(`人格 "${activePersona}" を削除し、origin モードに戻りました。`);
}

// minimal unified diff (no external deps)
function unifiedDiff(aLines, bLines, aLabel, bLabel) {
  const chunks = [];
  let i = 0, j = 0;
  const CONTEXT = 3;

  const eq = (a, b) => a === b;
  const lcs = computeLCS(aLines, bLines);

  let ai = 0, bi = 0, li = 0;
  const edits = [];
  while (ai < aLines.length || bi < bLines.length) {
    if (ai < aLines.length && bi < bLines.length && li < lcs.length && aLines[ai] === lcs[li] && bLines[bi] === lcs[li]) {
      edits.push({ type: ' ', a: ai, b: bi }); ai++; bi++; li++;
    } else if (bi < bLines.length && (li >= lcs.length || bLines[bi] !== lcs[li])) {
      edits.push({ type: '+', a: -1, b: bi }); bi++;
    } else {
      edits.push({ type: '-', a: ai, b: -1 }); ai++;
    }
  }

  const changed = edits.filter(e => e.type !== ' ');
  if (!changed.length) return '';

  let result = `--- ${aLabel}\n+++ ${bLabel}\n`;
  let idx = 0;
  while (idx < edits.length) {
    if (edits[idx].type === ' ') { idx++; continue; }
    const start = Math.max(0, idx - CONTEXT);
    let end = idx;
    while (end < edits.length && (edits[end].type !== ' ' || end - idx < CONTEXT)) end++;
    end = Math.min(edits.length - 1, end + CONTEXT);

    const aStart = edits[start].a >= 0 ? edits[start].a : edits.slice(0, start).filter(e => e.a >= 0).slice(-1)[0]?.a ?? 0;
    const bStart = edits[start].b >= 0 ? edits[start].b : edits.slice(0, start).filter(e => e.b >= 0).slice(-1)[0]?.b ?? 0;
    const aCount = edits.slice(start, end + 1).filter(e => e.type !== '+').length;
    const bCount = edits.slice(start, end + 1).filter(e => e.type !== '-').length;

    result += `@@ -${aStart + 1},${aCount} +${bStart + 1},${bCount} @@\n`;
    for (let k = start; k <= end; k++) {
      const e = edits[k];
      const lineA = e.a >= 0 ? aLines[e.a] : '';
      const lineB = e.b >= 0 ? bLines[e.b] : '';
      result += `${e.type}${e.type === '-' ? lineA : e.type === '+' ? lineB : lineA}\n`;
    }
    idx = end + 1;
  }
  return result;
}

function computeLCS(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const lcs = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { lcs.unshift(a[i - 1]); i--; j--; }
    else if (dp[i - 1][j] > dp[i][j - 1]) i--;
    else j--;
  }
  return lcs;
}

// --- main ---

const [,, subcmd = '', ...rest] = process.argv;

switch (subcmd) {
  case 'context':  cmdContext(); break;
  case 'status':   cmdStatus(); break;
  case 'mode':     cmdMode(rest); break;
  case 'origin':   cmdOrigin(); break;
  case 'override': cmdOverride(rest); break;
  case 'new':      cmdNew(rest); break;
  case 'select':   cmdSelect(rest); break;
  case 'personas': cmdPersonas(); break;
  case 'diff':      cmdDiff(rest); break;
  case 'export':    cmdExport(rest); break;
  case 'reset':     cmdReset(rest); break;
  case 'delete':    cmdDelete(rest); break;
  default:
    console.error(`使い方: aiko-gemini <subcommand> [args]

サブコマンド:
  context           現在の Agent-Aiko runtime context を表示
  status            現在の状態を表示
  mode [origin|override]  mode を表示または変更
  origin            origin mode に切り替え
  override [instruction]  override mode に切り替え（指示があれば追記）
  new <name>        名前付き人格を作成
  select <name>     人格を選択
  personas          人格一覧を表示
  diff [name]       origin との差分を表示
  export [name]     人格を共有用に出力
  reset [name] [confirm|--yes]  人格を origin にリセット
  delete [confirm|--yes]  現在の名前付き人格を削除`);
    process.exit(1);
}
