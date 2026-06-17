// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { profilePath, profilesDir } from '../core/paths.js';
import { readJson } from '../core/json.js';
import { buildSingle, buildBundle, resolvedBody } from '../core/share.js';
import { createGist } from '../core/gist.js';
import { info, die } from '../util/log.js';

/**
 * @param {string[]} args
 * @returns {Promise<number>}
 */
export function run(args) {
  const all = args.includes('--all');
  const resolved = args.includes('--resolved');
  const positional = args.filter((a) => !a.startsWith('--'));

  let filename;
  let content;
  let label;

  if (all) {
    /** @type {Record<string, object>} */
    const map = {};
    let files = [];
    try {
      files = fs.readdirSync(profilesDir()).filter((f) => f.endsWith('.json'));
    } catch {
      files = [];
    }
    for (const f of files.sort()) {
      const body = readJson(path.join(profilesDir(), f), {}) ?? {};
      delete body.meta;
      map[path.basename(f, '.json')] = body;
    }
    if (Object.keys(map).length === 0) {
      die('aucun profil à partager');
    }
    filename = 'ccprofile-bundle.json';
    content = `${JSON.stringify(buildBundle(map, { ccprofileVersion: 1 }), null, 2)}\n`;
    label = `${Object.keys(map).length} profils`;
  } else {
    const name = positional[0];
    if (!name) {
      die('usage: ccprofile share <profil> [--resolved] | --all');
    }
    const file = profilePath(name);
    if (!fs.existsSync(file)) {
      die(`profil inconnu: ${name} (${file} absent)`);
    }
    const body = resolved ? resolvedBody(name) : stripMeta(readJson(file, {}));
    filename = `${name}.json`;
    content = `${JSON.stringify(buildSingle(name, body, { ccprofileVersion: 1, resolved }), null, 2)}\n`;
    label = `profil '${name}'`;
  }

  return createGist({ filename, content, description: `ccprofile — ${label}`, public: true }).then((url) => {
    info(`✓ ${label} partagé`);
    info(`  ${url}`);
    info(`  → import: ccprofile pull ${url}`);
    return 0;
  });
}

/** @param {object} obj */
function stripMeta(obj) {
  const body = { ...obj };
  delete body.meta;
  return body;
}
