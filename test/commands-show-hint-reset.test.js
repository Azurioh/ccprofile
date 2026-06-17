import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/ccprofile.js', import.meta.url));

function runCli(args, { cwd, configDir }) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir }
  });
}

test('reset removes marker, skill links, enabledPlugins', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  const sdir = path.join(proj, '.claude', 'skills');
  fs.mkdirSync(sdir, { recursive: true });
  fs.symlinkSync(home, path.join(sdir, 'lnk'), process.platform === 'win32' ? 'junction' : 'dir');
  fs.writeFileSync(path.join(proj, '.claude', 'settings.local.json'), JSON.stringify({ enabledPlugins: { x: true } }));
  fs.writeFileSync(path.join(proj, '.claude', 'ccprofile.json'), JSON.stringify({ profiles: [], v: 1 }));

  const r = runCli(['reset'], { cwd: proj, configDir: home });

  assert.equal(r.status, 0);
  assert.equal(fs.existsSync(path.join(proj, '.claude', 'ccprofile.json')), false);
  assert.equal(fs.existsSync(path.join(sdir, 'lnk')), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(proj, '.claude', 'settings.local.json'), 'utf8')).enabledPlugins, undefined);
});

test('show omits broken symlinks', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
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

  const r = runCli(['show'], { cwd: proj, configDir: home });

  const combined = r.stdout;
  assert.ok(combined.includes('good-skill'), 'good-skill should appear');
  assert.ok(!combined.includes('gone-skill'), 'gone-skill (broken) should NOT appear');
});

test('hint is silent and returns 0 when no marker and no signals', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));

  const r = runCli(['hint'], { cwd: proj, configDir: home });

  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), '');
});
