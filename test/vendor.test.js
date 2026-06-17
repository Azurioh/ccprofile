import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vendorSkill, isVendored } from '../src/core/vendor.js';

test('vendorSkill copies real files into the project (not a symlink)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'skills-store', 'foo'), { recursive: true });
  fs.writeFileSync(path.join(home, 'skills-store', 'foo', 'SKILL.md'), '# foo');
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'dst-'));

  assert.equal(vendorSkill('foo', dest), true);
  const copied = path.join(dest, 'foo');
  assert.equal(fs.lstatSync(copied).isSymbolicLink(), false);
  assert.equal(fs.readFileSync(path.join(copied, 'SKILL.md'), 'utf8'), '# foo');
  assert.equal(isVendored('foo', dest), true);
  assert.equal(vendorSkill('ghost', dest), false);
});

test('vendorSkill replaces a pre-existing symlink with a real copy', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'skills-store', 'bar'), { recursive: true });
  fs.writeFileSync(path.join(home, 'skills-store', 'bar', 'SKILL.md'), '# bar');
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'dst-'));
  fs.symlinkSync(path.join(home, 'skills-store'), path.join(dest, 'bar'), process.platform === 'win32' ? 'junction' : 'dir');

  assert.equal(vendorSkill('bar', dest), true);
  assert.equal(fs.lstatSync(path.join(dest, 'bar')).isSymbolicLink(), false);
});
