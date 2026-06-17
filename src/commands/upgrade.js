// @ts-check
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { info, warn } from '../util/log.js';

const PKG = fileURLToPath(new URL('../../package.json', import.meta.url));

/** @param {string[]} args */
export function run(args) {
  const dryRun = args.includes('--dry-run');
  let name = '@azurioh/ccprofile';
  try {
    name = JSON.parse(fs.readFileSync(PKG, 'utf8')).name || name;
  } catch {
    /* keep default */
  }
  const cmd = `npm i -g ${name}@latest`;
  info(`→ ${cmd}`);
  if (dryRun) {
    return 0;
  }
  const r = spawnSync('npm', ['i', '-g', `${name}@latest`], { stdio: 'inherit' });
  if (r.status !== 0) {
    warn(`⚠ échec npm. Si non publié sur le registre, essaie: npm i -g Azurioh/ccprofile`);
    return 1;
  }
  info('✓ ccprofile mis à jour');
  return 0;
}
