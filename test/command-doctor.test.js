import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as doctor from '../src/commands/doctor.js';

test('doctor reports a profile referencing a missing store skill, returns 0', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.mkdirSync(path.join(home, 'skills-store'), { recursive: true });
  fs.writeFileSync(path.join(home, 'profiles', 'p.json'), JSON.stringify({ skills: ['ghost'], plugins: [] }));
  const cwd = process.cwd();
  process.chdir(home);
  const code = doctor.run([]);
  process.chdir(cwd);
  assert.equal(code, 0);
});
