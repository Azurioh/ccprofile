import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/ccprofile.js', import.meta.url));

function runCli(args, { cwd, configDir }) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir }
  });
}

test('detect --json emits recommended/candidates/applied keys', () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  fs.writeFileSync(path.join(proj, 'Dockerfile'), 'FROM node');

  const r = runCli(['detect', '--json'], { cwd: proj, configDir: home });

  assert.equal(r.status, 0);
  const parsed = JSON.parse(r.stdout);
  assert.ok('recommended' in parsed && 'candidates' in parsed && 'applied' in parsed);
});
