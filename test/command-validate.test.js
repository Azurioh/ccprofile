import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as validate from '../src/commands/validate.js';

test('validate flags a missing referenced skill (exit 1)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.mkdirSync(path.join(home, 'skills-store'), { recursive: true });
  fs.writeFileSync(path.join(home, 'profiles', 'p.json'), JSON.stringify({ skills: ['ghost'], plugins: [] }));
  assert.equal(validate.run(['p']), 1);
});

test('validate rejects non-array skills without char iteration (exit 1)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.mkdirSync(path.join(home, 'skills-store'), { recursive: true });
  fs.writeFileSync(path.join(home, 'profiles', 'p.json'), JSON.stringify({ skills: 'nope', plugins: [] }));
  assert.equal(validate.run(['p']), 1);
});

test('validate passes a fully valid profile (exit 0)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.mkdirSync(path.join(home, 'skills-store'), { recursive: true });
  fs.writeFileSync(path.join(home, 'skills-store', 'valid-skill'), '');
  fs.writeFileSync(path.join(home, 'profiles', 'p.json'), JSON.stringify({ skills: ['valid-skill'], plugins: [] }));
  assert.equal(validate.run(['p']), 0);
});
