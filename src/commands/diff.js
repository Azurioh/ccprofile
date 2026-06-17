// @ts-check
import { resolveProfiles } from '../core/profiles.js';
import { info, die } from '../util/log.js';

/** @param {string[]} args */
export function run(args) {
  const [a, b] = args;
  if (!a || !b) {
    die('usage: ccprofile diff <profilA> <profilB>');
  }
  const ra = resolveProfiles([a]);
  const rb = resolveProfiles([b]);

  info(`diff ${a} → ${b}`);
  section('plugins', ra.plugins, rb.plugins);
  section('skills', ra.skills, rb.skills);
  return 0;
}

/**
 * @param {string} title
 * @param {string[]} from
 * @param {string[]} to
 */
function section(title, from, to) {
  const setFrom = new Set(from);
  const setTo = new Set(to);
  const added = to.filter((x) => !setFrom.has(x)).sort();
  const removed = from.filter((x) => !setTo.has(x)).sort();
  info(`-- ${title} --`);
  if (added.length === 0 && removed.length === 0) {
    info('  (identiques)');
    return;
  }
  for (const x of removed) {
    info(`  - ${x}`);
  }
  for (const x of added) {
    info(`  + ${x}`);
  }
}
