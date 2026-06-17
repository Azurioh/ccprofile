import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mergePlugins, readEnabledPlugins, reconcilePlugins } from '../src/core/settings.js';

function proj() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  return root;
}

test('mergePlugins enables and readEnabledPlugins returns sorted keys', () => {
  const p = proj();
  mergePlugins(p, ['b-plug', 'a-plug']);
  assert.deepEqual(readEnabledPlugins(p), ['a-plug', 'b-plug']);
});

test('reconcilePlugins drops stale managed but keeps manual', () => {
  const p = proj();
  mergePlugins(p, ['manual']);            // user-enabled, not managed
  reconcilePlugins(p, ['new'], ['old']);  // expected=new, managed previously=old
  const got = readEnabledPlugins(p);
  assert.deepEqual(got, ['manual', 'new']); // old removed, manual untouched, new added
});
