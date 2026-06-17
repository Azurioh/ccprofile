// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { skillsDir } from '../core/paths.js';
import { projectDir } from '../core/project.js';
import { readMarker, writeMarker } from '../core/marker.js';
import { resolveProfiles } from '../core/profiles.js';
import { linkSkill, isBrokenLink } from '../core/links.js';
import { reconcilePlugins } from '../core/settings.js';
import { ensureGitignore } from '../core/gitignore.js';
import { info, die } from '../util/log.js';

/** @param {string[]} args */
export function run(args) {
  const dryRun = args.includes('--dry-run');
  const proj = projectDir();
  const marker = readMarker(proj);
  if (!marker) {
    die("aucun profil à synchroniser (pas de marqueur). Lance d'abord: ccprofile apply <profil>");
  }
  const { plugins, skills } = resolveProfiles(marker.profiles ?? []);
  const expectedSkills = new Set([...skills, ...(marker.extraSkills ?? [])].filter(Boolean));
  const expectedPlugins = [...new Set(plugins.filter(Boolean))].sort();
  const dir = skillsDir(proj);

  if (dryRun) {
    let current = [];
    try { current = fs.readdirSync(dir); } catch { current = []; }
    const toRemove = current.filter((b) => !expectedSkills.has(b)).sort();
    const toAdd = [...expectedSkills].filter((s) => !current.includes(s)).sort();
    info('sync (dry-run — aucune écriture)');
    info(`  skills à retirer : ${toRemove.length ? toRemove.join(', ') : '(aucun)'}`);
    info(`  skills à lier    : ${toAdd.length ? toAdd.join(', ') : '(aucun)'}`);
    info(`  plugins gérés    : ${expectedPlugins.length ? expectedPlugins.join(', ') : '(aucun)'}`);
    return 0;
  }

  fs.mkdirSync(dir, { recursive: true });

  let removed = 0;
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    entries = [];
  }
  for (const base of entries) {
    const full = path.join(dir, base);
    if (!expectedSkills.has(base)) {
      fs.rmSync(full, { recursive: true, force: true });
      removed += 1;
    } else if (isBrokenLink(full)) {
      fs.rmSync(full, { force: true });
    }
  }

  let added = 0;
  for (const s of expectedSkills) {
    if (!fs.existsSync(path.join(dir, s))) {
      if (linkSkill(s, dir)) {
        added += 1;
      }
    }
  }

  reconcilePlugins(proj, expectedPlugins, marker.managedPlugins ?? []);

  writeMarker(proj, {
    profiles: marker.profiles ?? [],
    extraSkills: marker.extraSkills ?? [],
    managedPlugins: expectedPlugins
  });

  ensureGitignore(proj);
  info(`✓ sync: +${added} skills, -${removed} skills, ${expectedPlugins.length} plugins gérés actifs`);
  info('  (effet à la prochaine session Claude Code)');
  return 0;
}
