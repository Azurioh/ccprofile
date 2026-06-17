import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('detect --json emits recommended/candidates/applied keys', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  fs.writeFileSync(path.join(root, 'Dockerfile'), 'FROM node');
  const cwd = process.cwd();
  process.chdir(root);
  const chunks = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => { chunks.push(s); return true; };
  const detect = await import('../src/commands/detect.js');
  const code = await detect.run(['--json']);
  process.stdout.write = orig;
  process.chdir(cwd);
  assert.equal(code, 0);
  const parsed = JSON.parse(chunks.join(''));
  assert.ok('recommended' in parsed && 'candidates' in parsed && 'applied' in parsed);
});
