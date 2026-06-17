// @ts-check
import fs from 'node:fs';
import { profilePath, storeDir } from '../core/paths.js';
import { readJson } from '../core/json.js';
import { validateProfile } from '../core/schema.js';
import { resolveProfiles } from '../core/profiles.js';
import { info, die } from '../util/log.js';

/** @param {string[]} args */
export function run(args) {
  const name = args[0];
  if (!name) {
    die('usage: ccprofile validate <profil>');
  }
  const file = profilePath(name);
  if (!fs.existsSync(file)) {
    die(`profil inconnu: ${name} (${file} absent)`);
  }
  const obj = readJson(file, null);
  if (obj === null) {
    info(`✗ ${name}: JSON invalide`);
    return 1;
  }

  const errors = [];
  const { valid, errors: shapeErrors } = validateProfile(obj);
  errors.push(...shapeErrors);

  let storeEntries = [];
  try {
    storeEntries = fs.readdirSync(storeDir());
  } catch {
    storeEntries = [];
  }
  const store = new Set(storeEntries);
  for (const s of obj.skills ?? []) {
    if (!store.has(s)) {
      errors.push(`skill absent du store: ${s}`);
    }
  }
  try {
    resolveProfiles([name]);
  } catch (e) {
    errors.push(`extends: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (errors.length === 0 && valid) {
    info(`✓ ${name}: profil valide`);
    return 0;
  }
  info(`✗ ${name}: ${errors.length} problème(s)`);
  for (const e of errors) {
    info(`  - ${e}`);
  }
  return 1;
}
