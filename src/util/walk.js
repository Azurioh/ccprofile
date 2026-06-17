// @ts-check
import fs from 'node:fs';
import path from 'node:path';

/**
 * Yields absolute file paths under `dir`, pruning node_modules.
 * @param {string} dir
 * @param {{ maxDepth?: number }} [opts]
 * @returns {Generator<string>}
 */
export function* walk(dir, { maxDepth = Infinity } = {}) {
  /** @type {Array<{ p: string, d: number }>} */
  const stack = [{ p: dir, d: 0 }];
  while (stack.length > 0) {
    const { p, d } = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(p, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(p, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || d >= maxDepth) {
          continue;
        }
        stack.push({ p: full, d: d + 1 });
      } else {
        yield full;
      }
    }
  }
}

/**
 * True if any file basename matches `name` (supports a leading or trailing `*`).
 * @param {string} dir
 * @param {string} name
 * @param {number} maxDepth
 */
export function findFirst(dir, name, maxDepth) {
  const re = globToRegExp(name);
  for (const f of walk(dir, { maxDepth })) {
    if (re.test(path.basename(f))) {
      return true;
    }
  }
  return false;
}

/** @param {string} glob */
function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}
