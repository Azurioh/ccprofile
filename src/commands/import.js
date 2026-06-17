// @ts-check
import fs from 'node:fs';
import { profilesDir, profilePath } from '../core/paths.js';
import { writeJsonAtomic } from '../core/json.js';
import { validateProfile } from '../core/schema.js';
import { parseShared, dependencyReport } from '../core/share.js';
import { info, warn, die } from '../util/log.js';

/**
 * @param {string} source  file path or http(s) URL
 * @returns {Promise<string>}
 */
async function readSource(source) {
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source);
    if (!res.ok) {
      die(`téléchargement échoué (${res.status}): ${source}`);
    }
    return res.text();
  }
  if (!fs.existsSync(source)) {
    die(`fichier introuvable: ${source}`);
  }
  return fs.readFileSync(source, 'utf8');
}

/**
 * Shared by `import` and `pull`.
 * @param {string} text
 * @param {{ overwrite?: boolean, skip?: boolean, rename?: string }} opts
 * @returns {number}
 */
export function importProfiles(text, opts = {}) {
  let parsed;
  try {
    parsed = parseShared(text);
  } catch {
    die('contenu partagé invalide (JSON illisible)');
  }
  const entries = Object.entries(parsed.profiles);
  if (entries.length === 0) {
    die('aucun profil dans la source');
  }
  if (opts.rename && entries.length > 1) {
    die('--rename ne peut viser qu’un seul profil (la source est un bundle)');
  }
  fs.mkdirSync(profilesDir(), { recursive: true });

  let written = 0;
  for (const [origName, body] of entries) {
    const name = opts.rename || origName;
    const { valid, errors } = validateProfile(body);
    if (!valid) {
      warn(`⚠ ${name}: ignoré (invalide: ${errors.join('; ')})`);
      continue;
    }
    const target = profilePath(name);
    if (fs.existsSync(target) && !opts.overwrite) {
      warn(`⚠ ${name}: existe déjà — ignoré (utilise --overwrite ou --rename)`);
      continue;
    }
    const clean = { ...body };
    delete clean.meta;
    writeJsonAtomic(target, clean);
    written += 1;
    const { missingSkills, requiredPlugins } = dependencyReport(clean);
    info(`✓ ${name} importé`);
    if (missingSkills.length > 0) {
      info(`    skills manquants (absents du store): ${missingSkills.join(', ')}`);
    }
    if (requiredPlugins.length > 0) {
      info(`    plugins requis (à installer) : ${requiredPlugins.join(', ')}`);
    }
  }
  info(`→ ${written}/${entries.length} profil(s) importé(s) dans ${profilesDir()}`);
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
    die('usage: ccprofile import <fichier|url> [--overwrite|--skip|--rename <nom>]');
  }
  const renameIdx = args.indexOf('--rename');
  const opts = {
    overwrite: args.includes('--overwrite'),
    skip: args.includes('--skip'),
    rename: renameIdx >= 0 ? args[renameIdx + 1] : undefined
  };
  const text = await readSource(source);
  return importProfiles(text, opts);
}
