// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { profilesDir, storeDir, skillsDir } from '../core/paths.js';
import { readJson } from '../core/json.js';
import { projectDir } from '../core/project.js';
import { isBrokenLink } from '../core/links.js';
import { info } from '../util/log.js';

/** @param {string[]} _args */
export function run(_args) {
  let problems = 0;

  let storeEntries = [];
  try {
    storeEntries = fs.readdirSync(storeDir());
  } catch {
    storeEntries = [];
  }
  const store = new Set(storeEntries);

  info('-- profils → store --');
  let profFiles = [];
  try {
    profFiles = fs.readdirSync(profilesDir()).filter((f) => f.endsWith('.json'));
  } catch {
    profFiles = [];
  }
  for (const f of profFiles.sort()) {
    const obj = readJson(path.join(profilesDir(), f), {}) ?? {};
    const missing = (obj.skills ?? []).filter((s) => !store.has(s));
    if (missing.length > 0) {
      problems += missing.length;
      info(`  ⚠ ${path.basename(f, '.json')}: skills absents du store: ${missing.sort().join(', ')}`);
    }
  }
  if (profFiles.length === 0) {
    info('  (aucun profil — lance: ccprofile init)');
  }

  info('-- liens projet courant --');
  const proj = projectDir();
  const dir = skillsDir(proj);
  let broken = [];
  try {
    broken = fs.readdirSync(dir).filter((b) => isBrokenLink(path.join(dir, b))).sort();
  } catch {
    broken = [];
  }
  if (broken.length > 0) {
    problems += broken.length;
    info(`  ⚠ symlinks cassés: ${broken.join(', ')} (lance: ccprofile sync)`);
  } else {
    info('  ✓ aucun lien cassé');
  }

  info('-- environnement --');
  const git = spawnSync('git', ['--version'], { encoding: 'utf8' });
  info(git.status === 0 ? `  ✓ git: ${git.stdout.trim()}` : '  ⚠ git introuvable (détection du projet limitée au cwd)');

  info(problems === 0 ? '✓ doctor: aucun problème' : `⚠ doctor: ${problems} problème(s)`);
  return 0;
}
