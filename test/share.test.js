import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildBundle, parseShared, dependencyReport } from '../src/core/share.js';

test('bundle round-trips through parseShared', () => {
  const bundle = buildBundle({ web: { plugins: [], skills: ['s1'] } }, { author: 'x' });
  const parsed = parseShared(JSON.stringify(bundle));
  assert.equal(parsed.kind, 'bundle');
  assert.deepEqual(parsed.profiles.web.skills, ['s1']);
});

test('single profile (with meta) parses to one profile keyed by meta.name', () => {
  const parsed = parseShared(JSON.stringify({ plugins: [], skills: [], meta: { name: 'web' } }));
  assert.equal(parsed.kind, 'single');
  assert.ok('web' in parsed.profiles);
});

test('dependencyReport lists skills missing from the store', () => {
  const prev = process.env.CLAUDE_CONFIG_DIR;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  try {
    fs.mkdirSync(path.join(home, 'skills-store', 'have'), { recursive: true });
    const r = dependencyReport({ skills: ['have', 'missing'], plugins: ['p1'] });
    assert.deepEqual(r.missingSkills, ['missing']);
    assert.deepEqual(r.requiredPlugins, ['p1']);
  } finally {
    if (prev === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR;
    } else {
      process.env.CLAUDE_CONFIG_DIR = prev;
    }
  }
});
