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

test('reset removes marker, copied skill dirs, enabledPlugins', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  const sdir = path.join(proj, '.claude', 'skills');
  // create a copied skill directory (copy semantics)
  const copiedSkill = path.join(sdir, 'my-skill');
  fs.mkdirSync(copiedSkill, { recursive: true });
  fs.writeFileSync(path.join(copiedSkill, 'CLAUDE.md'), 'skill content');
  fs.writeFileSync(path.join(proj, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { x: true } }));
  fs.writeFileSync(path.join(proj, '.claude', 'ccprofile.json'), JSON.stringify({ profiles: [], managedMarketplaces: [], v: 2 }));

  const r = runCli(['reset'], { cwd: proj, configDir: home });

  assert.equal(r.status, 0);
  assert.equal(fs.existsSync(path.join(proj, '.claude', 'ccprofile.json')), false);
  assert.equal(fs.existsSync(path.join(sdir, 'my-skill')), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(proj, '.claude', 'settings.json'), 'utf8')).enabledPlugins, undefined);
});

test('show lists copied skill dirs, omits stray files', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  const sdir = path.join(proj, '.claude', 'skills');
  // copied skill directory
  const goodSkill = path.join(sdir, 'good-skill');
  fs.mkdirSync(goodSkill, { recursive: true });
  fs.writeFileSync(path.join(goodSkill, 'CLAUDE.md'), 'skill content');
  // stray file (not a directory) — should NOT appear as a skill
  fs.writeFileSync(path.join(sdir, 'stray.txt'), 'oops');

  const r = runCli(['show'], { cwd: proj, configDir: home });

  const combined = r.stdout;
  assert.ok(combined.includes('good-skill'), 'good-skill should appear');
  assert.ok(!combined.includes('stray.txt'), 'stray file should NOT appear');
});

test('hint is silent and returns 0 when no marker and no signals', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));

  const r = runCli(['hint'], { cwd: proj, configDir: home });

  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), '');
});
