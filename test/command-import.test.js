import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as importer from '../src/commands/import.js';
import { CcprofileError } from '../src/util/log.js';

test('import from a local bundle file writes its profiles + reports deps', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.mkdirSync(path.join(home, 'skills-store'), { recursive: true });
  const bundle = { ccprofileBundle: 1, meta: {}, profiles: { web: { plugins: [], skills: ['s1'] } } };
  const f = path.join(home, 'b.json');
  fs.writeFileSync(f, JSON.stringify(bundle));
  const code = await importer.run([f]);
  assert.equal(code, 0);
  assert.equal(fs.existsSync(path.join(home, 'profiles', 'web.json')), true);
});

test('path traversal via bundle key is rejected and no file is written outside profilesDir', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-traversal-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.mkdirSync(path.join(home, 'skills-store'), { recursive: true });
  // Bundle key uses path traversal: ../evil
  const bundle = { ccprofileBundle: 1, meta: {}, profiles: { '../evil': { plugins: [], skills: [] } } };
  const f = path.join(home, 'traversal-bundle.json');
  fs.writeFileSync(f, JSON.stringify(bundle));
  const code = await importer.run([f]);
  // Should complete (0 written) without crashing
  assert.equal(code, 0);
  // The traversal target must NOT have been created
  const traversalTarget = path.join(home, 'evil.json');
  assert.equal(fs.existsSync(traversalTarget), false, 'traversal target must not exist');
  // Also check one level up is untouched
  const parentTarget = path.join(path.dirname(home), 'evil.json');
  assert.equal(fs.existsSync(parentTarget), false, 'parent traversal target must not exist');
  // Nothing should be written in profiles dir for the evil name
  assert.equal(fs.existsSync(path.join(home, 'profiles', '..evil.json')), false);
  assert.equal(fs.existsSync(path.join(home, 'profiles', 'evil.json')), false);
});

test('path traversal via --rename is rejected with a die', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-rename-traversal-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.mkdirSync(path.join(home, 'skills-store'), { recursive: true });
  const bundle = { ccprofileBundle: 1, meta: {}, profiles: { web: { plugins: [], skills: [] } } };
  const f = path.join(home, 'bundle.json');
  fs.writeFileSync(f, JSON.stringify(bundle));
  // --rename with a traversal value must throw CcprofileError
  await assert.rejects(
    () => importer.run([f, '--rename', '../evil']),
    (err) => err instanceof CcprofileError && /** @type {CcprofileError} */ (err).message.includes('../evil')
  );
  // Traversal target must not exist
  const traversalTarget = path.join(path.dirname(home), 'evil.json');
  assert.equal(fs.existsSync(traversalTarget), false, 'rename traversal target must not exist');
});
