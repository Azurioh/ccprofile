import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { claudeDir, profilePath, markerPath } from '../src/core/paths.js';

test('CLAUDE_CONFIG_DIR override is honored lazily', () => {
  const prev = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = path.join('/tmp', 'cc-test');
  assert.equal(claudeDir(), path.join('/tmp', 'cc-test'));
  process.env.CLAUDE_CONFIG_DIR = prev;
});

test('profilePath and markerPath build expected paths', () => {
  const prev = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = path.join('/tmp', 'cc-test');
  assert.equal(profilePath('web'), path.join('/tmp', 'cc-test', 'profiles', 'web.json'));
  assert.equal(markerPath('/proj'), path.join('/proj', '.claude', 'ccprofile.json'));
  process.env.CLAUDE_CONFIG_DIR = prev;
});
