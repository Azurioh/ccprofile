import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/cli.js';

test('unknown command returns exit code 1', async () => {
  const code = await run(['bogus']);
  assert.equal(code, 1);
});

test('help returns exit code 0', async () => {
  const code = await run(['--help']);
  assert.equal(code, 0);
});
