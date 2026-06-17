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
  if (args.length < 1) {
    die('usage: ccprofile apply <profil> [profil...]');
  }
  const proj = projectDir();
  const dest = skillsDir(proj);
  fs.mkdirSync(dest, { recursive: true });

  const { plugins, skills } = resolveProfiles(args);

  info(`Projet : ${proj}`);
  info(`Profils: ${args.join(' ')}`);

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
  const profiles = [...new Set(args)];
  const managed = [...new Set([...prevManaged, ...plugins])];
  writeMarker(proj, { profiles, extraSkills: prevExtra, managedPlugins: managed });

  ensureGitignore(proj);
  info(`✓ ${ns} skills symlinkés, ${plugins.length} plugins activés → .claude/settings.local.json`);
  info('  marqueur écrit → .claude/ccprofile.json');
  info('  (effet à la prochaine session Claude Code)');
  return 0;
}
