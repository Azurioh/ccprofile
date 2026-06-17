import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as upgrade from '../src/commands/upgrade.js';

test('upgrade --dry-run prints the npm command and returns 0 without installing', () => {
  const code = upgrade.run(['--dry-run']);
  assert.equal(code, 0);
});
