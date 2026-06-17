import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as diff from '../src/commands/diff.js';

test('diff requires two profile names', () => {
  assert.throws(() => diff.run(['only-one']), /usage: ccprofile diff/);
});

test('diff runs for two existing profiles (exit 0)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.writeFileSync(path.join(home, 'profiles', 'a.json'), JSON.stringify({ plugins: ['p1'], skills: ['s1'] }));
  fs.writeFileSync(path.join(home, 'profiles', 'b.json'), JSON.stringify({ plugins: ['p1', 'p2'], skills: [] }));
  assert.equal(diff.run(['a', 'b']), 0);
});
