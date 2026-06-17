// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { skillsDir } from '../core/paths.js';
import { projectDir } from '../core/project.js';
import { readMarker, writeMarker } from '../core/marker.js';
import { resolveProfiles } from '../core/profiles.js';
import { vendorSkill } from '../core/vendor.js';
import { reconcilePlugins, reconcileMarketplaces, requiredMarketplaces } from '../core/settings.js';
import { ensureGitignore } from '../core/gitignore.js';
import { info, warn, die } from '../util/log.js';

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
  const expectedMkts = requiredMarketplaces(expectedPlugins);
  const dir = skillsDir(proj);

  let current = [];
  try {
    current = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() || e.isSymbolicLink()).map((e) => e.name);
  } catch {
    current = [];
  }

  if (dryRun) {
    const toRemove = current.filter((b) => !expectedSkills.has(b)).sort();
    const toCopy = [...expectedSkills].sort();
    info('sync (dry-run — aucune écriture)');
    info(`  skills à retirer : ${toRemove.length ? toRemove.join(', ') : '(aucun)'}`);
    info(`  skills à copier  : ${toCopy.length ? toCopy.join(', ') : '(aucun)'}`);
    info(`  plugins gérés    : ${expectedPlugins.length ? expectedPlugins.join(', ') : '(aucun)'}`);
    info(`  marketplaces     : ${expectedMkts.length ? expectedMkts.join(', ') : '(aucune)'}`);
    return 0;
  }

  fs.mkdirSync(dir, { recursive: true });
  let removed = 0;
  for (const base of current) {
    if (!expectedSkills.has(base)) {
      fs.rmSync(path.join(dir, base), { recursive: true, force: true });
      removed += 1;
    }
  }
  let added = 0;
  for (const s of expectedSkills) {
    const existed = current.includes(s);
    if (vendorSkill(s, dir) && !existed) {
      added += 1;
    }
  }

  reconcilePlugins(proj, expectedPlugins, marker.managedPlugins ?? []);
  const res = reconcileMarketplaces(proj, expectedMkts, marker.managedMarketplaces ?? []);
  if (res.missing.length > 0) {
    warn(`  ⚠ marketplaces introuvables: ${res.missing.join(', ')}`);
  }

  writeMarker(proj, {
    profiles: marker.profiles ?? [],
    extraSkills: marker.extraSkills ?? [],
    managedPlugins: expectedPlugins,
    managedMarketplaces: expectedMkts
  });

  ensureGitignore(proj);
  info(`✓ sync: +${added} skills, -${removed} skills, ${expectedPlugins.length} plugins gérés, ${expectedMkts.length} marketplace(s)`);
  info('  (effet à la prochaine session Claude Code)');
  return 0;
}
