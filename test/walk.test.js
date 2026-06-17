import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findFirst } from '../src/util/walk.js';

test('findFirst matches a glob name and prunes node_modules', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  fs.mkdirSync(path.join(root, 'app'), { recursive: true });
  fs.writeFileSync(path.join(root, 'app', 'next.config.mjs'), '');
  fs.mkdirSync(path.join(root, 'node_modules', 'pkg'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'pkg', 'next.config.js'), '');
  assert.equal(findFirst(root, 'next.config.*', 4), true);
  assert.equal(findFirst(root, 'angular.json', 4), false);
});
