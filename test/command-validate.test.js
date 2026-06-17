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
