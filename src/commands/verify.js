// @ts-check
import { projectDir } from '../core/project.js';
import { readMarker } from '../core/marker.js';
import { computeDrift } from '../core/drift.js';
import { info } from '../util/log.js';

/** @param {string[]} args */
export function run(args) {
  const jsonMode = args[0] === '--json';
  const proj = projectDir();
  const marker = readMarker(proj);
  if (!marker) {
    if (jsonMode) {
      info(JSON.stringify({ status: 'no-marker' }));
    } else {
      info('ccprofile: aucun profil appliqué (pas de .claude/ccprofile.json)');
    }
    return 3;
  }

  const d = computeDrift(proj, marker);

  if (jsonMode) {
    info(JSON.stringify({
      status: d.count === 0 ? 'in-sync' : 'drift',
      missingSkills: d.missingSkills,
      extraSkills: d.extraSkills,
      missingPlugins: d.missingPlugins,
      stalePlugins: d.stalePlugins,
      broken: d.broken
    }));
  } else if (d.count === 0) {
    info(`✓ ccprofile: projet à jour avec '${(marker.profiles ?? []).join(' ')}'`);
  } else {
    info(`⚠ ccprofile: dérive détectée (${d.count} écart(s))`);
    printList('skills manquants (profil enrichi)', d.missingSkills);
    printList('skills en trop (profil réduit / orphelins)', d.extraSkills);
    printList('plugins manquants', d.missingPlugins);
    printList('plugins obsolètes', d.stalePlugins);
    printList('symlinks cassés (skill retiré du store)', d.broken);
    info('  → lance: ccprofile sync');
  }
  return d.count === 0 ? 0 : 1;
}

/**
 * @param {string} title
 * @param {string[]} body
 */
function printList(title, body) {
  if (body.length === 0) {
    return;
  }
  info(`  ${title} :`);
  for (const line of body) {
    info(`    - ${line}`);
  }
}
