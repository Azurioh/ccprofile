import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureGitignore } from '../src/core/gitignore.js';

test('ensureGitignore ignores settings.local.json but NOT skills/, and removes a stale skills/ ignore', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  fs.writeFileSync(path.join(root, '.gitignore'), '.claude/skills/\n.claude/settings.local.json\n');
  ensureGitignore(root);
  const lines = fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split('\n');
  assert.equal(lines.includes('.claude/skills/'), false);
  assert.equal(lines.filter((l) => l === '.claude/settings.local.json').length, 1);
});

test('ensureGitignore adds settings.local.json when missing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  ensureGitignore(root);
  assert.ok(fs.readFileSync(path.join(root, '.gitignore'), 'utf8').includes('.claude/settings.local.json'));
});
