// @ts-check
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { die } from '../util/log.js';

export function hasGh() {
  return spawnSync('gh', ['--version'], { encoding: 'utf8' }).status === 0;
}

function token() {
  return process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
}

/**
 * @param {{ filename: string, content: string, description?: string, public?: boolean }} opts
 * @returns {Promise<string>} gist URL
 */
export async function createGist(opts) {
  const { filename, content, description = 'ccprofile', public: pub = true } = opts;
  if (hasGh()) {
    const tmp = path.join(os.tmpdir(), `ccprofile-${process.pid}-${filename}`);
    fs.writeFileSync(tmp, content);
    try {
      const ghArgs = ['gist', 'create', tmp, '--desc', description];
      if (pub) {
        ghArgs.push('--public');
      }
      const r = spawnSync('gh', ghArgs, { encoding: 'utf8' });
      if (r.status !== 0) {
        die(`gh gist create a échoué: ${(r.stderr || '').trim()}`);
      }
      return r.stdout.trim();
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
  if (!token()) {
    die('partage impossible: installe `gh` (gh auth login) ou définis GH_TOKEN');
  }
  const tok = token();
  let res;
  try {
    res = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github+json' },
      body: JSON.stringify({ description, public: pub, files: { [filename]: { content } } })
    });
  } catch (e) {
    die(`gist: échec réseau (${/** @type {Error} */ (e).message})`);
  }
  if (!res.ok) {
    die(`création du gist échouée (${res.status})`);
  }
  let json;
  try {
    json = await res.json();
  } catch (e) {
    die(`gist: échec réseau (${/** @type {Error} */ (e).message})`);
  }
  return json.html_url;
}

/**
 * @param {string} idOrUrl
 * @returns {Promise<string>} first file's content
 */
export async function fetchGist(idOrUrl) {
  const id = idOrUrl.replace(/^https?:\/\/gist\.github\.com\/[^/]+\//, '').replace(/^https?:\/\/gist\.github\.com\//, '').replace(/\/$/, '');
  if (hasGh()) {
    const r = spawnSync('gh', ['gist', 'view', id, '--raw'], { encoding: 'utf8' });
    if (r.status !== 0) {
      die(`gh gist view a échoué: ${(r.stderr || '').trim()}`);
    }
    return r.stdout;
  }
  const tok = token();
  const headers = { Accept: 'application/vnd.github+json' };
  if (tok) {
    headers.Authorization = `Bearer ${tok}`;
  }
  let res;
  try {
    res = await fetch(`https://api.github.com/gists/${id}`, { headers });
  } catch (e) {
    die(`gist: échec réseau (${/** @type {Error} */ (e).message})`);
  }
  if (!res.ok) {
    die(`récupération du gist échouée (${res.status})`);
  }
  let json;
  try {
    json = await res.json();
  } catch (e) {
    die(`gist: échec réseau (${/** @type {Error} */ (e).message})`);
  }
  const files = Object.values(json.files ?? {});
  if (files.length === 0) {
    die('gist vide');
  }
  return files[0].content;
}
