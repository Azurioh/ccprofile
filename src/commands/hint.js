// @ts-check
import { projectDir } from '../core/project.js';
import { readMarker } from '../core/marker.js';
import { computeDrift } from '../core/drift.js';
import { detect } from '../core/detect.js';
import { info } from '../util/log.js';

/** @param {string[]} _args */
export function run(_args) {
  try {
    const proj = projectDir();
    const marker = readMarker(proj);
    if (marker) {
      const { count } = computeDrift(proj, marker);
      if (count > 0) {
        const prof = (marker.profiles ?? []).join(',');
        info(`⚠ ccprofile: profil '${prof}' obsolète (${count} écart(s)) — lance: ccprofile sync`);
      }
    } else {
      const rec = detect(proj).recommended;
      if (rec.length > 0) {
        info(`ccprofile: aucun profil appliqué ; détecté → ${rec.join(' ')} (lance: ccprofile apply ${rec.join(' ')})`);
      }
    }
  } catch {
    /* hint must never fail a session */
  }
  return 0;
}
