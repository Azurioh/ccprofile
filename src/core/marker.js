// @ts-check
import { markerPath } from './paths.js';
import { readJson, writeJsonAtomic } from './json.js';

/** @param {string} proj */
export function readMarker(proj) {
  return readJson(markerPath(proj), null);
}

/**
 * @param {string} proj
 * @param {{ profiles: string[], extraSkills: string[], managedPlugins: string[] }} data
 */
export function writeMarker(proj, { profiles, extraSkills, managedPlugins }) {
  writeJsonAtomic(markerPath(proj), {
    profiles,
    extraSkills,
    managedPlugins,
    appliedAt: new Date().toISOString(),
    v: 1
  });
}
