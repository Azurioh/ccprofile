// @ts-check
import fs from 'node:fs';
import { profilePath } from '../core/paths.js';
import { readJson } from '../core/json.js';
import { resolveProfiles } from '../core/profiles.js';
import { info, die } from '../util/log.js';

/** @param {string[]} args */
export function run(args) {
  const name = args[0];
  if (!name) {
    die('usage: ccprofile inspect <profil>');
  }
  const file = profilePath(name);
  if (!fs.existsSync(file)) {
    die(`profil inconnu: ${name} (${file} absent)`);
  }
  const prof = readJson(file, {});
  const ownPlugins = new Set(prof.plugins ?? []);
  const ownSkills = new Set(prof.skills ?? []);
  const { plugins, skills } = resolveProfiles([name]);

  info(`Profil  : ${name}`);
  if (prof.description) {
    info(`Desc    : ${prof.description}`);
  }
  info(`Extends : ${(prof.extends ?? []).length ? prof.extends.join(', ') : '(aucun)'}`);
  info('-- plugins --');
  printMarked(plugins, ownPlugins);
  info('-- skills --');
  printMarked(skills, ownSkills);
  return 0;
}

/**
 * @param {string[]} all
 * @param {Set<string>} own
 */
function printMarked(all, own) {
  if (all.length === 0) {
    info('  (aucun)');
    return;
  }
  for (const line of all) {
    info(own.has(line) ? `  ${line}` : `  ${line}  (hérité)`);
  }
}
