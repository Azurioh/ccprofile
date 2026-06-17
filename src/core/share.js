// @ts-check
import fs from 'node:fs';
import { storeDir } from './paths.js';
import { resolveProfiles } from './profiles.js';

const BUNDLE_VERSION = 1;

/**
 * @param {string} name
 * @param {object} body
 * @param {object} [meta]
 */
export function buildSingle(name, body, meta = {}) {
  return { ...body, meta: { name, ...meta } };
}

/**
 * @param {Record<string, object>} profilesMap
 * @param {object} [meta]
 */
export function buildBundle(profilesMap, meta = {}) {
  return { ccprofileBundle: BUNDLE_VERSION, meta, profiles: profilesMap };
}

/**
 * @param {string} text
 * @returns {{ kind: 'single'|'bundle', profiles: Record<string, object> }}
 */
export function parseShared(text) {
  const obj = JSON.parse(text);
  if (obj && obj.ccprofileBundle) {
    return { kind: 'bundle', profiles: obj.profiles ?? {} };
  }
  const name = obj?.meta?.name ?? 'imported';
  const body = { ...obj };
  delete body.meta;
  return { kind: 'single', profiles: { [name]: body } };
}

export function storeSkillSet() {
  try {
    return new Set(fs.readdirSync(storeDir()));
  } catch {
    return new Set();
  }
}

/**
 * @param {{ skills?: string[], plugins?: string[] }} body
 * @returns {{ missingSkills: string[], requiredPlugins: string[] }}
 */
export function dependencyReport(body) {
  const store = storeSkillSet();
  const missingSkills = (body.skills ?? []).filter((s) => !store.has(s)).sort();
  const requiredPlugins = [...(body.plugins ?? [])].sort();
  return { missingSkills, requiredPlugins };
}

/**
 * Flatten a profile (resolving extends) into a standalone body.
 * @param {string} name
 */
export function resolvedBody(name) {
  const { plugins, skills } = resolveProfiles([name]);
  return { plugins, skills };
}
