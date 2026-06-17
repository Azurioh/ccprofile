import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as apply from '../src/commands/apply.js';
import * as sync from '../src/commands/sync.js';
import { writeMarker } from '../src/core/marker.js';

test('apply --dry-run writes nothing', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.mkdirSync(path.join(home, 'skills-store', 's1'), { recursive: true });
  fs.writeFileSync(path.join(home, 'profiles', 'p.json'), JSON.stringify({ plugins: ['x'], skills: ['s1'] }));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  const cwd = process.cwd();
  process.chdir(proj);
  const code = apply.run(['p', '--dry-run']);
  process.chdir(cwd);
  assert.equal(code, 0);
  assert.equal(fs.existsSync(path.join(proj, '.claude', 'ccprofile.json')), false);
  assert.equal(fs.existsSync(path.join(proj, '.claude', 'skills', 's1')), false);
  assert.equal(fs.existsSync(path.join(proj, '.claude', 'settings.local.json')), false);
});

test('sync --dry-run writes nothing', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.mkdirSync(path.join(home, 'skills-store', 's1'), { recursive: true });
  fs.writeFileSync(path.join(home, 'profiles', 'p.json'), JSON.stringify({ plugins: ['x'], skills: ['s1'] }));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  writeMarker(proj, { profiles: ['p'], extraSkills: [], managedPlugins: [] });
  const settingsBefore = fs.existsSync(path.join(proj, '.claude', 'settings.local.json'));
  const cwd = process.cwd();
  process.chdir(proj);
  const code = sync.run(['--dry-run']);
  process.chdir(cwd);
  assert.equal(code, 0);
  assert.equal(fs.existsSync(path.join(proj, '.claude', 'skills', 's1')), false);
  assert.equal(fs.existsSync(path.join(proj, '.claude', 'settings.local.json')), settingsBefore);
});
