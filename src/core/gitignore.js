// @ts-check
import fs from 'node:fs';
import path from 'node:path';

const ENTRIES = ['.claude/skills/', '.claude/settings.local.json'];

/** @param {string} proj */
export function ensureGitignore(proj) {
  const gi = path.join(proj, '.gitignore');
  let existing = '';
  try {
    existing = fs.readFileSync(gi, 'utf8');
  } catch {
    existing = '';
  }
  const present = new Set(existing.split('\n').map((l) => l.trim()));
  const toAdd = ENTRIES.filter((e) => !present.has(e));
  if (toAdd.length === 0) {
    return;
  }
  const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
  fs.appendFileSync(gi, `${prefix}${toAdd.join('\n')}\n`);
}
