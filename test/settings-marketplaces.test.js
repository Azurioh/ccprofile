import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { requiredMarketplaces, mergeMarketplaces, readMarketplaceNames } from '../src/core/settings.js';

test('requiredMarketplaces drops official + dedups/sorts', () => {
  const r = requiredMarketplaces(['a@bencium', 'b@claude-plugins-official', 'c@accesslint', 'd@bencium']);
  assert.deepEqual(r, ['accesslint', 'bencium']);
});

test('mergeMarketplaces copies known sources from global, reports missing', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.writeFileSync(path.join(home, 'settings.json'), JSON.stringify({
    extraKnownMarketplaces: { bencium: { source: { source: 'github', repo: 'x/bencium' } } }
  }));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  fs.mkdirSync(path.join(proj, '.claude'), { recursive: true });
  const { added, missing } = mergeMarketplaces(proj, ['bencium', 'ghost']);
  assert.deepEqual(added, ['bencium']);
  assert.deepEqual(missing, ['ghost']);
  assert.deepEqual(readMarketplaceNames(proj), ['bencium']);
});
