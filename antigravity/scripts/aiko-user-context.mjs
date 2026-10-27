import { join } from 'node:path';

// Ignore empty installer templates so they do not hide the shared user settings.
function hasUserContent(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/).some((line) => {
    const value = line.trim();
    return value !== '' && !value.startsWith('#') && !/^(?:name|address|memory)\s*:\s*$/i.test(value);
  });
}

/** Read the selected persona's settings first, then the shared user.md. */
export function readSelectedUser(aikoHome, mode, activePersona, readSafe) {
  const personaDir = mode === 'origin'
    ? join(aikoHome, 'persona', 'origin')
    : activePersona
      ? join(aikoHome, 'persona', 'overrides', activePersona)
      : join(aikoHome, 'persona', 'override');
  const specific = readSafe(join(personaDir, 'user.md'), '');
  if (hasUserContent(specific)) return specific;
  return readSafe(join(aikoHome, 'user.md'), '');
}
