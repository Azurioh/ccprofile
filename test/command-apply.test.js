import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readMarker } from '../src/core/marker.js';
import { readEnabledPlugins } from '../src/core/settings.js';

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
