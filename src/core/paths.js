// @ts-check
import os from 'node:os';
import path from 'node:path';

export function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}
export function storeDir() {
  return path.join(claudeDir(), 'skills-store');
}
export function profilesDir() {
  return path.join(claudeDir(), 'profiles');
}
/** @param {string} name */
export function profilePath(name) {
  return path.join(profilesDir(), `${name}.json`);
}
/** @param {string} proj */
export function markerPath(proj) {
  return path.join(proj, '.claude', 'ccprofile.json');
}
/** @param {string} proj */
export function skillsDir(proj) {
  return path.join(proj, '.claude', 'skills');
}
/** @param {string} proj */
export function settingsPath(proj) {
  return path.join(proj, '.claude', 'settings.local.json');
}
