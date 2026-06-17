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
    fs.writeFileSync(path.join(home, 'profiles', 'p.json'), JSON.stringify({ plugins: [], skills: ['skill-a'] }));
    const skillsDir = path.join(proj, '.claude', 'skills');
    fs.mkdirSync(path.join(skillsDir, 'skill-a'), { recursive: true });
    fs.writeFileSync(
      path.join(proj, '.claude', 'ccprofile.json'),
      JSON.stringify({ profiles: ['p'], extraSkills: [], managedPlugins: [], managedMarketplaces: [], v: 2 })
    );
    const verify = await import('../src/commands/verify.js?insync');
    return verify.run([]);
  });
  assert.equal(code, 0);
});

test('verify returns 1 when a required skill directory is missing', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.writeFileSync(
    path.join(home, 'profiles', 'q.json'),
    JSON.stringify({ plugins: [], skills: ['skill-z'] })
  );
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  const skillsDir = path.join(proj, '.claude', 'skills');
  fs.mkdirSync(skillsDir, { recursive: true });
  // skill-z directory NOT present — simulates a missing skill
  fs.writeFileSync(
    path.join(proj, '.claude', 'ccprofile.json'),
    JSON.stringify({ profiles: ['q'], extraSkills: [], managedPlugins: [], managedMarketplaces: [], v: 2 })
  );
  const cwd = process.cwd();
  process.chdir(proj);
  const verify = await import('../src/commands/verify.js?drift');
  const code = await verify.run(['--json']);
  process.chdir(cwd);

  assert.equal(code, 1);
  // verify also emits JSON; check missingSkills via computeDrift directly
  const { computeDrift } = await import('../src/core/drift.js');
  const marker = { profiles: ['q'], extraSkills: [], managedPlugins: [] };
  const d = computeDrift(proj, marker);
  assert.ok(d.missingSkills.includes('skill-z'));
  assert.ok(!('broken' in d), 'drift shape must not contain broken key');
});
