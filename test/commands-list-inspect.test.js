import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as inspect from '../src/commands/inspect.js';

test('inspect of unknown profile returns die (throws CcprofileError)', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  process.env.CLAUDE_CONFIG_DIR = root;
  fs.mkdirSync(path.join(root, 'profiles'), { recursive: true });
  await assert.rejects(async () => inspect.run(['ghost']), /profil inconnu/);
});
