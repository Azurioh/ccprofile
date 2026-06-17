import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureGitignore } from '../src/core/gitignore.js';

test('ensureGitignore adds both entries once, idempotently', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  ensureGitignore(root);
  ensureGitignore(root);
  const lines = fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split('\n').filter(Boolean);
  assert.equal(lines.filter((l) => l === '.claude/skills/').length, 1);
  assert.equal(lines.filter((l) => l === '.claude/settings.local.json').length, 1);
});
