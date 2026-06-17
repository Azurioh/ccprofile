// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { skillsDir } from '../core/paths.js';
import { projectDir } from '../core/project.js';
import { readEnabledPlugins } from '../core/settings.js';
import { info } from '../util/log.js';

/** @param {string[]} _args */
export function run(_args) {
  const proj = projectDir();
  info(`Projet : ${proj}`);
  info('-- skills projet --');
  const dir = skillsDir(proj);
  let entries = [];
  try {
    entries = fs.readdirSync(dir).sort();
  } catch {
    entries = [];
  }
  const visible = entries.filter((e) => fs.existsSync(path.join(dir, e)));
  if (visible.length === 0) {
    info('  (aucun)');
  } else {
    for (const e of visible) {
      info(`  ${path.basename(e)}`);
    }
  }
  info('-- plugins activés (settings.local.json) --');
  const plugins = readEnabledPlugins(proj);
  if (plugins.length === 0) {
    info('  (aucun)');
  } else {
    for (const p of plugins) {
      info(`  ${p}`);
    }
  }
  return 0;
}
