// @ts-check
import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {string} file
 * @param {*} [fallback]
 * @returns {*}
 */
export function readJson(file, fallback = undefined) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/**
 * Atomic JSON write: temp file in the same directory, then rename.
 * @param {string} file
 * @param {*} obj
 */
export function writeJsonAtomic(file, obj) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`);
  fs.renameSync(tmp, file);
}
