import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readMarker } from '../src/core/marker.js';

test('skill links à-la-carte and records in extraSkills', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'skills-store', 'golang-pro'), { recursive: true });
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  const cwd = process.cwd();
  process.chdir(proj);
  const skill = await import('../src/commands/skill.js');
  const code = await skill.run(['golang-pro']);
  process.chdir(cwd);
  assert.equal(code, 0);
  assert.deepEqual(readMarker(proj).extraSkills, ['golang-pro']);
});
