import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as init from '../src/commands/init.js';

test('init seeds bundled profiles into an empty config dir', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  const code = init.run([]);
  assert.equal(code, 0);
  // web.json is one of the bundled defaults
  assert.equal(fs.existsSync(path.join(home, 'profiles', 'web.json')), true);
});
