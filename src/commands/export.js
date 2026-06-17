// @ts-check
import fs from 'node:fs';
import { profilePath } from '../core/paths.js';
import { readJson } from '../core/json.js';
import { buildSingle, resolvedBody } from '../core/share.js';
import { info, die } from '../util/log.js';

/** @param {string[]} args */
export function run(args) {
  const positional = args.filter((a) => !a.startsWith('--'));
  const name = positional[0];
  if (!name) {
    die('usage: ccprofile export <profil> [--resolved] [--out <fichier>]');
  }
  const file = profilePath(name);
  if (!fs.existsSync(file)) {
    die(`profil inconnu: ${name} (${file} absent)`);
  }
  const resolved = args.includes('--resolved');
  const outIdx = args.indexOf('--out');
  const outFile = outIdx >= 0 ? args[outIdx + 1] : null;

  const body = resolved ? resolvedBody(name) : stripMeta(readJson(file, {}));
  const shared = buildSingle(name, body, { ccprofileVersion: 1, resolved });
  const text = `${JSON.stringify(shared, null, 2)}\n`;

  if (outFile) {
    fs.writeFileSync(outFile, text);
    info(`✓ profil '${name}' exporté → ${outFile}`);
  } else {
    process.stdout.write(text);
  }
  return 0;
}

/** @param {object} obj */
function stripMeta(obj) {
  const body = { ...obj };
  delete body.meta;
  return body;
}
