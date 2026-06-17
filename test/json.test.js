import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readJson, writeJsonAtomic } from '../src/core/json.js';

test('writeJsonAtomic then readJson round-trips and creates dirs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  const file = path.join(root, 'nested', 'x.json');
  writeJsonAtomic(file, { a: 1 });
  assert.deepEqual(readJson(file), { a: 1 });
});

test('readJson returns fallback on missing/invalid', () => {
  assert.equal(readJson('/no/such/file.json', null), null);
});
