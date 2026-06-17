import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateProfile } from '../src/core/schema.js';

test('valid profile passes', () => {
  assert.deepEqual(validateProfile({ description: 'x', extends: ['a'], plugins: [], skills: ['s'] }), { valid: true, errors: [] });
});

test('non-array skills and unknown key fail', () => {
  const r = validateProfile({ skills: 'nope', bogus: 1 });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('skills')));
  assert.ok(r.errors.some((e) => e.includes('bogus')));
});
