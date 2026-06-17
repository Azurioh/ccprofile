import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readMarker } from '../src/core/marker.js';

test('sync removes off-profile skills and copy-refreshes expected (v:2 marker)', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;

  // Set up profiles directory and profile definition
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.writeFileSync(
    path.join(home, 'profiles', 'p.json'),
    JSON.stringify({ plugins: [], skills: ['want'] })
  );

  // Set up a real store skill (directory with a real file inside, not a symlink)
  const storeSkillDir = path.join(home, 'skills-store', 'want');
  fs.mkdirSync(storeSkillDir, { recursive: true });
  fs.writeFileSync(path.join(storeSkillDir, 'skill.md'), '# want skill');

  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  const sdir = path.join(proj, '.claude', 'skills');
  fs.mkdirSync(sdir, { recursive: true });

  // Create a stale skill dir (off-profile)
  fs.mkdirSync(path.join(sdir, 'stale'), { recursive: true });

  // Write a v:2 marker
  fs.writeFileSync(
    path.join(proj, '.claude', 'ccprofile.json'),
    JSON.stringify({
      profiles: ['p'],
      extraSkills: [],
      managedPlugins: [],
      managedMarketplaces: [],
      v: 2
    })
  );

  const cwd = process.cwd();
  process.chdir(proj);
  // Import fresh module (bust cache with timestamp query param)
  const sync = await import(`../src/commands/sync.js?t=${Date.now()}`);
  const code = sync.run([]);
  process.chdir(cwd);

  assert.equal(code, 0);

  // Stale off-profile dir must be removed
  assert.equal(fs.existsSync(path.join(sdir, 'stale')), false, 'stale skill dir should be removed');

  // Expected skill must exist as a real copied directory (not a symlink)
  const wantPath = path.join(sdir, 'want');
  assert.equal(fs.existsSync(wantPath), true, 'expected skill dir should exist');
  const stat = fs.lstatSync(wantPath);
  assert.equal(stat.isDirectory(), true, 'expected skill should be a real directory (not symlink)');
  assert.equal(stat.isSymbolicLink(), false, 'expected skill must not be a symlink');

  // The copied skill should contain the actual file
  assert.equal(
    fs.existsSync(path.join(wantPath, 'skill.md')),
    true,
    'copied skill dir should contain original files'
  );

  // Marker must be v:2 with managedMarketplaces as expected set
  const marker = readMarker(proj);
  assert.deepEqual(marker.managedPlugins, [], 'managedPlugins should be empty array');
  assert.deepEqual(marker.managedMarketplaces, [], 'managedMarketplaces should be empty array');
  assert.equal(marker.v, 2, 'marker version should be 2');
});
