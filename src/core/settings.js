// @ts-check
import { settingsPath } from './paths.js';
import { readJson, writeJsonAtomic } from './json.js';

/** @param {string} proj */
function load(proj) {
  return readJson(settingsPath(proj), {});
}

/** @param {string} proj */
export function readEnabledPlugins(proj) {
  const s = load(proj);
  const enabled = s.enabledPlugins ?? {};
  return Object.keys(enabled)
    .filter((k) => enabled[k] === true)
    .sort();
}

/**
 * @param {string} proj
 * @param {string[]} names
 */
export function mergePlugins(proj, names) {
  const s = load(proj);
  s.enabledPlugins = s.enabledPlugins ?? {};
  for (const n of names) {
    s.enabledPlugins[n] = true;
  }
  writeJsonAtomic(settingsPath(proj), s);
}

/**
 * Reconcile managed set: remove (managed ∖ expected), keep manual, set expected true.
 * @param {string} proj
 * @param {string[]} expected
 * @param {string[]} managed
 */
export function reconcilePlugins(proj, expected, managed) {
  const s = load(proj);
  const current = s.enabledPlugins ?? {};
  const managedSet = new Set(managed);
  const expectedSet = new Set(expected);
  /** @type {Record<string, boolean>} */
  const next = {};
  for (const k of Object.keys(current)) {
    // keep if not managed, or still expected
    if (!managedSet.has(k) || expectedSet.has(k)) {
      next[k] = current[k];
    }
  }
  for (const p of expected) {
    next[p] = true;
  }
  s.enabledPlugins = next;
  writeJsonAtomic(settingsPath(proj), s);
}

/** @param {string} proj */
export function clearEnabledPlugins(proj) {
  const s = load(proj);
  delete s.enabledPlugins;
  writeJsonAtomic(settingsPath(proj), s);
}
