import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detect } from '../src/core/detect.js';

test('web signals dominate for a next project', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ dependencies: { next: '15', react: '19' } })
  );
  fs.writeFileSync(path.join(root, 'next.config.mjs'), '');
  const out = detect(root);
  assert.ok(out.recommended.includes('web'));
  const web = out.candidates.find((c) => c.profile === 'web');
  assert.ok(web.score >= 3);
});

test('no signals yields empty recommended', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  const out = detect(root);
  assert.deepEqual(out.recommended, []);
});

test('tied profiles appear in ascending name order in recommended', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  // Dockerfile triggers devops; metro.config.js triggers mobile — each 1 signal → tie
  fs.writeFileSync(path.join(root, 'Dockerfile'), 'FROM node');
  fs.writeFileSync(path.join(root, 'metro.config.js'), '');
  const out = detect(root);
  // Both should appear with score 1, recommended in ascending order
  assert.ok(out.recommended.length >= 2);
  const sorted = [...out.recommended].sort();
  assert.deepEqual(out.recommended, sorted);
});
