// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/ccprofile.js', import.meta.url));

test('help lists the new commands', () => {
  const r = spawnSync(process.execPath, [BIN, 'help'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  for (const cmd of ['init', 'validate', 'diff', 'doctor', 'export', 'import', 'share', 'pull', 'upgrade']) {
    assert.ok(r.stdout.includes(cmd), `usage should mention ${cmd}`);
  }
});
