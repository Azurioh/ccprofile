// @ts-check
import { CcprofileError } from './util/log.js';
import * as apply from './commands/apply.js';
import * as list from './commands/list.js';
import * as inspect from './commands/inspect.js';
import * as detect from './commands/detect.js';
import * as skill from './commands/skill.js';
import * as verify from './commands/verify.js';
import * as sync from './commands/sync.js';
import * as show from './commands/show.js';
import * as hint from './commands/hint.js';
import * as reset from './commands/reset.js';
import * as validate from './commands/validate.js';
import * as diff from './commands/diff.js';
import * as doctor from './commands/doctor.js';
import * as init from './commands/init.js';
import * as upgrade from './commands/upgrade.js';
import * as exportCmd from './commands/export.js';
import * as importCmd from './commands/import.js';

const USAGE = `ccprofile — plugins/skills Claude Code par projet (global = core minimal)

  ccprofile list                  liste les profils disponibles
  ccprofile detect [--json]       détecte le(s) profil(s) adapté(s) au projet courant
  ccprofile apply <p> [p...]      active le(s) profil(s) dans le projet courant
  ccprofile skill <nom> [nom...]  ajoute un skill à la carte (ex: golang-pro)
  ccprofile verify [--json]       vérifie la dérive : projet vs définition courante du profil
  ccprofile sync                  réconcilie le projet sur la définition courante du profil
  ccprofile inspect <profil>      détaille plugins + skills d'un profil (avec extends)
  ccprofile diff <pA> <pB>        compare deux profils (plugins + skills)
  ccprofile show                  état du projet courant
  ccprofile hint                  ligne unique pour hook SessionStart (silencieux si à jour)
  ccprofile reset                 vide skills + plugins + marqueur du projet courant

Profils : ~/.claude/profiles/*.json     Store : ~/.claude/skills-store
Marqueur: <projet>/.claude/ccprofile.json`;

function usage() {
  process.stdout.write(`${USAGE}\n`);
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
export async function run(argv) {
  const cmd = argv[0] ?? '';
  const rest = argv.slice(1);
  try {
    switch (cmd) {
      case '':
      case '-h':
      case '--help':
      case 'help':
        usage();
        return 0;
      case 'list':
        return await list.run(rest);
      case 'apply':
        return await apply.run(rest);
      case 'detect':
        return await detect.run(rest);
      case 'inspect':
        return await inspect.run(rest);
      case 'skill':
        return await skill.run(rest);
      case 'verify':
        return await verify.run(rest);
      case 'sync':
        return await sync.run(rest);
      case 'show':
        return await show.run(rest);
      case 'hint':
        return await hint.run(rest);
      case 'reset':
        return await reset.run(rest);
      case 'validate':
        return await validate.run(rest);
      case 'diff':
        return await diff.run(rest);
      case 'doctor':
        return await doctor.run(rest);
      case 'init':
        return await init.run(rest);
      case 'upgrade':
        return upgrade.run(rest);
      case 'export':
        return await exportCmd.run(rest);
      case 'import':
        return await importCmd.run(rest);
      default:
        throw new CcprofileError(`commande inconnue: ${cmd} (voir: ccprofile help)`);
    }
  } catch (err) {
    if (err instanceof CcprofileError) {
      process.stderr.write(`ccprofile: ${err.message}\n`);
      return 1;
    }
    throw err;
  }
}
