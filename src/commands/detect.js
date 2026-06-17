// @ts-check
import { projectDir } from '../core/project.js';
import { detect } from '../core/detect.js';
import { info } from '../util/log.js';

/** @param {string[]} args */
export function run(args) {
  const jsonMode = args[0] === '--json';
  const proj = projectDir();
  const result = detect(proj);

  if (jsonMode) {
    info(JSON.stringify(result));
    return 0;
  }

  info(`Projet     : ${proj}`);
  const rec = result.recommended.length
    ? result.recommended.join(', ')
    : '(aucun signal dev — choix manuel: content/marketing/…)';
  info(`Recommandé : ${rec}`);
  info('-- candidats --');
  if (result.candidates.length > 0) {
    for (const c of result.candidates) {
      info(`  ${c.profile}  (score ${c.score}) : ${c.signals.join(', ')}`);
    }
  } else {
    info('  (aucun signal détecté)');
  }
  info(`Appliqué   : ${result.applied.length ? result.applied.join(', ') : '(aucun)'}`);
  return 0;
}
