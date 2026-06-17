import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as share from '../src/commands/share.js';

test('share with no target dies (usage)', async () => {
  await assert.rejects(() => share.run([]), /usage/);
});

test('share of an unknown profile dies', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  await assert.rejects(() => share.run(['ghost']), /profil inconnu/);
});
