// @ts-check
import { fetchGist } from '../core/gist.js';
import { importProfiles } from './import.js';
import { die } from '../util/log.js';

/**
 * @param {string[]} args
 * @returns {Promise<number>}
 */
export async function run(args) {
  const positional = args.filter((a) => !a.startsWith('--'));
  const idOrUrl = positional[0];
  if (!idOrUrl) {
    die('usage: ccprofile pull <gist-id|url> [--overwrite|--rename <nom>]');
  }
  const renameIdx = args.indexOf('--rename');
  const opts = {
    overwrite: args.includes('--overwrite'),
    rename: renameIdx >= 0 ? args[renameIdx + 1] : undefined
  };
  const text = await fetchGist(idOrUrl);
  return importProfiles(text, opts);
}
