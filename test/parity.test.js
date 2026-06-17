import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from '../src/cli.js';

test('apply→verify round-trips to in-sync (exit 0) with a bundled profile', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.mkdirSync(path.join(home, 'skills-store'), { recursive: true });
  // minimal profile referencing no skills/plugins so store linking is a no-op
  fs.writeFileSync(path.join(home, 'profiles', 'empty.json'), JSON.stringify({ plugins: [], skills: [] }));

  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  const cwd = process.cwd();
  process.chdir(proj);
  const applyCode = await run(['apply', 'empty']);
  const verifyCode = await run(['verify']);
  process.chdir(cwd);

  assert.equal(applyCode, 0);
  assert.equal(verifyCode, 0);
});
