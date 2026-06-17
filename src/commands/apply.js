// @ts-check
import fs from 'node:fs';
import { skillsDir } from '../core/paths.js';
import { projectDir } from '../core/project.js';
import { resolveProfiles } from '../core/profiles.js';
import { vendorSkill } from '../core/vendor.js';
import { mergePlugins, requiredMarketplaces, mergeMarketplaces } from '../core/settings.js';
import { readMarker, writeMarker } from '../core/marker.js';
import { ensureGitignore } from '../core/gitignore.js';
import { info, warn, die } from '../util/log.js';

/** @param {string[]} args */
export function run(args) {
  const dryRun = args.includes('--dry-run');
  const profileArgs = args.filter((a) => a !== '--dry-run');
  if (profileArgs.length < 1) {
    die('usage: ccprofile apply <profil> [profil...] [--dry-run]');
  }
  const proj = projectDir();
  const { plugins, skills } = resolveProfiles(profileArgs);
  const marketplaces = requiredMarketplaces(plugins);

  if (dryRun) {
    info(`Projet : ${proj}`);
    info(`Profils: ${profileArgs.join(' ')}  (dry-run — aucune écriture)`);
    info(`  skills à copier      : ${skills.length ? skills.join(', ') : '(aucun)'}`);
    info(`  plugins à activer    : ${plugins.length ? plugins.join(', ') : '(aucun)'}`);
    info(`  marketplaces à ajouter : ${marketplaces.length ? marketplaces.join(', ') : '(aucune)'}`);
    return 0;
  }

  const dest = skillsDir(proj);
  fs.mkdirSync(dest, { recursive: true });

  let ns = 0;
  for (const s of skills) {
    if (vendorSkill(s, dest)) {
      ns += 1;
    }
  }
  if (plugins.length > 0) {
    mergePlugins(proj, plugins);
  }
  let added = [];
  if (marketplaces.length > 0) {
    const res = mergeMarketplaces(proj, marketplaces);
    added = res.added;
    if (res.missing.length > 0) {
      warn(`  ⚠ marketplaces introuvables dans ~/.claude/settings.json: ${res.missing.join(', ')}`);
    }
  }

  const prev = readMarker(proj);
  const profiles = [...new Set(profileArgs)].sort();
  const managed = [...new Set([...(prev?.managedPlugins ?? []), ...plugins])].sort();
  const managedMkts = [...new Set([...(prev?.managedMarketplaces ?? []), ...added])].sort();
  writeMarker(proj, {
    profiles,
    extraSkills: prev?.extraSkills ?? [],
    managedPlugins: managed,
    managedMarketplaces: managedMkts
  });

  ensureGitignore(proj);
  info(`✓ ${ns} skills copiés, ${plugins.length} plugins activés (.claude/settings.json), ${added.length} marketplace(s) ajouté(s)`);
  info('  skills + plugins commités avec le repo → portables (autre machine / conteneur cloud)');
  info('  (effet à la prochaine session Claude Code)');
  return 0;
}
