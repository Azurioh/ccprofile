import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readMarker, writeMarker } from '../src/core/marker.js';

test('writeMarker stamps schema v1 and appliedAt; readMarker reads it back', () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  writeMarker(proj, { profiles: ['web'], extraSkills: ['x'], managedPlugins: ['p'] });
  const m = readMarker(proj);
  assert.equal(m.v, 1);
  assert.deepEqual(m.profiles, ['web']);
  assert.deepEqual(m.extraSkills, ['x']);
  assert.deepEqual(m.managedPlugins, ['p']);
  assert.match(m.appliedAt, /^\d{4}-\d{2}-\d{2}T.*Z$/);
});

test('readMarker returns null when absent', () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  assert.equal(readMarker(proj), null);
});
