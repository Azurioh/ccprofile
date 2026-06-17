import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('reset removes marker, skill links, enabledPlugins', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  const sdir = path.join(proj, '.claude', 'skills');
  fs.mkdirSync(sdir, { recursive: true });
  fs.symlinkSync(home, path.join(sdir, 'lnk'), process.platform === 'win32' ? 'junction' : 'dir');
  fs.writeFileSync(path.join(proj, '.claude', 'settings.local.json'), JSON.stringify({ enabledPlugins: { x: true } }));
  fs.writeFileSync(path.join(proj, '.claude', 'ccprofile.json'), JSON.stringify({ profiles: [], v: 1 }));

  const cwd = process.cwd();
  process.chdir(proj);
  const reset = await import('../src/commands/reset.js');
  const code = await reset.run([]);
  process.chdir(cwd);

  assert.equal(code, 0);
  assert.equal(fs.existsSync(path.join(proj, '.claude', 'ccprofile.json')), false);
  assert.equal(fs.existsSync(path.join(sdir, 'lnk')), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(proj, '.claude', 'settings.local.json'), 'utf8')).enabledPlugins, undefined);
});

test('show omits broken symlinks', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  const sdir = path.join(proj, '.claude', 'skills');
  fs.mkdirSync(sdir, { recursive: true });
  // real skill dir
  const realTarget = path.join(home, 'skills-store', 'good-skill');
  fs.mkdirSync(realTarget, { recursive: true });
  fs.symlinkSync(realTarget, path.join(sdir, 'good-skill'), process.platform === 'win32' ? 'junction' : 'dir');
  // dangling symlink pointing to non-existent target
  const missing = path.join(home, 'skills-store', 'gone-skill');
  fs.symlinkSync(missing, path.join(sdir, 'gone-skill'), process.platform === 'win32' ? 'junction' : 'dir');

  const cwd = process.cwd();
  process.chdir(proj);
  const out = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => { out.push(s); return true; };
  const show = await import('../src/commands/show.js?broken');
  await show.run([]);
  process.stdout.write = orig;
  process.chdir(cwd);

  const combined = out.join('');
  assert.ok(combined.includes('good-skill'), 'good-skill should appear');
  assert.ok(!combined.includes('gone-skill'), 'gone-skill (broken) should NOT appear');
});

test('hint is silent and returns 0 when no marker and no signals', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  const cwd = process.cwd();
  process.chdir(proj);
  const out = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => { out.push(s); return true; };
  const hint = await import('../src/commands/hint.js');
  const code = await hint.run([]);
  process.stdout.write = orig;
  process.chdir(cwd);
  assert.equal(code, 0);
  assert.equal(out.join(''), '');
});
