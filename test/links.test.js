import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { linkSkill, isBrokenLink } from '../src/core/links.js';

test('linkSkill links an existing store skill; missing one returns false', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  process.env.CLAUDE_CONFIG_DIR = root;
  const store = path.join(root, 'skills-store');
  fs.mkdirSync(path.join(store, 'golang-pro'), { recursive: true });
  const dest = path.join(root, 'dest');
  fs.mkdirSync(dest, { recursive: true });

  assert.equal(linkSkill('golang-pro', dest), true);
  assert.equal(fs.existsSync(path.join(dest, 'golang-pro')), true);
  assert.equal(linkSkill('ghost-skill', dest), false);
});

test('isBrokenLink detects a dangling symlink', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  const target = path.join(root, 'gone');
  fs.mkdirSync(target);
  const link = path.join(root, 'lnk');
  fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  fs.rmSync(target, { recursive: true, force: true });
  assert.equal(isBrokenLink(link), true);
});
