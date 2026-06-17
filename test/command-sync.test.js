import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readMarker } from '../src/core/marker.js';

test('sync removes off-profile skills and relinks expected', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.mkdirSync(path.join(home, 'skills-store', 'want'), { recursive: true });
  fs.writeFileSync(path.join(home, 'profiles', 'p.json'), JSON.stringify({ plugins: [], skills: ['want'] }));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  const sdir = path.join(proj, '.claude', 'skills');
  fs.mkdirSync(sdir, { recursive: true });
  fs.symlinkSync(path.join(home, 'skills-store'), path.join(sdir, 'stale'), process.platform === 'win32' ? 'junction' : 'dir');
  fs.writeFileSync(path.join(proj, '.claude', 'ccprofile.json'), JSON.stringify({ profiles: ['p'], extraSkills: [], managedPlugins: [], v: 1 }));

  const cwd = process.cwd();
  process.chdir(proj);
  const sync = await import('../src/commands/sync.js');
  const code = await sync.run([]);
  process.chdir(cwd);

  assert.equal(code, 0);
  assert.equal(fs.existsSync(path.join(sdir, 'want')), true);
  assert.equal(fs.existsSync(path.join(sdir, 'stale')), false);
  assert.deepEqual(readMarker(proj).managedPlugins, []);
});
