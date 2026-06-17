// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { skillsDir, markerPath, committedSettingsPath } from '../core/paths.js';
import { projectDir } from '../core/project.js';
import { clearEnabledPlugins } from '../core/settings.js';
import { info } from '../util/log.js';

/** @param {string[]} _args */
export function run(_args) {
  const proj = projectDir();
  const dir = skillsDir(proj);
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    entries = [];
  }
  let removedAny = false;
  for (const base of entries) {
    const full = path.join(dir, base);
    try {
      if (fs.lstatSync(full).isSymbolicLink()) {
        fs.rmSync(full, { force: true });
        removedAny = true;
      }
    } catch {
      /* ignore */
    }
  }
  if (removedAny) {
    info('✓ skills projet vidés');
  }
  if (fs.existsSync(committedSettingsPath(proj))) {
    clearEnabledPlugins(proj);
    info('✓ enabledPlugins retiré de settings.json');
  }
  if (fs.existsSync(markerPath(proj))) {
    fs.rmSync(markerPath(proj), { force: true });
    info('✓ marqueur .claude/ccprofile.json supprimé');
  }
  return 0;
}
