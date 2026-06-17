import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveProfiles } from '../src/core/profiles.js';

function setup(profiles) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  process.env.CLAUDE_CONFIG_DIR = root;
  fs.mkdirSync(path.join(root, 'profiles'), { recursive: true });
  for (const [name, body] of Object.entries(profiles)) {
    fs.writeFileSync(path.join(root, 'profiles', `${name}.json`), JSON.stringify(body));
  }
  return root;
}

test('extends resolves parents first and dedups', () => {
  setup({
    base: { plugins: ['p-base'], skills: ['s-base'] },
    web: { extends: ['base'], plugins: ['p-web', 'p-base'], skills: ['s-web'] }
  });
  const { plugins, skills } = resolveProfiles(['web']);
  assert.deepEqual(plugins, ['p-base', 'p-web']);
  assert.deepEqual(skills, ['s-base', 's-web']);
});

test('cyclic extends does not loop', () => {
  setup({
    a: { extends: ['b'], plugins: ['pa'], skills: [] },
    b: { extends: ['a'], plugins: ['pb'], skills: [] }
  });
  const { plugins } = resolveProfiles(['a']);
  assert.deepEqual([...plugins].sort(), ['pa', 'pb']);
});

test('unknown profile throws', () => {
  setup({});
  assert.throws(() => resolveProfiles(['ghost']), /profil inconnu/);
});
