// @ts-check
import fs from 'node:fs';
import { skillsDir } from '../core/paths.js';
import { projectDir } from '../core/project.js';
import { linkSkill } from '../core/links.js';
import { ensureGitignore } from '../core/gitignore.js';
import { readMarker, writeMarker } from '../core/marker.js';
import { info, die } from '../util/log.js';

/** @param {string[]} args */
export function run(args) {
  if (args.length < 1) {
    die('usage: ccprofile skill <nom> [nom...]');
  }
  const proj = projectDir();
  const dest = skillsDir(proj);
  fs.mkdirSync(dest, { recursive: true });
  ensureGitignore(proj);

  let ok = 0;
  for (const s of args) {
    if (linkSkill(s, dest)) {
      ok += 1;
    }
  }

  const prev = readMarker(proj);
  const extra = [...new Set([...(prev?.extraSkills ?? []), ...args])].sort();
  if (prev) {
    writeMarker(proj, {
      profiles: prev.profiles ?? [],
      extraSkills: extra,
      managedPlugins: prev.managedPlugins ?? []
    });
  } else {
    writeMarker(proj, { profiles: [], extraSkills: extra, managedPlugins: [] });
  }
  info(`✓ ${ok} skill(s) ajouté(s) → ${dest} (suivi dans .claude/ccprofile.json)`);
  return 0;
}
