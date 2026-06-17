// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { storeDir } from './paths.js';
import { warn } from '../util/log.js';

export const linkType = process.platform === 'win32' ? 'junction' : 'dir';

/**
 * @param {string} skill
 * @param {string} destDir
 * @returns {boolean}
 */
export function linkSkill(skill, destDir) {
  const target = path.join(storeDir(), skill);
  if (!fs.existsSync(target)) {
    warn(`  ⚠ skill absent du store: ${skill}`);
    return false;
  }
  const dest = path.join(destDir, skill);
  try {
    fs.rmSync(dest, { recursive: true, force: true });
  } catch {
    /* nothing to remove */
  }
  fs.symlinkSync(target, dest, linkType);
  return true;
}

/** @param {string} p */
export function isBrokenLink(p) {
  try {
    const st = fs.lstatSync(p);
    if (!st.isSymbolicLink()) {
      return false;
    }
    return !fs.existsSync(p);
  } catch {
    return false;
  }
}
