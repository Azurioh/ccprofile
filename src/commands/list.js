// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { profilesDir } from '../core/paths.js';
import { readJson } from '../core/json.js';
import { info } from '../util/log.js';

/** @param {string[]} _args */
export function run(_args) {
  const dir = profilesDir();
  info(`Profils disponibles (${dir}):`);
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  } catch {
    files = [];
  }
  if (files.length === 0) {
    info('  (aucun)');
    return 0;
  }
  for (const f of files) {
    const n = path.basename(f, '.json');
    const prof = readJson(path.join(dir, f), {}) ?? {};
    const np = (prof.plugins ?? []).length;
    const ns = (prof.skills ?? []).length;
    const ext = (prof.extends ?? []).length > 0 ? ` + ${prof.extends.join(',')}` : '';
    info(`  ${n.padEnd(12)} ${String(np).padStart(2)} plugins, ${String(ns).padStart(2)} skills${ext}`);
  }
  return 0;
}
