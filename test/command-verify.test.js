import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function withProj(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  const cwd = process.cwd();
  process.chdir(proj);
  try {
    return await fn(home, proj);
  } finally {
    process.chdir(cwd);
  }
}

test('verify returns 3 when no marker', async () => {
  const code = await withProj(async () => {
    const verify = await import('../src/commands/verify.js');
    return verify.run([]);
  });
  assert.equal(code, 3);
});

test('verify returns 0 when in sync', async () => {
  const code = await withProj(async (home, proj) => {
    fs.writeFileSync(path.join(home, 'profiles', 'p.json'), JSON.stringify({ plugins: [], skills: [] }));
    fs.mkdirSync(path.join(proj, '.claude', 'skills'), { recursive: true });
    fs.writeFileSync(
      path.join(proj, '.claude', 'ccprofile.json'),
      JSON.stringify({ profiles: ['p'], extraSkills: [], managedPlugins: [], v: 1 })
    );
    const verify = await import('../src/commands/verify.js');
    return verify.run([]);
  });
  assert.equal(code, 0);
});
