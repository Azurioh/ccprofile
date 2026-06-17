// @ts-check
import fs from 'node:fs';
import { profilePath } from './paths.js';
import { readJson } from './json.js';
import { die } from '../util/log.js';

/**
 * @param {string} name
 * @returns {{ extends?: string[], plugins?: string[], skills?: string[], description?: string }}
 */
export function readProfile(name) {
  const file = profilePath(name);
  if (!fs.existsSync(file)) {
    die(`profil inconnu: ${name} (${file} absent)`);
  }
  return readJson(file, {});
}

/**
 * @param {string[]} names
 * @returns {{ plugins: string[], skills: string[] }}
 */
export function resolveProfiles(names) {
  /** @type {string[]} */ const plugins = [];
  /** @type {string[]} */ const skills = [];
  const seen = new Set();

  /** @param {string} name */
  function visit(name) {
    if (seen.has(name)) {
      return;
    }
    const prof = readProfile(name);
    seen.add(name);
    for (const ext of prof.extends ?? []) {
      visit(ext);
    }
    for (const p of prof.plugins ?? []) {
      plugins.push(p);
    }
    for (const s of prof.skills ?? []) {
      skills.push(s);
    }
  }

  for (const n of names) {
    if (n) {
      visit(n);
    }
  }
  return { plugins: dedup(plugins), skills: dedup(skills) };
}

/** @param {string[]} arr */
function dedup(arr) {
  return [...new Set(arr.filter(Boolean))];
}
