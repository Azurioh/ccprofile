import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as pull from '../src/commands/pull.js';

test('pull with no id dies (usage)', async () => {
  await assert.rejects(async () => pull.run([]), /usage/);
});
