// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { skillsDir } from './paths.js';
import { readEnabledPlugins } from './settings.js';
import { resolveProfiles } from './profiles.js';
import { isBrokenLink } from './links.js';

const sortedUnique = (arr) => [...new Set(arr.filter(Boolean))].sort();
const diff = (a, b) => { const sb = new Set(b); return a.filter((x) => !sb.has(x)); };
const inter = (a, b) => { const sb = new Set(b); return a.filter((x) => sb.has(x)); };

/**
 * Compute drift between a project's marker-expected state and its actual state.
 * @param {string} proj
 * @param {{ profiles?: string[], extraSkills?: string[], managedPlugins?: string[] }} marker
 * @returns {{ missingSkills: string[], extraSkills: string[], missingPlugins: string[], stalePlugins: string[], broken: string[], count: number }}
 */
export function computeDrift(proj, marker) {
  const { plugins, skills } = resolveProfiles(marker.profiles ?? []);
  const expectedSkills = sortedUnique([...skills, ...(marker.extraSkills ?? [])]);
  const expectedPlugins = sortedUnique(plugins);

  const dir = skillsDir(proj);
  let actualSkills = [];
  try {
    actualSkills = sortedUnique(fs.readdirSync(dir));
  } catch {
    actualSkills = [];
  }
  const actualPlugins = readEnabledPlugins(proj);
  const managed = sortedUnique(marker.managedPlugins ?? []);

  const missingSkills = diff(expectedSkills, actualSkills);
  const extraSkills = diff(actualSkills, expectedSkills);
  const missingPlugins = diff(expectedPlugins, actualPlugins);
  const stalePlugins = diff(inter(managed, actualPlugins), expectedPlugins);

  let broken = [];
  try {
    broken = actualSkills.filter((b) => isBrokenLink(path.join(dir, b)));
  } catch {
    broken = [];
  }

  const count =
    missingSkills.length + extraSkills.length + missingPlugins.length + stalePlugins.length + broken.length;
  return { missingSkills, extraSkills, missingPlugins, stalePlugins, broken, count };
}
