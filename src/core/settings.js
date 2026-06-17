// @ts-check
import { committedSettingsPath, globalSettingsPath } from './paths.js';
import { readJson, writeJsonAtomic } from './json.js';

export const OFFICIAL_MARKETPLACE = 'claude-plugins-official';

/** @param {string} proj */
function load(proj) {
  return readJson(committedSettingsPath(proj), {});
}

/** @param {string} proj */
export function readEnabledPlugins(proj) {
  const enabled = load(proj).enabledPlugins ?? {};
  return Object.keys(enabled).filter((k) => enabled[k] === true).sort();
}

/** @param {string} proj @param {string[]} names */
export function mergePlugins(proj, names) {
  const s = load(proj);
  s.enabledPlugins = s.enabledPlugins ?? {};
  for (const n of names) {
    s.enabledPlugins[n] = true;
  }
  writeJsonAtomic(committedSettingsPath(proj), s);
}

/** @param {string} proj @param {string[]} expected @param {string[]} managed */
export function reconcilePlugins(proj, expected, managed) {
  const s = load(proj);
  const current = s.enabledPlugins ?? {};
  const managedSet = new Set(managed);
  const expectedSet = new Set(expected);
  /** @type {Record<string, boolean>} */
  const next = {};
  for (const k of Object.keys(current)) {
    if (!managedSet.has(k) || expectedSet.has(k)) {
      next[k] = current[k];
    }
  }
  for (const p of expected) {
    next[p] = true;
  }
  s.enabledPlugins = next;
  writeJsonAtomic(committedSettingsPath(proj), s);
}

/** @param {string} proj */
export function clearEnabledPlugins(proj) {
  const s = load(proj);
  delete s.enabledPlugins;
  writeJsonAtomic(committedSettingsPath(proj), s);
}

/** @param {string} pluginKey */
export function marketplaceOf(pluginKey) {
  const at = pluginKey.lastIndexOf('@');
  return at >= 0 ? pluginKey.slice(at + 1) : '';
}

/** @param {string[]} pluginKeys */
export function requiredMarketplaces(pluginKeys) {
  const names = pluginKeys
    .map(marketplaceOf)
    .filter((m) => m && m !== OFFICIAL_MARKETPLACE);
  return [...new Set(names)].sort();
}

export function globalMarketplaceSources() {
  return readJson(globalSettingsPath(), {}).extraKnownMarketplaces ?? {};
}

/** @param {string} proj */
export function readMarketplaceNames(proj) {
  return Object.keys(load(proj).extraKnownMarketplaces ?? {}).sort();
}

/**
 * @param {string} proj @param {string[]} names
 * @returns {{ added: string[], missing: string[] }}
 */
export function mergeMarketplaces(proj, names) {
  const sources = globalMarketplaceSources();
  const s = load(proj);
  s.extraKnownMarketplaces = s.extraKnownMarketplaces ?? {};
  const added = [];
  const missing = [];
  for (const name of names) {
    if (sources[name]) {
      s.extraKnownMarketplaces[name] = sources[name];
      added.push(name);
    } else {
      missing.push(name);
    }
  }
  writeJsonAtomic(committedSettingsPath(proj), s);
  return { added: added.sort(), missing: missing.sort() };
}

/**
 * @param {string} proj @param {string[]} expected @param {string[]} managed
 * @returns {{ missing: string[] }}
 */
export function reconcileMarketplaces(proj, expected, managed) {
  const sources = globalMarketplaceSources();
  const s = load(proj);
  const current = s.extraKnownMarketplaces ?? {};
  const managedSet = new Set(managed);
  const expectedSet = new Set(expected);
  /** @type {Record<string, *>} */
  const next = {};
  for (const k of Object.keys(current)) {
    if (!managedSet.has(k) || expectedSet.has(k)) {
      next[k] = current[k];
    }
  }
  const missing = [];
  for (const name of expected) {
    if (sources[name]) {
      next[name] = sources[name];
    } else if (!next[name]) {
      missing.push(name);
    }
  }
  s.extraKnownMarketplaces = next;
  writeJsonAtomic(committedSettingsPath(proj), s);
  return { missing: missing.sort() };
}

/** @param {string} proj @param {string[]} managed */
export function clearMarketplaces(proj, managed) {
  const s = load(proj);
  const current = s.extraKnownMarketplaces ?? {};
  for (const name of managed) {
    delete current[name];
  }
  if (Object.keys(current).length === 0) {
    delete s.extraKnownMarketplaces;
  } else {
    s.extraKnownMarketplaces = current;
  }
  writeJsonAtomic(committedSettingsPath(proj), s);
}
