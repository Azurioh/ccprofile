// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { profilesDir, profilePath } from '../core/paths.js';
import { writeJsonAtomic } from '../core/json.js';
import { validateProfile } from '../core/schema.js';
import { parseShared, dependencyReport } from '../core/share.js';
import { info, warn, die } from '../util/log.js';

/**
 * Returns true only for a safe bare basename (no path separators, no dotfiles).
 * @param {unknown} name
 * @returns {boolean}
 */
function isSafeName(name) {
  return typeof name === 'string'
    && name !== ''
    && name === path.basename(name)
    && !name.startsWith('.');
}

/**
 * @param {string} source  file path or http(s) URL
 * @returns {Promise<string>}
 */
async function readSource(source) {
  if (/^https?:\/\//.test(source)) {
    let res;
    try {
      res = await fetch(source);
    } catch (e) {
      die(`telecharge echec: ${source} (${/** @type {Error} */ (e).message})`);
    }
    if (!res.ok) {
      die(`telecharge echec (${res.status}): ${source}`);
    }
    try {
      return await res.text();
    } catch (e) {
      die(`telecharge echec: ${source} (${/** @type {Error} */ (e).message})`);
    }
  }
  if (!fs.existsSync(source)) {
    die(`fichier introuvable: ${source}`);
  }
  return fs.readFileSync(source, 'utf8');
}

/**
 * Shared by `import` and `pull`.
 * @param {string} text
 * @param {{ overwrite?: boolean, rename?: string }} opts
 * @returns {number}
 */
export function importProfiles(text, opts = {}) {
  if (opts.rename !== undefined && !isSafeName(opts.rename)) {
    die(`nom de profil invalide: ${opts.rename}`);
  }
  let parsed;
  try {
    parsed = parseShared(text);
  } catch {
    die('contenu partage invalide (JSON illisible)');
  }
  const entries = Object.entries(parsed.profiles);
  if (entries.length === 0) {
    die('aucun profil dans la source');
  }
  if (opts.rename && entries.length > 1) {
    die('--rename ne peut viser qu un seul profil (la source est un bundle)');
  }
  fs.mkdirSync(profilesDir(), { recursive: true });

  let written = 0;
  for (const [origName, body] of entries) {
    const name = opts.rename || origName;
    if (!isSafeName(name)) {
      warn(`⚠ ${name}: nom de profil invalide — ignore`);
      continue;
    }
    const { valid, errors } = validateProfile(body);
    if (!valid) {
      warn(`⚠ ${name}: ignore (invalide: ${errors.join('; ')})`);
      continue;
    }
    const target = profilePath(name);
    if (fs.existsSync(target) && !opts.overwrite) {
      warn(`⚠ ${name}: existe deja — ignore (utilise --overwrite ou --rename)`);
      continue;
    }
    const clean = { ...body };
    delete clean.meta;
    writeJsonAtomic(target, clean);
    written += 1;
    const { missingSkills, requiredPlugins } = dependencyReport(clean);
    info(`✓ ${name} importe`);
    if (missingSkills.length > 0) {
      info(`    skills manquants (absents du store): ${missingSkills.join(', ')}`);
    }
    if (requiredPlugins.length > 0) {
      info(`    plugins requis (a installer) : ${requiredPlugins.join(', ')}`);
    }
  }
  info(`→ ${written}/${entries.length} profil(s) importe(s) dans ${profilesDir()}`);
  return 0;
}

/**
 * @param {string[]} args
 * @returns {Promise<number>}
 */
export async function run(args) {
  const positional = args.filter((a) => !a.startsWith('--'));
  const source = positional[0];
  if (!source) {
    die('usage: ccprofile import <fichier|url> [--overwrite|--rename <nom>]');
  }
  const renameIdx = args.indexOf('--rename');
  const opts = {
    overwrite: args.includes('--overwrite'),
    rename: renameIdx >= 0 ? args[renameIdx + 1] : undefined
  };
  const text = await readSource(source);
  return importProfiles(text, opts);
}
