// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { profilesDir } from '../core/paths.js';
import { info } from '../util/log.js';

const BUNDLED = fileURLToPath(new URL('../../profiles/', import.meta.url));

/** @param {string[]} args */
export function run(args) {
  const force = args.includes('--force');
  const dest = profilesDir();
  fs.mkdirSync(dest, { recursive: true });

  let bundled = [];
  try {
    bundled = fs.readdirSync(BUNDLED).filter((f) => f.endsWith('.json'));
  } catch {
    bundled = [];
  }

  let seeded = 0;
  let skipped = 0;
  for (const f of bundled.sort()) {
    const target = path.join(dest, f);
    if (fs.existsSync(target) && !force) {
      skipped += 1;
      continue;
    }
    fs.copyFileSync(path.join(BUNDLED, f), target);
    seeded += 1;
  }
  info(`✓ init: ${seeded} profil(s) copié(s), ${skipped} déjà présent(s) → ${dest}`);
  if (skipped > 0 && !force) {
    info('  (utilise --force pour écraser les existants)');
  }
  return 0;
}
