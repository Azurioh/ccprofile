// @ts-check
import fs from 'node:fs';
import { skillsDir } from '../core/paths.js';
import { projectDir } from '../core/project.js';
import { resolveProfiles } from '../core/profiles.js';
import { linkSkill } from '../core/links.js';
import { mergePlugins } from '../core/settings.js';
import { readMarker, writeMarker } from '../core/marker.js';
import { ensureGitignore } from '../core/gitignore.js';
import { info, die } from '../util/log.js';

/** @param {string[]} args */
export function run(args) {
  const dryRun = args.includes('--dry-run');
  const profileArgs = args.filter((a) => a !== '--dry-run');
  if (profileArgs.length < 1) {
    die('usage: ccprofile apply <profil> [profil...] [--dry-run]');
  }
  const proj = projectDir();
  const { plugins, skills } = resolveProfiles(profileArgs);

  if (dryRun) {
    info(`Projet : ${proj}`);
    info(`Profils: ${profileArgs.join(' ')}  (dry-run — aucune écriture)`);
    info(`  skills à lier  : ${skills.length ? skills.join(', ') : '(aucun)'}`);
    info(`  plugins à activer : ${plugins.length ? plugins.join(', ') : '(aucun)'}`);
    return 0;
  }

  const dest = skillsDir(proj);
  fs.mkdirSync(dest, { recursive: true });

  info(`Projet : ${proj}`);
  info(`Profils: ${profileArgs.join(' ')}`);

  let ns = 0;
  for (const s of skills) {
    if (linkSkill(s, dest)) {
      ns += 1;
    }
  }
  if (plugins.length > 0) {
    mergePlugins(proj, plugins);
  }

  const prev = readMarker(proj);
  const prevExtra = prev?.extraSkills ?? [];
  const prevManaged = prev?.managedPlugins ?? [];
  const profiles = [...new Set(profileArgs)].sort();
  const managed = [...new Set([...prevManaged, ...plugins])].sort();
  writeMarker(proj, { profiles, extraSkills: prevExtra, managedPlugins: managed, managedMarketplaces: prev?.managedMarketplaces ?? [] });

  ensureGitignore(proj);
  info(`✓ ${ns} skills symlinkés, ${plugins.length} plugins activés → .claude/settings.json`);
  info('  marqueur écrit → .claude/ccprofile.json');
  info('  (effet à la prochaine session Claude Code)');
  return 0;
}
