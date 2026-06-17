import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as exporter from '../src/commands/export.js';

test('export --out writes a JSON file carrying the profile name in meta', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.writeFileSync(path.join(home, 'profiles', 'web.json'), JSON.stringify({ plugins: ['p'], skills: ['s'] }));
  const out = path.join(home, 'web-export.json');
  assert.equal(exporter.run(['web', '--out', out]), 0);
  const written = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(written.meta.name, 'web');
});
