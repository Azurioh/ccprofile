// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { storeDir } from './paths.js';
import { warn } from '../util/log.js';

/**
 * @param {string} skill
 * @param {string} destDir
 * @returns {boolean}
 */
export function vendorSkill(skill, destDir) {
  const src = path.join(storeDir(), skill);
  if (!fs.existsSync(src)) {
    warn(`  ⚠ skill absent du store: ${skill}`);
    return false;
  }
  const dest = path.join(destDir, skill);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true, dereference: true });
  return true;
}

/**
 * @param {string} skill
 * @param {string} destDir
 * @returns {boolean}
 */
export function isVendored(skill, destDir) {
  try {
    return fs.statSync(path.join(destDir, skill)).isDirectory();
  } catch {
    return false;
  }
}
