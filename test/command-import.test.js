import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as importer from '../src/commands/import.js';

test('import from a local bundle file writes its profiles + reports deps', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.mkdirSync(path.join(home, 'skills-store'), { recursive: true });
  const bundle = { ccprofileBundle: 1, meta: {}, profiles: { web: { plugins: [], skills: ['s1'] } } };
  const f = path.join(home, 'b.json');
  fs.writeFileSync(f, JSON.stringify(bundle));
  const code = await importer.run([f]);
  assert.equal(code, 0);
  assert.equal(fs.existsSync(path.join(home, 'profiles', 'web.json')), true);
});
