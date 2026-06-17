# ccprofile Plan 2 — Features + Profile Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add maintenance/quality commands (`init`, `upgrade`, `validate`, `diff`, `doctor`, `--dry-run`) and a no-server profile-sharing system (`export`/`import` + `share`/`pull` via GitHub Gist, single profiles and bundles) on top of the shipped Plan 1 CLI.

**Architecture:** New command modules under `src/commands/` and two new core modules (`src/core/schema.js`, `src/core/share.js`, `src/core/gist.js`), all consuming the existing Plan 1 core. Commands keep the `run(args): number | Promise<number>` contract. No command imports another command. Sharing rides on the `gh` CLI (preferred) with a GitHub REST fallback; HTTP(S) imports use Node's global `fetch`. Still zero runtime dependencies.

**Tech Stack:** Node.js ≥18 (global `fetch`, `node:test`), ESM, plain JS + `// @ts-check`, eslint (dev), `gh` CLI at runtime for gist transport.

## Global Constraints

- **Node engine `>=18`; zero runtime deps; ESM `type: module`; `// @ts-check` + JSDoc; no build step.** (Same as Plan 1.)
- **Preserve French output text and glyphs** (`✓`, `⚠`, `→`) for all user-facing lines.
- **Command contract:** every command module exports `run(args): number | Promise<number>`; `die`-style errors print `ccprofile: <msg>` to stderr and exit 1.
- **Profile schema known keys:** `description` (string), `extends`/`plugins`/`skills` (string arrays), plus an optional `meta` object (ignored by the resolver). Any other key is invalid.
- **Bundle format:** `{ "ccprofileBundle": 1, "meta": {...}, "profiles": { "<name>": <profileBody>, ... } }`. A single shared profile is the profile body plus an optional top-level `meta: { name, ... }`.
- **Sharing transport:** prefer `gh` (`gh gist create` / `gh gist view`); if `gh` is absent, fall back to the GitHub REST API using `GH_TOKEN`/`GITHUB_TOKEN`; if neither is available, `die` with a clear message. HTTP(S) `import`/`pull` URLs use global `fetch`.
- **Network-free tests:** unit tests must NOT hit GitHub. Test pure logic (schema, bundle serialize/parse, dependency report, collision resolution, diff, dry-run change-sets) directly; the live gist round-trip is a documented manual integration step.
- **Tests use a temp `CLAUDE_CONFIG_DIR`** and real temp dirs; capture command stdout via a child process (`spawnSync(process.execPath, [BIN, ...])`), never by monkeypatching global `process.stdout.write` (this broke on Node 18/20 in Plan 1).
- **Reuse Plan 1 modules** (`paths`, `json`, `profiles`, `marker`, `links`, `settings`, `detect`, `drift`, `project`, `gitignore`, `log`); do not duplicate their logic.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/core/schema.js` | `validateProfile(obj)` → `{valid, errors}` — shape validation, shared by `validate`/`import`/`pull`. |
| `src/core/share.js` | Bundle/single serialize + parse, store-skill lookup, dependency report — pure, no network. |
| `src/core/gist.js` | `createGist` / `fetchGist` — `gh`-preferred, REST fallback. The only network module. |
| `src/commands/validate.js` | `validate <profile>` — schema + reference checks. |
| `src/commands/diff.js` | `diff <a> <b>` — resolved plugin/skill delta. |
| `src/commands/doctor.js` | `doctor` — cross-machine health check. |
| `src/commands/init.js` | `init [--force]` — seed `~/.claude/profiles` from bundled `profiles/`. |
| `src/commands/upgrade.js` | `upgrade` — global reinstall via npm. |
| `src/commands/export.js` | `export <profile> [--resolved] [--out <file>]`. |
| `src/commands/import.js` | `import <file|url> [--overwrite|--skip|--rename <n>]`. |
| `src/commands/share.js` | `share <profile> | --all` — push to a gist. |
| `src/commands/pull.js` | `pull <gist-id|url> [--overwrite|--skip|--rename <n>]`. |
| `src/commands/apply.js`, `sync.js` | Modified: add `--dry-run`. |
| `src/cli.js` | Modified: wire new commands + extend usage. |
| `README.md` | Modified: document new commands. |
| `test/*.test.js` | One per new unit/command. |

---

## Task 1: profile schema validation + `validate` command

**Files:** Create `src/core/schema.js`, `src/commands/validate.js`, `test/schema.test.js`, `test/command-validate.test.js`. Modify `src/cli.js`.

**Interfaces:**
- Produces: `validateProfile(obj): { valid: boolean, errors: string[] }`; `validate.run(args): number` (exit 1 on validation failure or missing profile).
- Consumes: `profilePath` (paths), `readJson` (json), `resolveProfiles`/`readProfile` (profiles), `storeSkills` is NOT yet available (Task 7) — for now check store membership inline via `storeDir` + `fs.readdirSync`.

- [ ] **Step 1: Write `test/schema.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateProfile } from '../src/core/schema.js';

test('valid profile passes', () => {
  assert.deepEqual(validateProfile({ description: 'x', extends: ['a'], plugins: [], skills: ['s'] }), { valid: true, errors: [] });
});

test('non-array skills and unknown key fail', () => {
  const r = validateProfile({ skills: 'nope', bogus: 1 });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('skills')));
  assert.ok(r.errors.some((e) => e.includes('bogus')));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/schema.test.js`  → FAIL (module missing).

- [ ] **Step 3: Write `src/core/schema.js`**

```js
// @ts-check

const KNOWN_KEYS = new Set(['description', 'extends', 'plugins', 'skills', 'meta']);
const ARRAY_KEYS = ['extends', 'plugins', 'skills'];

/**
 * @param {*} obj
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateProfile(obj) {
  const errors = [];
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valid: false, errors: ['profil: doit être un objet JSON'] };
  }
  for (const key of ARRAY_KEYS) {
    if (key in obj) {
      if (!Array.isArray(obj[key])) {
        errors.push(`${key}: doit être un tableau`);
      } else if (!obj[key].every((x) => typeof x === 'string')) {
        errors.push(`${key}: doit contenir uniquement des chaînes`);
      }
    }
  }
  if ('description' in obj && typeof obj.description !== 'string') {
    errors.push('description: doit être une chaîne');
  }
  for (const key of Object.keys(obj)) {
    if (!KNOWN_KEYS.has(key)) {
      errors.push(`clé inconnue: ${key}`);
    }
  }
  return { valid: errors.length === 0, errors };
}
```

- [ ] **Step 4: Write `test/command-validate.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as validate from '../src/commands/validate.js';

test('validate flags a missing referenced skill (exit 1)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.mkdirSync(path.join(home, 'skills-store'), { recursive: true });
  fs.writeFileSync(path.join(home, 'profiles', 'p.json'), JSON.stringify({ skills: ['ghost'], plugins: [] }));
  assert.equal(validate.run(['p']), 1);
});
```

- [ ] **Step 5: Write `src/commands/validate.js`**

```js
// @ts-check
import fs from 'node:fs';
import { profilePath, storeDir } from '../core/paths.js';
import { readJson } from '../core/json.js';
import { validateProfile } from '../core/schema.js';
import { resolveProfiles } from '../core/profiles.js';
import { info, die } from '../util/log.js';

/** @param {string[]} args */
export function run(args) {
  const name = args[0];
  if (!name) {
    die('usage: ccprofile validate <profil>');
  }
  const file = profilePath(name);
  if (!fs.existsSync(file)) {
    die(`profil inconnu: ${name} (${file} absent)`);
  }
  const obj = readJson(file, null);
  if (obj === null) {
    info(`✗ ${name}: JSON invalide`);
    return 1;
  }

  const errors = [];
  const { valid, errors: shapeErrors } = validateProfile(obj);
  errors.push(...shapeErrors);

  let storeEntries = [];
  try {
    storeEntries = fs.readdirSync(storeDir());
  } catch {
    storeEntries = [];
  }
  const store = new Set(storeEntries);
  for (const s of obj.skills ?? []) {
    if (!store.has(s)) {
      errors.push(`skill absent du store: ${s}`);
    }
  }
  try {
    resolveProfiles([name]);
  } catch (e) {
    errors.push(`extends: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (errors.length === 0 && valid) {
    info(`✓ ${name}: profil valide`);
    return 0;
  }
  info(`✗ ${name}: ${errors.length} problème(s)`);
  for (const e of errors) {
    info(`  - ${e}`);
  }
  return 1;
}
```

- [ ] **Step 6: Wire `src/cli.js`** — add `import * as validate from './commands/validate.js';` and `case 'validate': return await validate.run(rest);`.

- [ ] **Step 7: Run `node --test && pnpm lint`** → PASS.

- [ ] **Step 8: Commit** — `git commit -am "feat: add profile schema validation + validate command"`.

---

## Task 2: `diff` command

**Files:** Create `src/commands/diff.js`, `test/command-diff.test.js`. Modify `src/cli.js`.

**Interfaces:**
- Consumes: `resolveProfiles` (profiles), `info`/`die` (log).
- Produces: `diff.run(args): number`. Shows resolved plugin/skill deltas between two profiles.

- [ ] **Step 1: Write `test/command-diff.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as diff from '../src/commands/diff.js';

test('diff requires two profile names', () => {
  assert.equal(diff.run(['only-one']), 1);
});

test('diff runs for two existing profiles (exit 0)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.writeFileSync(path.join(home, 'profiles', 'a.json'), JSON.stringify({ plugins: ['p1'], skills: ['s1'] }));
  fs.writeFileSync(path.join(home, 'profiles', 'b.json'), JSON.stringify({ plugins: ['p1', 'p2'], skills: [] }));
  assert.equal(diff.run(['a', 'b']), 0);
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Write `src/commands/diff.js`**

```js
// @ts-check
import { resolveProfiles } from '../core/profiles.js';
import { info, die } from '../util/log.js';

/** @param {string[]} args */
export function run(args) {
  const [a, b] = args;
  if (!a || !b) {
    die('usage: ccprofile diff <profilA> <profilB>');
  }
  const ra = resolveProfiles([a]);
  const rb = resolveProfiles([b]);

  info(`diff ${a} → ${b}`);
  section('plugins', ra.plugins, rb.plugins);
  section('skills', ra.skills, rb.skills);
  return 0;
}

/**
 * @param {string} title
 * @param {string[]} from
 * @param {string[]} to
 */
function section(title, from, to) {
  const setFrom = new Set(from);
  const setTo = new Set(to);
  const added = to.filter((x) => !setFrom.has(x)).sort();
  const removed = from.filter((x) => !setTo.has(x)).sort();
  info(`-- ${title} --`);
  if (added.length === 0 && removed.length === 0) {
    info('  (identiques)');
    return;
  }
  for (const x of removed) {
    info(`  - ${x}`);
  }
  for (const x of added) {
    info(`  + ${x}`);
  }
}
```

- [ ] **Step 4: Wire `src/cli.js`** — `import * as diff` + `case 'diff': return await diff.run(rest);`.

- [ ] **Step 5: Run `node --test && pnpm lint`** → PASS.

- [ ] **Step 6: Commit** — `git commit -am "feat: add diff command"`.

---

## Task 3: `doctor` command

**Files:** Create `src/commands/doctor.js`, `test/command-doctor.test.js`. Modify `src/cli.js`.

**Interfaces:**
- Consumes: `profilesDir`/`storeDir`/`skillsDir` (paths), `readJson` (json), `projectDir` (project), `isBrokenLink` (links), `info` (log), `spawnSync` (git availability).
- Produces: `doctor.run(args): number`. Read-only health report. Exit 0 always (informational), but prints a `⚠`/`✓` summary.

- [ ] **Step 1: Write `test/command-doctor.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as doctor from '../src/commands/doctor.js';

test('doctor reports a profile referencing a missing store skill, returns 0', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.mkdirSync(path.join(home, 'skills-store'), { recursive: true });
  fs.writeFileSync(path.join(home, 'profiles', 'p.json'), JSON.stringify({ skills: ['ghost'], plugins: [] }));
  const cwd = process.cwd();
  process.chdir(home);
  const code = doctor.run([]);
  process.chdir(cwd);
  assert.equal(code, 0);
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Write `src/commands/doctor.js`**

```js
// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { profilesDir, storeDir, skillsDir } from '../core/paths.js';
import { readJson } from '../core/json.js';
import { projectDir } from '../core/project.js';
import { isBrokenLink } from '../core/links.js';
import { info } from '../util/log.js';

/** @param {string[]} _args */
export function run(_args) {
  let problems = 0;

  let storeEntries = [];
  try {
    storeEntries = fs.readdirSync(storeDir());
  } catch {
    storeEntries = [];
  }
  const store = new Set(storeEntries);

  info('-- profils → store --');
  let profFiles = [];
  try {
    profFiles = fs.readdirSync(profilesDir()).filter((f) => f.endsWith('.json'));
  } catch {
    profFiles = [];
  }
  for (const f of profFiles.sort()) {
    const obj = readJson(path.join(profilesDir(), f), {}) ?? {};
    const missing = (obj.skills ?? []).filter((s) => !store.has(s));
    if (missing.length > 0) {
      problems += missing.length;
      info(`  ⚠ ${path.basename(f, '.json')}: skills absents du store: ${missing.sort().join(', ')}`);
    }
  }
  if (profFiles.length === 0) {
    info('  (aucun profil — lance: ccprofile init)');
  }

  info('-- liens projet courant --');
  const proj = projectDir();
  const dir = skillsDir(proj);
  let broken = [];
  try {
    broken = fs.readdirSync(dir).filter((b) => isBrokenLink(path.join(dir, b))).sort();
  } catch {
    broken = [];
  }
  if (broken.length > 0) {
    problems += broken.length;
    info(`  ⚠ symlinks cassés: ${broken.join(', ')} (lance: ccprofile sync)`);
  } else {
    info('  ✓ aucun lien cassé');
  }

  info('-- environnement --');
  const git = spawnSync('git', ['--version'], { encoding: 'utf8' });
  info(git.status === 0 ? `  ✓ git: ${git.stdout.trim()}` : '  ⚠ git introuvable (détection du projet limitée au cwd)');

  info(problems === 0 ? '✓ doctor: aucun problème' : `⚠ doctor: ${problems} problème(s)`);
  return 0;
}
```

- [ ] **Step 4: Wire `src/cli.js`** — `import * as doctor` + `case 'doctor': return await doctor.run(rest);`.

- [ ] **Step 5: Run `node --test && pnpm lint`** → PASS.

- [ ] **Step 6: Commit** — `git commit -am "feat: add doctor command"`.

---

## Task 4: `--dry-run` on `apply` and `sync`

**Files:** Modify `src/commands/apply.js`, `src/commands/sync.js`. Create `test/command-dryrun.test.js`.

**Interfaces:**
- Behavior: a `--dry-run` flag anywhere in args makes `apply`/`sync` compute and PRINT the change set without touching the filesystem or marker, then return 0.

- [ ] **Step 1: Write `test/command-dryrun.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as apply from '../src/commands/apply.js';

test('apply --dry-run writes nothing', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.mkdirSync(path.join(home, 'skills-store', 's1'), { recursive: true });
  fs.writeFileSync(path.join(home, 'profiles', 'p.json'), JSON.stringify({ plugins: ['x'], skills: ['s1'] }));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  const cwd = process.cwd();
  process.chdir(proj);
  const code = apply.run(['p', '--dry-run']);
  process.chdir(cwd);
  assert.equal(code, 0);
  assert.equal(fs.existsSync(path.join(proj, '.claude', 'ccprofile.json')), false);
  assert.equal(fs.existsSync(path.join(proj, '.claude', 'skills', 's1')), false);
});
```

- [ ] **Step 2: Run to verify failure** → FAIL (apply currently ignores `--dry-run` and would write).

- [ ] **Step 3: Modify `src/commands/apply.js`** — separate the profile args from the flag, and short-circuit on dry-run BEFORE any write:

Replace the top of `run` so it filters out `--dry-run`:

```js
/** @param {string[]} args */
export function run(args) {
  const dryRun = args.includes('--dry-run');
  const profileArgs = args.filter((a) => a !== '--dry-run');
  if (profileArgs.length < 1) {
    die('usage: ccprofile apply <profil> [profil...] [--dry-run]');
  }
  const proj = projectDir();
  const { plugins, skills } = resolveProfiles(profileArgs);

  if (dryRun) {
    info(`Projet : ${proj}`);
    info(`Profils: ${profileArgs.join(' ')}  (dry-run — aucune écriture)`);
    info(`  skills à lier  : ${skills.length ? skills.join(', ') : '(aucun)'}`);
    info(`  plugins à activer : ${plugins.length ? plugins.join(', ') : '(aucun)'}`);
    return 0;
  }

  const dest = skillsDir(proj);
  fs.mkdirSync(dest, { recursive: true });
  // ... existing linking / merge / marker / gitignore logic unchanged ...
}
```

Keep the rest of the existing function body (linking loop, `mergePlugins`, marker write, `ensureGitignore`, summary) exactly as-is after the dry-run block. (Use `profileArgs` in place of the old `args` for `resolveProfiles` and the marker `profiles = [...new Set(profileArgs)].sort()`.)

- [ ] **Step 4: Modify `src/commands/sync.js`** — accept `--dry-run`:

```js
/** @param {string[]} args */
export function run(args) {
  const dryRun = args.includes('--dry-run');
  const proj = projectDir();
  const marker = readMarker(proj);
  if (!marker) {
    die("aucun profil à synchroniser (pas de marqueur). Lance d'abord: ccprofile apply <profil>");
  }
  const { plugins, skills } = resolveProfiles(marker.profiles ?? []);
  const expectedSkills = new Set([...skills, ...(marker.extraSkills ?? [])].filter(Boolean));
  const expectedPlugins = [...new Set(plugins.filter(Boolean))].sort();
  const dir = skillsDir(proj);

  if (dryRun) {
    let current = [];
    try { current = fs.readdirSync(dir); } catch { current = []; }
    const toRemove = current.filter((b) => !expectedSkills.has(b)).sort();
    const toAdd = [...expectedSkills].filter((s) => !current.includes(s)).sort();
    info('sync (dry-run — aucune écriture)');
    info(`  skills à retirer : ${toRemove.length ? toRemove.join(', ') : '(aucun)'}`);
    info(`  skills à lier    : ${toAdd.length ? toAdd.join(', ') : '(aucun)'}`);
    info(`  plugins gérés    : ${expectedPlugins.length ? expectedPlugins.join(', ') : '(aucun)'}`);
    return 0;
  }
  // ... existing reconcile logic unchanged (mkdir, remove loop, relink, reconcilePlugins, marker, gitignore, summary) ...
}
```

Keep the rest of the existing `sync` body unchanged after the dry-run block.

- [ ] **Step 5: Run `node --test && pnpm lint`** → PASS (existing apply/sync tests still pass — they pass no `--dry-run`).

- [ ] **Step 6: Commit** — `git commit -am "feat: add --dry-run to apply and sync"`.

---

## Task 5: `init` command (seed bundled profiles)

**Files:** Create `src/commands/init.js`, `test/command-init.test.js`. Modify `src/cli.js`.

**Interfaces:**
- Consumes: `profilesDir` (paths), `info` (log), bundled profiles dir resolved via `import.meta.url`.
- Produces: `init.run(args): number`. Copies each bundled `profiles/*.json` into `~/.claude/profiles` if absent; `--force` overwrites. Prints what was seeded/skipped.

- [ ] **Step 1: Write `test/command-init.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as init from '../src/commands/init.js';

test('init seeds bundled profiles into an empty config dir', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  const code = init.run([]);
  assert.equal(code, 0);
  // web.json is one of the bundled defaults
  assert.equal(fs.existsSync(path.join(home, 'profiles', 'web.json')), true);
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Write `src/commands/init.js`**

```js
// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { profilesDir } from '../core/paths.js';
import { info } from '../util/log.js';

const BUNDLED = fileURLToPath(new URL('../../profiles/', import.meta.url));

/** @param {string[]} args */
export function run(args) {
  const force = args.includes('--force');
  const dest = profilesDir();
  fs.mkdirSync(dest, { recursive: true });

  let bundled = [];
  try {
    bundled = fs.readdirSync(BUNDLED).filter((f) => f.endsWith('.json'));
  } catch {
    bundled = [];
  }

  let seeded = 0;
  let skipped = 0;
  for (const f of bundled.sort()) {
    const target = path.join(dest, f);
    if (fs.existsSync(target) && !force) {
      skipped += 1;
      continue;
    }
    fs.copyFileSync(path.join(BUNDLED, f), target);
    seeded += 1;
  }
  info(`✓ init: ${seeded} profil(s) copié(s), ${skipped} déjà présent(s) → ${dest}`);
  if (skipped > 0 && !force) {
    info('  (utilise --force pour écraser les existants)');
  }
  return 0;
}
```

- [ ] **Step 4: Wire `src/cli.js`** — `import * as init` + `case 'init': return await init.run(rest);`.

- [ ] **Step 5: Run `node --test && pnpm lint`** → PASS.

- [ ] **Step 6: Commit** — `git commit -am "feat: add init command (seed bundled profiles)"`.

---

## Task 6: `upgrade` command

**Files:** Create `src/commands/upgrade.js`, `test/command-upgrade.test.js`. Modify `src/cli.js`.

**Interfaces:**
- Consumes: `spawnSync` (npm), `info`/`warn` (log). Reads its own package name from `package.json` via `import.meta.url`.
- Produces: `upgrade.run(args): number`. Runs `npm i -g <pkg>@latest`, inheriting stdio. `--dry-run` prints the command without running it (used for the unit test, avoids a real global install).

- [ ] **Step 1: Write `test/command-upgrade.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as upgrade from '../src/commands/upgrade.js';

test('upgrade --dry-run prints the npm command and returns 0 without installing', () => {
  const code = upgrade.run(['--dry-run']);
  assert.equal(code, 0);
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Write `src/commands/upgrade.js`**

```js
// @ts-check
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { info, warn } from '../util/log.js';

const PKG = fileURLToPath(new URL('../../package.json', import.meta.url));

/** @param {string[]} args */
export function run(args) {
  const dryRun = args.includes('--dry-run');
  let name = '@azurioh/ccprofile';
  try {
    name = JSON.parse(fs.readFileSync(PKG, 'utf8')).name || name;
  } catch {
    /* keep default */
  }
  const cmd = `npm i -g ${name}@latest`;
  info(`→ ${cmd}`);
  if (dryRun) {
    return 0;
  }
  const r = spawnSync('npm', ['i', '-g', `${name}@latest`], { stdio: 'inherit' });
  if (r.status !== 0) {
    warn(`⚠ échec npm. Si non publié sur le registre, essaie: npm i -g Azurioh/ccprofile`);
    return 1;
  }
  info('✓ ccprofile mis à jour');
  return 0;
}
```

- [ ] **Step 4: Wire `src/cli.js`** — `import * as upgrade` + `case 'upgrade': return await upgrade.run(rest);`.

- [ ] **Step 5: Run `node --test && pnpm lint`** → PASS.

- [ ] **Step 6: Commit** — `git commit -am "feat: add upgrade command"`.

---

## Task 7: sharing core (`src/core/share.js`)

**Files:** Create `src/core/share.js`, `test/share.test.js`.

**Interfaces:**
- Consumes: `storeDir` (paths), `profilesDir` (paths), `readJson` (json), `resolveProfiles`/`readProfile` (profiles).
- Produces (all pure / no network):
  - `buildSingle(name, profileBody, meta): object` — profile body + `meta:{name,...}`.
  - `buildBundle(profilesMap, meta): object` — `{ccprofileBundle:1, meta, profiles}`.
  - `parseShared(text): { kind: 'single'|'bundle', profiles: Record<string,object> }`.
  - `storeSkillSet(): Set<string>`.
  - `dependencyReport(profileBody): { missingSkills: string[], requiredPlugins: string[] }` — `missingSkills` = referenced skills not in store; `requiredPlugins` = the profile's plugins (informational; install state can't be verified).
  - `resolvedBody(name): object` — flattened `{description, plugins, skills}` from `resolveProfiles([name])` (no `extends`).

- [ ] **Step 1: Write `test/share.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildBundle, parseShared, dependencyReport } from '../src/core/share.js';

test('bundle round-trips through parseShared', () => {
  const bundle = buildBundle({ web: { plugins: [], skills: ['s1'] } }, { author: 'x' });
  const parsed = parseShared(JSON.stringify(bundle));
  assert.equal(parsed.kind, 'bundle');
  assert.deepEqual(parsed.profiles.web.skills, ['s1']);
});

test('single profile (with meta) parses to one profile keyed by meta.name', () => {
  const parsed = parseShared(JSON.stringify({ plugins: [], skills: [], meta: { name: 'web' } }));
  assert.equal(parsed.kind, 'single');
  assert.ok('web' in parsed.profiles);
});

test('dependencyReport lists skills missing from the store', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'skills-store', 'have'), { recursive: true });
  const r = dependencyReport({ skills: ['have', 'missing'], plugins: ['p1'] });
  assert.deepEqual(r.missingSkills, ['missing']);
  assert.deepEqual(r.requiredPlugins, ['p1']);
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Write `src/core/share.js`**

```js
// @ts-check
import fs from 'node:fs';
import { storeDir } from './paths.js';
import { resolveProfiles } from './profiles.js';

const BUNDLE_VERSION = 1;

/**
 * @param {string} name
 * @param {object} body
 * @param {object} [meta]
 */
export function buildSingle(name, body, meta = {}) {
  return { ...body, meta: { name, ...meta } };
}

/**
 * @param {Record<string, object>} profilesMap
 * @param {object} [meta]
 */
export function buildBundle(profilesMap, meta = {}) {
  return { ccprofileBundle: BUNDLE_VERSION, meta, profiles: profilesMap };
}

/**
 * @param {string} text
 * @returns {{ kind: 'single'|'bundle', profiles: Record<string, object> }}
 */
export function parseShared(text) {
  const obj = JSON.parse(text);
  if (obj && obj.ccprofileBundle) {
    return { kind: 'bundle', profiles: obj.profiles ?? {} };
  }
  const name = obj?.meta?.name ?? 'imported';
  const body = { ...obj };
  delete body.meta;
  return { kind: 'single', profiles: { [name]: body } };
}

export function storeSkillSet() {
  try {
    return new Set(fs.readdirSync(storeDir()));
  } catch {
    return new Set();
  }
}

/**
 * @param {{ skills?: string[], plugins?: string[] }} body
 * @returns {{ missingSkills: string[], requiredPlugins: string[] }}
 */
export function dependencyReport(body) {
  const store = storeSkillSet();
  const missingSkills = (body.skills ?? []).filter((s) => !store.has(s)).sort();
  const requiredPlugins = [...(body.plugins ?? [])].sort();
  return { missingSkills, requiredPlugins };
}

/**
 * Flatten a profile (resolving extends) into a standalone body.
 * @param {string} name
 */
export function resolvedBody(name) {
  const { plugins, skills } = resolveProfiles([name]);
  return { plugins, skills };
}
```

- [ ] **Step 4: Run `node --test && pnpm lint`** → PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat: add sharing core (bundle/single serialize, parse, dependency report)"`.

---

## Task 8: `export` command

**Files:** Create `src/commands/export.js`, `test/command-export.test.js`. Modify `src/cli.js`.

**Interfaces:**
- Consumes: `profilePath` (paths), `readJson` (json), `buildSingle`/`resolvedBody` (share), `info`/`die` (log), `fs` for `--out`.
- Produces: `export.run(args): number`. `--resolved` flattens `extends`; `--out <file>` writes instead of printing.

- [ ] **Step 1: Write `test/command-export.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as exporter from '../src/commands/export.js';

test('export --out writes a JSON file carrying the profile name in meta', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.writeFileSync(path.join(home, 'profiles', 'web.json'), JSON.stringify({ plugins: ['p'], skills: ['s'] }));
  const out = path.join(home, 'web-export.json');
  assert.equal(exporter.run(['web', '--out', out]), 0);
  const written = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(written.meta.name, 'web');
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Write `src/commands/export.js`**

```js
// @ts-check
import fs from 'node:fs';
import { profilePath } from '../core/paths.js';
import { readJson } from '../core/json.js';
import { buildSingle, resolvedBody } from '../core/share.js';
import { info, die } from '../util/log.js';

/** @param {string[]} args */
export function run(args) {
  const positional = args.filter((a) => !a.startsWith('--'));
  const name = positional[0];
  if (!name) {
    die('usage: ccprofile export <profil> [--resolved] [--out <fichier>]');
  }
  const file = profilePath(name);
  if (!fs.existsSync(file)) {
    die(`profil inconnu: ${name} (${file} absent)`);
  }
  const resolved = args.includes('--resolved');
  const outIdx = args.indexOf('--out');
  const outFile = outIdx >= 0 ? args[outIdx + 1] : null;

  const body = resolved ? resolvedBody(name) : stripMeta(readJson(file, {}));
  const shared = buildSingle(name, body, { ccprofileVersion: 1, resolved });
  const text = `${JSON.stringify(shared, null, 2)}\n`;

  if (outFile) {
    fs.writeFileSync(outFile, text);
    info(`✓ profil '${name}' exporté → ${outFile}`);
  } else {
    process.stdout.write(text);
  }
  return 0;
}

/** @param {object} obj */
function stripMeta(obj) {
  const body = { ...obj };
  delete body.meta;
  return body;
}
```

- [ ] **Step 4: Wire `src/cli.js`** — `import * as exportCmd from './commands/export.js';` and `case 'export': return await exportCmd.run(rest);`.

- [ ] **Step 5: Run `node --test && pnpm lint`** → PASS.

- [ ] **Step 6: Commit** — `git commit -am "feat: add export command"`.

---

## Task 9: `import` command (file/url, single + bundle, collision, dependency report)

**Files:** Create `src/commands/import.js`, `test/command-import.test.js`. Modify `src/cli.js`.

**Interfaces:**
- Consumes: `profilesDir`/`profilePath` (paths), `writeJsonAtomic` (json), `validateProfile` (schema), `parseShared`/`dependencyReport` (share), `info`/`warn`/`die` (log). HTTP(S) sources via global `fetch`.
- Produces: `importProfiles(text, opts): Promise<number>` (shared by `pull`) and `import.run(args): Promise<number>`. Collision: default skips existing with a warning; `--overwrite` replaces; `--skip` explicit skip; `--rename <name>` only valid for a single profile.

- [ ] **Step 1: Write `test/command-import.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as importer from '../src/commands/import.js';

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
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Write `src/commands/import.js`**

```js
// @ts-check
import fs from 'node:fs';
import { profilesDir, profilePath } from '../core/paths.js';
import { writeJsonAtomic } from '../core/json.js';
import { validateProfile } from '../core/schema.js';
import { parseShared, dependencyReport } from '../core/share.js';
import { info, warn, die } from '../util/log.js';

/**
 * @param {string} source  file path or http(s) URL
 * @returns {Promise<string>}
 */
async function readSource(source) {
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source);
    if (!res.ok) {
      die(`téléchargement échoué (${res.status}): ${source}`);
    }
    return res.text();
  }
  if (!fs.existsSync(source)) {
    die(`fichier introuvable: ${source}`);
  }
  return fs.readFileSync(source, 'utf8');
}

/**
 * Shared by `import` and `pull`.
 * @param {string} text
 * @param {{ overwrite?: boolean, skip?: boolean, rename?: string }} opts
 * @returns {number}
 */
export function importProfiles(text, opts = {}) {
  let parsed;
  try {
    parsed = parseShared(text);
  } catch {
    die('contenu partagé invalide (JSON illisible)');
  }
  const entries = Object.entries(parsed.profiles);
  if (entries.length === 0) {
    die('aucun profil dans la source');
  }
  if (opts.rename && entries.length > 1) {
    die('--rename ne peut viser qu’un seul profil (la source est un bundle)');
  }
  fs.mkdirSync(profilesDir(), { recursive: true });

  let written = 0;
  for (const [origName, body] of entries) {
    const name = opts.rename || origName;
    const { valid, errors } = validateProfile(body);
    if (!valid) {
      warn(`⚠ ${name}: ignoré (invalide: ${errors.join('; ')})`);
      continue;
    }
    const target = profilePath(name);
    if (fs.existsSync(target) && !opts.overwrite) {
      warn(`⚠ ${name}: existe déjà — ignoré (utilise --overwrite ou --rename)`);
      continue;
    }
    const clean = { ...body };
    delete clean.meta;
    writeJsonAtomic(target, clean);
    written += 1;
    const { missingSkills, requiredPlugins } = dependencyReport(clean);
    info(`✓ ${name} importé`);
    if (missingSkills.length > 0) {
      info(`    skills manquants (absents du store): ${missingSkills.join(', ')}`);
    }
    if (requiredPlugins.length > 0) {
      info(`    plugins requis (à installer) : ${requiredPlugins.join(', ')}`);
    }
  }
  info(`→ ${written}/${entries.length} profil(s) importé(s) dans ${profilesDir()}`);
  return 0;
}

/**
 * @param {string[]} args
 * @returns {Promise<number>}
 */
export async function run(args) {
  const positional = args.filter((a) => !a.startsWith('--'));
  const source = positional[0];
  if (!source) {
    die('usage: ccprofile import <fichier|url> [--overwrite|--skip|--rename <nom>]');
  }
  const renameIdx = args.indexOf('--rename');
  const opts = {
    overwrite: args.includes('--overwrite'),
    skip: args.includes('--skip'),
    rename: renameIdx >= 0 ? args[renameIdx + 1] : undefined
  };
  const text = await readSource(source);
  return importProfiles(text, opts);
}
```

- [ ] **Step 4: Wire `src/cli.js`** — `import * as importCmd from './commands/import.js';` and `case 'import': return await importCmd.run(rest);`.

- [ ] **Step 5: Run `node --test && pnpm lint`** → PASS.

- [ ] **Step 6: Commit** — `git commit -am "feat: add import command (file/url, single+bundle, deps, collisions)"`.

---

## Task 10: gist transport (`src/core/gist.js`) + `share` command

**Files:** Create `src/core/gist.js`, `src/commands/share.js`, `test/command-share.test.js`. Modify `src/cli.js`.

**Interfaces:**
- `gist.js` consumes: `spawnSync` (gh), global `fetch` (REST fallback), `die`/`warn` (log).
  - `createGist({ filename, content, description, public: bool }): string` — returns the gist URL. Uses `gh gist create` if `gh` exists, else GitHub REST with `GH_TOKEN`/`GITHUB_TOKEN`.
  - `fetchGist(idOrUrl): string` — returns the single file's content (first file). `gh gist view --raw` if `gh` exists, else REST.
  - `hasGh(): boolean`.
- `share.js` consumes: `profilePath`/`profilesDir` (paths), `readJson` (json), `buildSingle`/`buildBundle`/`resolvedBody` (share), `createGist` (gist), `info`/`die`.
- Produces: `share.run(args): number`. `share <profile> [--resolved]` shares one profile; `share --all` bundles every profile in `profilesDir`.

**Note:** `share` performs network I/O. The unit test only covers the **arg/error paths that do not hit the network** (e.g. unknown profile → die). A live gist round-trip is a manual integration step (documented in Task 12).

- [ ] **Step 1: Write `test/command-share.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as share from '../src/commands/share.js';

test('share with no target dies (usage)', () => {
  assert.throws(() => share.run([]), /usage/);
});

test('share of an unknown profile dies', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  assert.throws(() => share.run(['ghost']), /profil inconnu/);
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Write `src/core/gist.js`**

```js
// @ts-check
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { die, warn } from '../util/log.js';

export function hasGh() {
  return spawnSync('gh', ['--version'], { encoding: 'utf8' }).status === 0;
}

function token() {
  return process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
}

/**
 * @param {{ filename: string, content: string, description?: string, public?: boolean }} opts
 * @returns {Promise<string>} gist URL
 */
export async function createGist(opts) {
  const { filename, content, description = 'ccprofile', public: pub = true } = opts;
  if (hasGh()) {
    const tmp = path.join(os.tmpdir(), `ccprofile-${process.pid}-${filename}`);
    fs.writeFileSync(tmp, content);
    const ghArgs = ['gist', 'create', tmp, '--desc', description];
    if (pub) {
      ghArgs.push('--public');
    }
    const r = spawnSync('gh', ghArgs, { encoding: 'utf8' });
    if (r.status !== 0) {
      die(`gh gist create a échoué: ${(r.stderr || '').trim()}`);
    }
    return r.stdout.trim();
  }
  if (!token()) {
    die('partage impossible: installe `gh` (gh auth login) ou définis GH_TOKEN');
  }
  const res = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ description, public: pub, files: { [filename]: { content } } })
  });
  if (!res.ok) {
    die(`création du gist échouée (${res.status})`);
  }
  const json = await res.json();
  return json.html_url;
}

/**
 * @param {string} idOrUrl
 * @returns {Promise<string>} first file's content
 */
export async function fetchGist(idOrUrl) {
  const id = idOrUrl.replace(/^https?:\/\/gist\.github\.com\/[^/]+\//, '').replace(/^https?:\/\/gist\.github\.com\//, '').replace(/\/$/, '');
  if (hasGh()) {
    const r = spawnSync('gh', ['gist', 'view', id, '--raw'], { encoding: 'utf8' });
    if (r.status !== 0) {
      die(`gh gist view a échoué: ${(r.stderr || '').trim()}`);
    }
    return r.stdout;
  }
  const headers = { Accept: 'application/vnd.github+json' };
  if (token()) {
    headers.Authorization = `Bearer ${token()}`;
  }
  const res = await fetch(`https://api.github.com/gists/${id}`, { headers });
  if (!res.ok) {
    die(`récupération du gist échouée (${res.status})`);
  }
  const json = await res.json();
  const files = Object.values(json.files ?? {});
  if (files.length === 0) {
    die('gist vide');
  }
  return files[0].content;
}
```

- [ ] **Step 4: Write `src/commands/share.js`**

```js
// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { profilePath, profilesDir } from '../core/paths.js';
import { readJson } from '../core/json.js';
import { buildSingle, buildBundle, resolvedBody } from '../core/share.js';
import { createGist } from '../core/gist.js';
import { info, die } from '../util/log.js';

/**
 * @param {string[]} args
 * @returns {Promise<number>}
 */
export async function run(args) {
  const all = args.includes('--all');
  const resolved = args.includes('--resolved');
  const positional = args.filter((a) => !a.startsWith('--'));

  let filename;
  let content;
  let label;

  if (all) {
    /** @type {Record<string, object>} */
    const map = {};
    let files = [];
    try {
      files = fs.readdirSync(profilesDir()).filter((f) => f.endsWith('.json'));
    } catch {
      files = [];
    }
    for (const f of files.sort()) {
      const body = readJson(path.join(profilesDir(), f), {}) ?? {};
      delete body.meta;
      map[path.basename(f, '.json')] = body;
    }
    if (Object.keys(map).length === 0) {
      die('aucun profil à partager');
    }
    filename = 'ccprofile-bundle.json';
    content = `${JSON.stringify(buildBundle(map, { ccprofileVersion: 1 }), null, 2)}\n`;
    label = `${Object.keys(map).length} profils`;
  } else {
    const name = positional[0];
    if (!name) {
      die('usage: ccprofile share <profil> [--resolved] | --all');
    }
    const file = profilePath(name);
    if (!fs.existsSync(file)) {
      die(`profil inconnu: ${name} (${file} absent)`);
    }
    const body = resolved ? resolvedBody(name) : stripMeta(readJson(file, {}));
    filename = `${name}.json`;
    content = `${JSON.stringify(buildSingle(name, body, { ccprofileVersion: 1, resolved }), null, 2)}\n`;
    label = `profil '${name}'`;
  }

  const url = await createGist({ filename, content, description: `ccprofile — ${label}`, public: true });
  info(`✓ ${label} partagé`);
  info(`  ${url}`);
  info(`  → import: ccprofile pull ${url}`);
  return 0;
}

/** @param {object} obj */
function stripMeta(obj) {
  const body = { ...obj };
  delete body.meta;
  return body;
}
```

- [ ] **Step 5: Wire `src/cli.js`** — `import * as share` + `case 'share': return await share.run(rest);`.

- [ ] **Step 6: Run `node --test && pnpm lint`** → PASS (network paths are not exercised by the unit test).

- [ ] **Step 7: Commit** — `git commit -am "feat: add gist transport + share command"`.

---

## Task 11: `pull` command

**Files:** Create `src/commands/pull.js`, `test/command-pull.test.js`. Modify `src/cli.js`.

**Interfaces:**
- Consumes: `fetchGist` (gist), `importProfiles` (import command — reuse, no duplication), `die`.
- Produces: `pull.run(args): Promise<number>`. Fetches the gist content, then runs the exact same `importProfiles` flow (validate + write + dependency report + collision handling).

- [ ] **Step 1: Write `test/command-pull.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as pull from '../src/commands/pull.js';

test('pull with no id dies (usage)', async () => {
  await assert.rejects(async () => pull.run([]), /usage/);
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Write `src/commands/pull.js`**

```js
// @ts-check
import { fetchGist } from '../core/gist.js';
import { importProfiles } from './import.js';
import { die } from '../util/log.js';

/**
 * @param {string[]} args
 * @returns {Promise<number>}
 */
export async function run(args) {
  const positional = args.filter((a) => !a.startsWith('--'));
  const idOrUrl = positional[0];
  if (!idOrUrl) {
    die('usage: ccprofile pull <gist-id|url> [--overwrite|--rename <nom>]');
  }
  const renameIdx = args.indexOf('--rename');
  const opts = {
    overwrite: args.includes('--overwrite'),
    rename: renameIdx >= 0 ? args[renameIdx + 1] : undefined
  };
  const text = await fetchGist(idOrUrl);
  return importProfiles(text, opts);
}
```

(Importing `importProfiles` from a sibling command module is the single allowed exception to "no command imports another command" — it is the shared import engine, not command orchestration. If preferred during review, the engine can be lifted into `src/core/share.js`; keep it wherever avoids duplication.)

- [ ] **Step 4: Wire `src/cli.js`** — `import * as pull` + `case 'pull': return await pull.run(rest);`.

- [ ] **Step 5: Run `node --test && pnpm lint`** → PASS.

- [ ] **Step 6: Commit** — `git commit -am "feat: add pull command"`.

---

## Task 12: usage + README + final integration

**Files:** Modify `src/cli.js` (usage text), `README.md`. Create `test/usage.test.js`.

- [ ] **Step 1: Write `test/usage.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/ccprofile.js', import.meta.url));

test('help lists the new commands', () => {
  const r = spawnSync(process.execPath, [BIN, 'help'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  for (const cmd of ['init', 'validate', 'diff', 'doctor', 'export', 'import', 'share', 'pull', 'upgrade']) {
    assert.ok(r.stdout.includes(cmd), `usage should mention ${cmd}`);
  }
});
```

- [ ] **Step 2: Run to verify failure** → FAIL (usage text not yet updated).

- [ ] **Step 3: Update the `USAGE` string in `src/cli.js`** to add the new commands under the existing list, each on its own line with a French one-liner, e.g.:

```
  ccprofile init [--force]        copie les profils par défaut dans ~/.claude/profiles
  ccprofile validate <profil>     valide un profil (schéma + skills/plugins référencés)
  ccprofile diff <a> <b>          compare deux profils (plugins/skills résolus)
  ccprofile doctor                diagnostic santé (profils, liens cassés, env)
  ccprofile export <profil> [--resolved] [--out <f>]  exporte un profil (JSON)
  ccprofile import <fichier|url>  importe un profil/bundle partagé
  ccprofile share <profil> | --all  partage via GitHub Gist
  ccprofile pull <gist|url>       importe un profil/bundle depuis un gist
  ccprofile upgrade               met à jour ccprofile (npm -g)
```

- [ ] **Step 4: Update `README.md`** — add the new commands to the command table and a short "Sharing" section: `ccprofile share web` → prints a gist URL; `ccprofile pull <url>` imports it (with a dependency report); `export`/`import` for file-based sharing; note `share`/`pull` need `gh` (or `GH_TOKEN`). Keep README in English.

- [ ] **Step 5: Run full `node --test && pnpm lint`** → PASS.

- [ ] **Step 6: Manual integration (document results, do not automate):** with `gh` authenticated, run `node bin/ccprofile.js share web`, copy the printed gist URL, then in a temp `CLAUDE_CONFIG_DIR` run `node bin/ccprofile.js pull <url>` and confirm `web.json` is written with a dependency report. Delete the test gist afterward (`gh gist delete <id>`).

- [ ] **Step 7: Commit** — `git commit -am "feat: document new commands in usage + README; sharing integration"`.

---

## Self-Review

**Spec coverage:** validate (T1), diff (T2), doctor (T3), --dry-run (T4), init (T5), upgrade (T6), sharing core (T7), export (T8), import incl. bundle+deps+collision (T9), gist+share (T10), pull (T11), usage/README/manual gist round-trip (T12). All spec §8 items covered.

**Placeholder scan:** Every code step carries complete code. The only deliberately-unchanged regions are the post-dry-run bodies of `apply`/`sync` (Task 4), explicitly described as "unchanged".

**Type consistency:** Commands export `run(args): number | Promise<number>` (import/share/pull/upgrade are async). `validateProfile(obj) → {valid, errors}`, `parseShared(text) → {kind, profiles}`, `dependencyReport(body) → {missingSkills, requiredPlugins}`, `createGist(opts) → Promise<string>`, `fetchGist(idOrUrl) → Promise<string>`, `importProfiles(text, opts) → number` — names consistent across consuming tasks (export/import/share/pull).

**Scope check:** Network is isolated to `gist.js`; tests are network-free; the live gist round-trip is a manual step. npm publish + machine migration remain out of this plan (separate, user-gated).
