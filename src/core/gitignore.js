// @ts-check
import fs from 'node:fs';
import path from 'node:path';

const KEEP = '.claude/settings.local.json';
const REMOVE = '.claude/skills/';

/** @param {string} proj */
export function ensureGitignore(proj) {
  const gi = path.join(proj, '.gitignore');
  let existing = '';
  try {
    existing = fs.readFileSync(gi, 'utf8');
  } catch {
    existing = '';
  }
  const lines = existing.split('\n');
  // Drop any stale `.claude/skills/` ignore so vendored skills are committed.
  const filtered = lines.filter((l) => l.trim() !== REMOVE);
  const present = new Set(filtered.map((l) => l.trim()));
  if (!present.has(KEEP)) {
    if (filtered.length > 0 && filtered[filtered.length - 1] !== '') {
      filtered.push('');
    }
    filtered.push(KEEP);
  }
  let out = filtered.join('\n');
  if (out !== '' && !out.endsWith('\n')) {
    out += '\n';
  }
  if (out !== existing) {
    fs.writeFileSync(gi, out);
  }
}
