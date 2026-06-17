import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readMarker } from '../src/core/marker.js';
import { readEnabledPlugins, readMarketplaceNames } from '../src/core/settings.js';

test('apply copies skills (real dir) + writes committed settings + v2 marker', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.mkdirSync(path.join(home, 'skills-store', 'skill-a'), { recursive: true });
  fs.writeFileSync(path.join(home, 'skills-store', 'skill-a', 'SKILL.md'), '# a');
  fs.writeFileSync(path.join(home, 'profiles', 'web.json'),
    JSON.stringify({ plugins: ['plug-x@claude-plugins-official'], skills: ['skill-a'] }));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  const cwd = process.cwd();
  process.chdir(proj);
  const apply = await import('../src/commands/apply.js');
  const code = await apply.run(['web']);
  process.chdir(cwd);

  assert.equal(code, 0);
  const copied = path.join(proj, '.claude', 'skills', 'skill-a');
  assert.equal(fs.lstatSync(copied).isSymbolicLink(), false);
  assert.equal(fs.readFileSync(path.join(copied, 'SKILL.md'), 'utf8'), '# a');
  assert.equal(fs.existsSync(path.join(proj, '.claude', 'settings.json')), true);
  assert.deepEqual(readEnabledPlugins(proj), ['plug-x@claude-plugins-official']);
  const m = readMarker(proj);
  assert.equal(m.v, 2);
  assert.deepEqual(m.profiles, ['web']);
  assert.deepEqual(m.managedMarketplaces, []); // official marketplace → none added
});

test('apply: plugin on unknown custom marketplace — settings untouched, marker has no marketplace', async () => {
  // Fresh isolated env — global settings.json has NO extraKnownMarketplaces entry for 'acme-mkt'
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  // No skills-store entry needed; focus is on marketplace resolution
  fs.writeFileSync(path.join(home, 'profiles', 'custom.json'),
    JSON.stringify({ plugins: ['plug-y@acme-mkt'], skills: [] }));
  // Global settings.json does NOT list 'acme-mkt'
  fs.writeFileSync(path.join(home, 'settings.json'), JSON.stringify({}));

  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  const cwd = process.cwd();
  process.chdir(proj);
  // Re-import with a fresh module cache by using a cache-busting query param
  const apply = await import(`../src/commands/apply.js?t=${Date.now()}`);
  await apply.run(['custom']);
  process.chdir(cwd);

  // The project settings.json should NOT contain 'acme-mkt' (it was missing from global)
  assert.deepEqual(readMarketplaceNames(proj), []);

  // The marker must NOT include 'acme-mkt' in managedMarketplaces
  const m = readMarker(proj);
  assert.ok(Array.isArray(m.managedMarketplaces));
  assert.equal(m.managedMarketplaces.includes('acme-mkt'), false);
});
