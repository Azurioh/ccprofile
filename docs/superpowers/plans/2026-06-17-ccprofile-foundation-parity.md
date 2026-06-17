# ccprofile Foundation + Parity Port — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the 677-line Bash `ccprofile` to a zero-dependency Node.js ESM CLI that runs natively on Windows/Linux/macOS, preserving exact behavior of all ten existing subcommands.

**Architecture:** Thin `bin/` entry → `src/cli.js` dispatcher → one module per subcommand in `src/commands/` consuming shared logic in `src/core/` and helpers in `src/util/`. Each command module exports `run(args): number | Promise<number>` returning an exit code. No command imports another command. No external runtime dependencies — every Unix tool the Bash script shelled out to becomes Node stdlib.

**Tech Stack:** Node.js ≥18, ESM (`type: module`), plain JavaScript with `// @ts-check` + JSDoc, built-in `node:test` runner, eslint (dev only).

## Global Constraints

Every task implicitly includes these (copied verbatim from the spec):

- **Node engine:** `>=18`.
- **Runtime dependencies:** zero. Dev dependency: eslint only.
- **Module system:** ESM, `"type": "module"`. Type safety via `// @ts-check` + JSDoc, no build step.
- **Package name:** `@azurioh/ccprofile`, `publishConfig.access: "public"`.
- **Output text:** preserve the original French messages and glyphs (`✓`, `⚠`, `→`) exactly.
- **Exit codes:** `verify` returns `0` in-sync, `1` drift, `3` no-marker. `die`-style errors print `ccprofile: <msg>` to stderr and exit `1`. All other commands exit `0` on success.
- **Marker schema:** `{ profiles, extraSkills, managedPlugins, appliedAt, v: 1 }`.
- **Paths:** use `path.join` everywhere; home via `os.homedir()`; honor `CLAUDE_CONFIG_DIR` override (read lazily, never cached at import — tests depend on this).
- **Symlinks:** directory links use type `process.platform === 'win32' ? 'junction' : 'dir'`.
- **Never ship `skills-store`** in the package.
- **Atomic writes:** write to a temp path then `fs.renameSync` over the target.

---

## File Structure

| File | Responsibility |
|---|---|
| `bin/ccprofile.js` | Executable entry; calls `run()`, sets process exit code. |
| `src/cli.js` | Arg dispatch to command modules; `usage()`; error→exit mapping. |
| `src/util/log.js` | `info` / `warn` / `die` / `CcprofileError`. |
| `src/util/walk.js` | Depth-bounded recursive fs walk, prunes `node_modules` (replaces `find`). |
| `src/core/paths.js` | Lazy path getters: `claudeDir`/`storeDir`/`profilesDir`/`profilePath`/`markerPath`/`skillsDir`/`settingsPath`. |
| `src/core/json.js` | `readJson` / `writeJsonAtomic`. |
| `src/core/project.js` | `projectDir()` — git toplevel or cwd. |
| `src/core/gitignore.js` | `ensureGitignore()`. |
| `src/core/profiles.js` | `readProfile` / `resolveProfiles` (extends recursion + anti-cycle + ordered dedup). |
| `src/core/marker.js` | `readMarker` / `writeMarker`. |
| `src/core/links.js` | `linkSkill` / `isBrokenLink` / `linkType`. |
| `src/core/settings.js` | `readEnabledPlugins` / `mergePlugins` / `reconcilePlugins` / `clearEnabledPlugins`. |
| `src/core/detect.js` | `collectSignals` / `detect`. |
| `src/commands/*.js` | One per subcommand: `list, detect, apply, skill, verify, sync, inspect, show, hint, reset`. |
| `test/*.test.js` | `node:test` unit + parity tests with temp-dir fixtures. |
| `.github/workflows/ci.yml` | Matrix lint + test (incl. Windows). |
| `package.json`, `eslint.config.js`, `README.md`, `LICENSE`, `.npmignore` | Project metadata. |

---

## Task 1: Repo scaffold + executable entry

**Files:**
- Create: `package.json`, `eslint.config.js`, `.npmignore`, `LICENSE`, `bin/ccprofile.js`, `src/cli.js`, `src/util/log.js`
- Test: `test/cli.test.js`

**Interfaces:**
- Produces: `run(argv: string[]): Promise<number>` in `src/cli.js`; `CcprofileError`, `info(msg)`, `warn(msg)`, `die(msg)` in `src/util/log.js`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "@azurioh/ccprofile",
  "version": "1.0.0",
  "description": "Per-project Claude Code plugins + skills profiles. Global stays core-minimal.",
  "type": "module",
  "bin": { "ccprofile": "bin/ccprofile.js" },
  "engines": { "node": ">=18" },
  "files": ["bin", "src", "profiles"],
  "publishConfig": { "access": "public" },
  "scripts": {
    "test": "node --test",
    "lint": "eslint ."
  },
  "license": "MIT",
  "repository": { "type": "git", "url": "git+https://github.com/Azurioh/ccprofile.git" },
  "devDependencies": {}
}
```

- [ ] **Step 2: Add eslint (dev dep) via the package manager**

Run: `cd ~/Repositories/Personnel/ccprofile && pnpm add -D eslint`
Then create `eslint.config.js`:

```js
import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { process: 'readonly', console: 'readonly' }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      curly: ['error', 'all']
    }
  }
];
```

(If `pnpm add -D eslint` does not also pull `@eslint/js`, run `pnpm add -D @eslint/js`.)

- [ ] **Step 3: Write `src/util/log.js`**

```js
// @ts-check

/** Error type that the CLI maps to a `ccprofile: <msg>` stderr line + exit 1. */
export class CcprofileError extends Error {}

/** @param {string} msg */
export function info(msg) {
  process.stdout.write(`${msg}\n`);
}

/** @param {string} msg */
export function warn(msg) {
  process.stderr.write(`${msg}\n`);
}

/** @param {string} msg @returns {never} */
export function die(msg) {
  throw new CcprofileError(msg);
}
```

- [ ] **Step 4: Write `src/cli.js` (dispatcher with only `help` wired for now)**

```js
// @ts-check
import { CcprofileError } from './util/log.js';

const USAGE = `ccprofile — plugins/skills Claude Code par projet (global = core minimal)

  ccprofile list                  liste les profils disponibles
  ccprofile detect [--json]       détecte le(s) profil(s) adapté(s) au projet courant
  ccprofile apply <p> [p...]      active le(s) profil(s) dans le projet courant
  ccprofile skill <nom> [nom...]  ajoute un skill à la carte (ex: golang-pro)
  ccprofile verify [--json]       vérifie la dérive : projet vs définition courante du profil
  ccprofile sync                  réconcilie le projet sur la définition courante du profil
  ccprofile inspect <profil>      détaille plugins + skills d'un profil (avec extends)
  ccprofile show                  état du projet courant
  ccprofile hint                  ligne unique pour hook SessionStart (silencieux si à jour)
  ccprofile reset                 vide skills + plugins + marqueur du projet courant

Profils : ~/.claude/profiles/*.json     Store : ~/.claude/skills-store
Marqueur: <projet>/.claude/ccprofile.json`;

function usage() {
  process.stdout.write(`${USAGE}\n`);
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
export async function run(argv) {
  const cmd = argv[0] ?? '';
  const rest = argv.slice(1);
  try {
    switch (cmd) {
      case '':
      case '-h':
      case '--help':
      case 'help':
        usage();
        return 0;
      default:
        throw new CcprofileError(`commande inconnue: ${cmd} (voir: ccprofile help)`);
    }
  } catch (err) {
    if (err instanceof CcprofileError) {
      process.stderr.write(`ccprofile: ${err.message}\n`);
      return 1;
    }
    throw err;
  }
}
```

- [ ] **Step 5: Write `bin/ccprofile.js`**

```js
#!/usr/bin/env node
import { run } from '../src/cli.js';

run(process.argv.slice(2)).then(
  (code) => process.exit(code ?? 0),
  (err) => {
    process.stderr.write(`ccprofile: ${err?.stack ?? err}\n`);
    process.exit(1);
  }
);
```

- [ ] **Step 6: Write the failing smoke test `test/cli.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/cli.js';

test('unknown command returns exit code 1', async () => {
  const code = await run(['bogus']);
  assert.equal(code, 1);
});

test('help returns exit code 0', async () => {
  const code = await run(['--help']);
  assert.equal(code, 0);
});
```

- [ ] **Step 7: Run tests + lint**

Run: `node --test && pnpm lint`
Expected: PASS, eslint clean.

- [ ] **Step 8: Make bin executable + commit**

```bash
chmod +x bin/ccprofile.js
git add -A
git commit -m "feat: scaffold node CLI entry, dispatcher, logging"
```

---

## Task 2: Foundation helpers — paths, json, walk

**Files:**
- Create: `src/core/paths.js`, `src/core/json.js`, `src/util/walk.js`
- Test: `test/paths.test.js`, `test/json.test.js`, `test/walk.test.js`

**Interfaces:**
- Produces:
  - `paths.js`: `claudeDir()`, `storeDir()`, `profilesDir()`, `profilePath(name)`, `markerPath(proj)`, `skillsDir(proj)`, `settingsPath(proj)` — all `string`.
  - `json.js`: `readJson(file, fallback?)` → parsed value or `fallback`/`undefined`; `writeJsonAtomic(file, obj)` → void (creates parent dirs).
  - `walk.js`: `walk(dir, { maxDepth })` → generator of absolute file paths, prunes `node_modules`; `findFirst(dir, name, maxDepth)` → `boolean` (a glob-name match exists).

- [ ] **Step 1: Write `test/paths.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { claudeDir, profilePath, markerPath } from '../src/core/paths.js';

test('CLAUDE_CONFIG_DIR override is honored lazily', () => {
  const prev = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = path.join('/tmp', 'cc-test');
  assert.equal(claudeDir(), path.join('/tmp', 'cc-test'));
  process.env.CLAUDE_CONFIG_DIR = prev;
});

test('profilePath and markerPath build expected paths', () => {
  process.env.CLAUDE_CONFIG_DIR = path.join('/tmp', 'cc-test');
  assert.equal(profilePath('web'), path.join('/tmp', 'cc-test', 'profiles', 'web.json'));
  assert.equal(markerPath('/proj'), path.join('/proj', '.claude', 'ccprofile.json'));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/paths.test.js`
Expected: FAIL (module `../src/core/paths.js` not found).

- [ ] **Step 3: Write `src/core/paths.js`**

```js
// @ts-check
import os from 'node:os';
import path from 'node:path';

export function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}
export function storeDir() {
  return path.join(claudeDir(), 'skills-store');
}
export function profilesDir() {
  return path.join(claudeDir(), 'profiles');
}
/** @param {string} name */
export function profilePath(name) {
  return path.join(profilesDir(), `${name}.json`);
}
/** @param {string} proj */
export function markerPath(proj) {
  return path.join(proj, '.claude', 'ccprofile.json');
}
/** @param {string} proj */
export function skillsDir(proj) {
  return path.join(proj, '.claude', 'skills');
}
/** @param {string} proj */
export function settingsPath(proj) {
  return path.join(proj, '.claude', 'settings.local.json');
}
```

- [ ] **Step 4: Write `src/core/json.js`**

```js
// @ts-check
import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {string} file
 * @param {*} [fallback]
 * @returns {*}
 */
export function readJson(file, fallback = undefined) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/**
 * Atomic JSON write: temp file in the same directory, then rename.
 * @param {string} file
 * @param {*} obj
 */
export function writeJsonAtomic(file, obj) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`);
  fs.renameSync(tmp, file);
}
```

- [ ] **Step 5: Write `src/util/walk.js`**

```js
// @ts-check
import fs from 'node:fs';
import path from 'node:path';

/**
 * Yields absolute file paths under `dir`, pruning node_modules.
 * @param {string} dir
 * @param {{ maxDepth?: number }} [opts]
 * @returns {Generator<string>}
 */
export function* walk(dir, { maxDepth = Infinity } = {}) {
  /** @type {Array<{ p: string, d: number }>} */
  const stack = [{ p: dir, d: 0 }];
  while (stack.length > 0) {
    const { p, d } = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(p, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(p, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || d >= maxDepth) {
          continue;
        }
        stack.push({ p: full, d: d + 1 });
      } else {
        yield full;
      }
    }
  }
}

/**
 * True if any file basename matches `name` (supports a leading or trailing `*`).
 * @param {string} dir
 * @param {string} name
 * @param {number} maxDepth
 */
export function findFirst(dir, name, maxDepth) {
  const re = globToRegExp(name);
  for (const f of walk(dir, { maxDepth })) {
    if (re.test(path.basename(f))) {
      return true;
    }
  }
  return false;
}

/** @param {string} glob */
function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}
```

- [ ] **Step 6: Write `test/json.test.js` and `test/walk.test.js`**

```js
// test/json.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readJson, writeJsonAtomic } from '../src/core/json.js';

test('writeJsonAtomic then readJson round-trips and creates dirs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  const file = path.join(root, 'nested', 'x.json');
  writeJsonAtomic(file, { a: 1 });
  assert.deepEqual(readJson(file), { a: 1 });
});

test('readJson returns fallback on missing/invalid', () => {
  assert.equal(readJson('/no/such/file.json', null), null);
});
```

```js
// test/walk.test.js
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
```

- [ ] **Step 7: Run tests + lint**

Run: `node --test && pnpm lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add paths, json, and fs-walk helpers"
```

---

## Task 3: project root + gitignore

**Files:**
- Create: `src/core/project.js`, `src/core/gitignore.js`
- Test: `test/gitignore.test.js`

**Interfaces:**
- Produces: `projectDir(): string`; `ensureGitignore(proj): void` (idempotently appends `.claude/skills/` and `.claude/settings.local.json`).

- [ ] **Step 1: Write `test/gitignore.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureGitignore } from '../src/core/gitignore.js';

test('ensureGitignore adds both entries once, idempotently', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  ensureGitignore(root);
  ensureGitignore(root);
  const lines = fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split('\n').filter(Boolean);
  assert.equal(lines.filter((l) => l === '.claude/skills/').length, 1);
  assert.equal(lines.filter((l) => l === '.claude/settings.local.json').length, 1);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/gitignore.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/core/project.js`**

```js
// @ts-check
import { spawnSync } from 'node:child_process';

export function projectDir() {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (r.status === 0 && r.stdout) {
    const top = r.stdout.trim();
    if (top) {
      return top;
    }
  }
  return process.cwd();
}
```

- [ ] **Step 4: Write `src/core/gitignore.js`**

```js
// @ts-check
import fs from 'node:fs';
import path from 'node:path';

const ENTRIES = ['.claude/skills/', '.claude/settings.local.json'];

/** @param {string} proj */
export function ensureGitignore(proj) {
  const gi = path.join(proj, '.gitignore');
  let existing = '';
  try {
    existing = fs.readFileSync(gi, 'utf8');
  } catch {
    existing = '';
  }
  const present = new Set(existing.split('\n').map((l) => l.trim()));
  const toAdd = ENTRIES.filter((e) => !present.has(e));
  if (toAdd.length === 0) {
    return;
  }
  const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
  fs.appendFileSync(gi, `${prefix}${toAdd.join('\n')}\n`);
}
```

- [ ] **Step 5: Run tests + lint**

Run: `node --test && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add project-root detection and gitignore management"
```

---

## Task 4: profile resolution (extends + anti-cycle)

**Files:**
- Create: `src/core/profiles.js`
- Test: `test/profiles.test.js`

**Interfaces:**
- Consumes: `profilePath`, `profilesDir` from `core/paths.js`; `readJson` from `core/json.js`; `die` from `util/log.js`.
- Produces:
  - `readProfile(name): object` — throws `CcprofileError` if the file is absent.
  - `resolveProfiles(names: string[]): { plugins: string[], skills: string[] }` — recurses `extends` depth-first **before** adding own entries, anti-cycle by name, dedup preserving first occurrence.

- [ ] **Step 1: Write `test/profiles.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveProfiles } from '../src/core/profiles.js';

function setup(profiles) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  process.env.CLAUDE_CONFIG_DIR = root;
  fs.mkdirSync(path.join(root, 'profiles'), { recursive: true });
  for (const [name, body] of Object.entries(profiles)) {
    fs.writeFileSync(path.join(root, 'profiles', `${name}.json`), JSON.stringify(body));
  }
  return root;
}

test('extends resolves parents first and dedups', () => {
  setup({
    base: { plugins: ['p-base'], skills: ['s-base'] },
    web: { extends: ['base'], plugins: ['p-web', 'p-base'], skills: ['s-web'] }
  });
  const { plugins, skills } = resolveProfiles(['web']);
  assert.deepEqual(plugins, ['p-base', 'p-web']);
  assert.deepEqual(skills, ['s-base', 's-web']);
});

test('cyclic extends does not loop', () => {
  setup({
    a: { extends: ['b'], plugins: ['pa'], skills: [] },
    b: { extends: ['a'], plugins: ['pb'], skills: [] }
  });
  const { plugins } = resolveProfiles(['a']);
  assert.deepEqual([...plugins].sort(), ['pa', 'pb']);
});

test('unknown profile throws', () => {
  setup({});
  assert.throws(() => resolveProfiles(['ghost']), /profil inconnu/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/profiles.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/core/profiles.js`**

```js
// @ts-check
import fs from 'node:fs';
import { profilePath } from './paths.js';
import { readJson } from './json.js';
import { die } from './util-bridge.js';
```

Note: to avoid a circular import worry, import `die` directly from `../util/log.js`. Use this exact code:

```js
// @ts-check
import fs from 'node:fs';
import { profilePath } from './paths.js';
import { readJson } from './json.js';
import { die } from '../util/log.js';

/**
 * @param {string} name
 * @returns {{ extends?: string[], plugins?: string[], skills?: string[], description?: string }}
 */
export function readProfile(name) {
  const file = profilePath(name);
  if (!fs.existsSync(file)) {
    die(`profil inconnu: ${name} (${file} absent)`);
  }
  return readJson(file, {});
}

/**
 * @param {string[]} names
 * @returns {{ plugins: string[], skills: string[] }}
 */
export function resolveProfiles(names) {
  /** @type {string[]} */ const plugins = [];
  /** @type {string[]} */ const skills = [];
  const seen = new Set();

  /** @param {string} name */
  function visit(name) {
    if (seen.has(name)) {
      return;
    }
    const prof = readProfile(name);
    seen.add(name);
    for (const ext of prof.extends ?? []) {
      visit(ext);
    }
    for (const p of prof.plugins ?? []) {
      plugins.push(p);
    }
    for (const s of prof.skills ?? []) {
      skills.push(s);
    }
  }

  for (const n of names) {
    if (n) {
      visit(n);
    }
  }
  return { plugins: dedup(plugins), skills: dedup(skills) };
}

/** @param {string[]} arr */
function dedup(arr) {
  return [...new Set(arr.filter(Boolean))];
}
```

(Delete the throwaway first code block — the file is the second block. Do not create `util-bridge.js`.)

- [ ] **Step 4: Run tests + lint**

Run: `node --test test/profiles.test.js && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add profile resolution with extends recursion and anti-cycle"
```

---

## Task 5: marker read/write

**Files:**
- Create: `src/core/marker.js`
- Test: `test/marker.test.js`

**Interfaces:**
- Consumes: `markerPath` from `core/paths.js`; `readJson`/`writeJsonAtomic` from `core/json.js`.
- Produces:
  - `readMarker(proj): object | null`.
  - `writeMarker(proj, { profiles, extraSkills, managedPlugins }): void` — stamps `appliedAt` (ISO `Z`) and `v: 1`.

- [ ] **Step 1: Write `test/marker.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readMarker, writeMarker } from '../src/core/marker.js';

test('writeMarker stamps schema v1 and appliedAt; readMarker reads it back', () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  writeMarker(proj, { profiles: ['web'], extraSkills: ['x'], managedPlugins: ['p'] });
  const m = readMarker(proj);
  assert.equal(m.v, 1);
  assert.deepEqual(m.profiles, ['web']);
  assert.deepEqual(m.extraSkills, ['x']);
  assert.deepEqual(m.managedPlugins, ['p']);
  assert.match(m.appliedAt, /^\d{4}-\d{2}-\d{2}T.*Z$/);
});

test('readMarker returns null when absent', () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  assert.equal(readMarker(proj), null);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/marker.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/core/marker.js`**

```js
// @ts-check
import { markerPath } from './paths.js';
import { readJson, writeJsonAtomic } from './json.js';

/** @param {string} proj */
export function readMarker(proj) {
  return readJson(markerPath(proj), null);
}

/**
 * @param {string} proj
 * @param {{ profiles: string[], extraSkills: string[], managedPlugins: string[] }} data
 */
export function writeMarker(proj, { profiles, extraSkills, managedPlugins }) {
  writeJsonAtomic(markerPath(proj), {
    profiles,
    extraSkills,
    managedPlugins,
    appliedAt: new Date().toISOString(),
    v: 1
  });
}
```

- [ ] **Step 4: Run tests + lint**

Run: `node --test test/marker.test.js && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add project marker read/write (schema v1)"
```

---

## Task 6: skill linking (symlink/junction, Windows-safe)

**Files:**
- Create: `src/core/links.js`
- Test: `test/links.test.js`

**Interfaces:**
- Consumes: `storeDir` from `core/paths.js`; `warn` from `util/log.js`.
- Produces:
  - `linkType` — `'junction'` on win32 else `'dir'`.
  - `linkSkill(skill, destDir): boolean` — `false` (and a `⚠` warning) if the skill is absent from the store; replaces any existing link/file then creates the link.
  - `isBrokenLink(p): boolean` — symlink whose target no longer resolves.

- [ ] **Step 1: Write `test/links.test.js`**

```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/links.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/core/links.js`**

```js
// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { storeDir } from './paths.js';
import { warn } from '../util/log.js';

export const linkType = process.platform === 'win32' ? 'junction' : 'dir';

/**
 * @param {string} skill
 * @param {string} destDir
 * @returns {boolean}
 */
export function linkSkill(skill, destDir) {
  const target = path.join(storeDir(), skill);
  if (!fs.existsSync(target)) {
    warn(`  ⚠ skill absent du store: ${skill}`);
    return false;
  }
  const dest = path.join(destDir, skill);
  try {
    fs.rmSync(dest, { recursive: true, force: true });
  } catch {
    /* nothing to remove */
  }
  fs.symlinkSync(target, dest, linkType);
  return true;
}

/** @param {string} p */
export function isBrokenLink(p) {
  try {
    const st = fs.lstatSync(p);
    if (!st.isSymbolicLink()) {
      return false;
    }
    return !fs.existsSync(p);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run tests + lint**

Run: `node --test test/links.test.js && pnpm lint`
Expected: PASS (on macOS/Linux junctions fall back to dir symlinks; the Windows CI leg exercises junctions).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Windows-safe skill linking (junction fallback)"
```

---

## Task 7: settings.local.json plugin management

**Files:**
- Create: `src/core/settings.js`
- Test: `test/settings.test.js`

**Interfaces:**
- Consumes: `settingsPath` from `core/paths.js`; `readJson`/`writeJsonAtomic` from `core/json.js`.
- Produces:
  - `readEnabledPlugins(proj): string[]` — keys with value `true`, sorted.
  - `mergePlugins(proj, names): void` — sets `enabledPlugins[name] = true` for each.
  - `reconcilePlugins(proj, expected, managed): void` — drops managed-but-not-expected, keeps manually enabled (non-managed), sets all expected to `true`.
  - `clearEnabledPlugins(proj): void` — deletes the `enabledPlugins` key.

- [ ] **Step 1: Write `test/settings.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mergePlugins, readEnabledPlugins, reconcilePlugins } from '../src/core/settings.js';

function proj() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  return root;
}

test('mergePlugins enables and readEnabledPlugins returns sorted keys', () => {
  const p = proj();
  mergePlugins(p, ['b-plug', 'a-plug']);
  assert.deepEqual(readEnabledPlugins(p), ['a-plug', 'b-plug']);
});

test('reconcilePlugins drops stale managed but keeps manual', () => {
  const p = proj();
  mergePlugins(p, ['manual']);            // user-enabled, not managed
  reconcilePlugins(p, ['new'], ['old']);  // expected=new, managed previously=old
  const got = readEnabledPlugins(p);
  assert.deepEqual(got, ['manual', 'new']); // old removed, manual untouched, new added
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/settings.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/core/settings.js`**

```js
// @ts-check
import { settingsPath } from './paths.js';
import { readJson, writeJsonAtomic } from './json.js';

/** @param {string} proj */
function load(proj) {
  return readJson(settingsPath(proj), {}) ?? {};
}

/** @param {string} proj */
export function readEnabledPlugins(proj) {
  const s = load(proj);
  const enabled = s.enabledPlugins ?? {};
  return Object.keys(enabled)
    .filter((k) => enabled[k] === true)
    .sort();
}

/**
 * @param {string} proj
 * @param {string[]} names
 */
export function mergePlugins(proj, names) {
  const s = load(proj);
  s.enabledPlugins = s.enabledPlugins ?? {};
  for (const n of names) {
    s.enabledPlugins[n] = true;
  }
  writeJsonAtomic(settingsPath(proj), s);
}

/**
 * Reconcile managed set: remove (managed ∖ expected), keep manual, set expected true.
 * @param {string} proj
 * @param {string[]} expected
 * @param {string[]} managed
 */
export function reconcilePlugins(proj, expected, managed) {
  const s = load(proj);
  const current = s.enabledPlugins ?? {};
  const managedSet = new Set(managed);
  const expectedSet = new Set(expected);
  /** @type {Record<string, boolean>} */
  const next = {};
  for (const k of Object.keys(current)) {
    // keep if not managed, or still expected
    if (!managedSet.has(k) || expectedSet.has(k)) {
      next[k] = current[k];
    }
  }
  for (const p of expected) {
    next[p] = true;
  }
  s.enabledPlugins = next;
  writeJsonAtomic(settingsPath(proj), s);
}

/** @param {string} proj */
export function clearEnabledPlugins(proj) {
  const s = load(proj);
  delete s.enabledPlugins;
  writeJsonAtomic(settingsPath(proj), s);
}
```

- [ ] **Step 4: Run tests + lint**

Run: `node --test test/settings.test.js && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add settings.local.json plugin merge/reconcile"
```

---

## Task 8: project detection (signals + scoring)

**Files:**
- Create: `src/core/detect.js`
- Test: `test/detect.test.js`

**Interfaces:**
- Consumes: `walk`/`findFirst` from `util/walk.js`; `readJson` from `core/json.js`; `readMarker` from `core/marker.js`.
- Produces:
  - `collectSignals(proj): Array<{ profile: string, signal: string }>`.
  - `detect(proj): { recommended: string[], candidates: Array<{ profile: string, score: number, signals: string[] }>, applied: string[] }` — candidates sorted by score desc.

Detection data (verbatim from the Bash source):
- web deps: `next react react-dom vue svelte @sveltejs/kit vite @vitejs/plugin-react @vitejs/plugin-vue astro nuxt @angular/core solid-js`
- backend deps: `@nestjs/core express fastify koa @hapi/hapi prisma @prisma/client typeorm drizzle-orm mongoose`
- mobile deps: `react-native expo @react-native-community/cli @expo/cli`
- web file globs: `next.config.*` `vite.config.*` `astro.config.*` `svelte.config.*` `nuxt.config.*` `angular.json`
- backend file: `nest-cli.json`
- mobile files: `pubspec.yaml` `metro.config.js` `Package.swift` `*.xcodeproj`
- devops files: `Dockerfile` `docker-compose.yml` `docker-compose.yaml` `ansible.cfg` `Chart.yaml` `*.tf`
- data file: `*.ipynb`
- python data libs (in `requirements.txt`/`pyproject.toml`/`Pipfile`/`setup.py`): `pandas numpy torch tensorflow scikit-learn sklearn pyspark transformers` → profile `data`
- maxDepth: 4

- [ ] **Step 1: Write `test/detect.test.js`**

```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/detect.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/core/detect.js`**

```js
// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { walk, findFirst } from '../util/walk.js';
import { readJson } from './json.js';
import { readMarker } from './marker.js';

const MAX_DEPTH = 4;

const WEB_DEPS = 'next react react-dom vue svelte @sveltejs/kit vite @vitejs/plugin-react @vitejs/plugin-vue astro nuxt @angular/core solid-js'.split(' ');
const BACKEND_DEPS = '@nestjs/core express fastify koa @hapi/hapi prisma @prisma/client typeorm drizzle-orm mongoose'.split(' ');
const MOBILE_DEPS = 'react-native expo @react-native-community/cli @expo/cli'.split(' ');
const WEB_FILES = ['next.config.*', 'vite.config.*', 'astro.config.*', 'svelte.config.*', 'nuxt.config.*', 'angular.json'];
const MOBILE_FILES = ['pubspec.yaml', 'metro.config.js', 'Package.swift', '*.xcodeproj'];
const DEVOPS_FILES = ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'ansible.cfg', 'Chart.yaml', '*.tf'];
const PY_LIBS = ['pandas', 'numpy', 'torch', 'tensorflow', 'scikit-learn', 'sklearn', 'pyspark', 'transformers'];
const PY_MANIFESTS = new Set(['requirements.txt', 'pyproject.toml', 'Pipfile', 'setup.py']);

/**
 * @param {string} proj
 * @returns {Array<{ profile: string, signal: string }>}
 */
export function collectSignals(proj) {
  /** @type {Array<{ profile: string, signal: string }>} */
  const sigs = [];
  const emit = (profile, signal) => sigs.push({ profile, signal });

  const deps = new Set();
  for (const f of walk(proj, { maxDepth: MAX_DEPTH })) {
    if (path.basename(f) === 'package.json') {
      const pkg = readJson(f, {}) ?? {};
      for (const k of Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) })) {
        deps.add(k);
      }
    }
  }
  for (const d of WEB_DEPS) {
    if (deps.has(d)) { emit('web', `dep:${d}`); }
  }
  for (const d of BACKEND_DEPS) {
    if (deps.has(d)) { emit('backend', `dep:${d}`); }
  }
  for (const d of MOBILE_DEPS) {
    if (deps.has(d)) { emit('mobile', `dep:${d}`); }
  }

  for (const g of WEB_FILES) {
    if (findFirst(proj, g, MAX_DEPTH)) { emit('web', `file:${g}`); }
  }
  if (findFirst(proj, 'nest-cli.json', MAX_DEPTH)) { emit('backend', 'file:nest-cli.json'); }
  for (const g of MOBILE_FILES) {
    if (findFirst(proj, g, MAX_DEPTH)) { emit('mobile', `file:${g}`); }
  }
  for (const g of DEVOPS_FILES) {
    if (findFirst(proj, g, MAX_DEPTH)) { emit('devops', `file:${g}`); }
  }
  if (findFirst(proj, '*.ipynb', MAX_DEPTH)) { emit('data', 'file:*.ipynb'); }

  for (const f of walk(proj, { maxDepth: MAX_DEPTH })) {
    if (PY_MANIFESTS.has(path.basename(f))) {
      let text = '';
      try { text = fs.readFileSync(f, 'utf8'); } catch { text = ''; }
      const lower = text.toLowerCase();
      for (const lib of PY_LIBS) {
        if (new RegExp(`\\b${lib}\\b`).test(lower)) { emit('data', `py:${lib}`); }
      }
    }
  }
  return sigs;
}

/**
 * @param {string} proj
 */
export function detect(proj) {
  const sigs = collectSignals(proj);
  // dedup identical (profile|signal) pairs, like `sort -u`
  const uniq = new Map();
  for (const { profile, signal } of sigs) {
    uniq.set(`${profile}|${signal}`, { profile, signal });
  }
  /** @type {Map<string, Set<string>>} */
  const byProfile = new Map();
  for (const { profile, signal } of uniq.values()) {
    if (!byProfile.has(profile)) { byProfile.set(profile, new Set()); }
    byProfile.get(profile).add(signal);
  }
  const candidates = [...byProfile.entries()]
    .map(([profile, set]) => ({ profile, score: set.size, signals: [...set] }))
    .sort((a, b) => b.score - a.score);

  const maxScore = candidates.length ? candidates[0].score : 0;
  const recommended = maxScore === 0 ? [] : candidates.filter((c) => c.score === maxScore).map((c) => c.profile);

  const marker = readMarker(proj);
  const applied = marker?.profiles ?? [];
  return { recommended, candidates, applied };
}
```

- [ ] **Step 4: Run tests + lint**

Run: `node --test test/detect.test.js && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add project detection (signals + scoring)"
```

---

## Task 9: `list` + `inspect` commands + wire dispatcher

**Files:**
- Create: `src/commands/list.js`, `src/commands/inspect.js`
- Modify: `src/cli.js` (wire `list`, `inspect`)
- Test: `test/commands-list-inspect.test.js`

**Interfaces:**
- Consumes: `profilesDir`/`profilePath` (paths), `readJson` (json), `resolveProfiles`/`readProfile` (profiles), `info`/`die` (log).
- Produces: `list.run(args): number`, `inspect.run(args): number`.

- [ ] **Step 1: Write `test/commands-list-inspect.test.js`**

```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/commands-list-inspect.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/commands/list.js`**

```js
// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { profilesDir } from '../core/paths.js';
import { readJson } from '../core/json.js';
import { info } from '../util/log.js';

/** @param {string[]} _args */
export function run(_args) {
  const dir = profilesDir();
  info(`Profils disponibles (${dir}):`);
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  } catch {
    files = [];
  }
  if (files.length === 0) {
    info('  (aucun)');
    return 0;
  }
  for (const f of files) {
    const n = path.basename(f, '.json');
    const prof = readJson(path.join(dir, f), {}) ?? {};
    const np = (prof.plugins ?? []).length;
    const ns = (prof.skills ?? []).length;
    const ext = (prof.extends ?? []).length > 0 ? ` + ${prof.extends.join(',')}` : '';
    info(`  ${n.padEnd(12)} ${String(np).padStart(2)} plugins, ${String(ns).padStart(2)} skills${ext}`);
  }
  return 0;
}
```

- [ ] **Step 4: Write `src/commands/inspect.js`**

```js
// @ts-check
import fs from 'node:fs';
import { profilePath } from '../core/paths.js';
import { readJson } from '../core/json.js';
import { resolveProfiles } from '../core/profiles.js';
import { info, die } from '../util/log.js';

/** @param {string[]} args */
export function run(args) {
  const name = args[0];
  if (!name) {
    die('usage: ccprofile inspect <profil>');
  }
  const file = profilePath(name);
  if (!fs.existsSync(file)) {
    die(`profil inconnu: ${name} (${file} absent)`);
  }
  const prof = readJson(file, {}) ?? {};
  const ownPlugins = new Set(prof.plugins ?? []);
  const ownSkills = new Set(prof.skills ?? []);
  const { plugins, skills } = resolveProfiles([name]);

  info(`Profil  : ${name}`);
  if (prof.description) {
    info(`Desc    : ${prof.description}`);
  }
  info(`Extends : ${(prof.extends ?? []).length ? prof.extends.join(', ') : '(aucun)'}`);
  info('-- plugins --');
  printMarked(plugins, ownPlugins);
  info('-- skills --');
  printMarked(skills, ownSkills);
  return 0;
}

/**
 * @param {string[]} all
 * @param {Set<string>} own
 */
function printMarked(all, own) {
  if (all.length === 0) {
    info('  (aucun)');
    return;
  }
  for (const line of all) {
    info(own.has(line) ? `  ${line}` : `  ${line}  (hérité)`);
  }
}
```

- [ ] **Step 5: Wire dispatcher — modify `src/cli.js`**

Add imports below the existing import:

```js
import * as list from './commands/list.js';
import * as inspect from './commands/inspect.js';
```

Add cases in the `switch` before `default`:

```js
      case 'list':
        return await list.run(rest);
      case 'inspect':
        return await inspect.run(rest);
```

- [ ] **Step 6: Run tests + lint**

Run: `node --test && pnpm lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add list and inspect commands"
```

---

## Task 10: `detect` command

**Files:**
- Create: `src/commands/detect.js`
- Modify: `src/cli.js`
- Test: `test/command-detect.test.js`

**Interfaces:**
- Consumes: `projectDir` (project), `detect` (core/detect), `info` (log).
- Produces: `detect.run(args): number`. `--json` prints `{recommended,candidates,applied}`; plain mode prints the French summary.

- [ ] **Step 1: Write `test/command-detect.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('detect --json emits recommended/candidates/applied keys', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  fs.writeFileSync(path.join(root, 'Dockerfile'), 'FROM node');
  const cwd = process.cwd();
  process.chdir(root);
  const chunks = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => { chunks.push(s); return true; };
  const detect = await import('../src/commands/detect.js');
  const code = await detect.run(['--json']);
  process.stdout.write = orig;
  process.chdir(cwd);
  assert.equal(code, 0);
  const parsed = JSON.parse(chunks.join(''));
  assert.ok('recommended' in parsed && 'candidates' in parsed && 'applied' in parsed);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/command-detect.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/commands/detect.js`**

```js
// @ts-check
import { projectDir } from '../core/project.js';
import { detect } from '../core/detect.js';
import { info } from '../util/log.js';

/** @param {string[]} args */
export function run(args) {
  const jsonMode = args[0] === '--json';
  const proj = projectDir();
  const result = detect(proj);

  if (jsonMode) {
    info(JSON.stringify(result));
    return 0;
  }

  info(`Projet     : ${proj}`);
  const rec = result.recommended.length
    ? result.recommended.join(', ')
    : '(aucun signal dev — choix manuel: content/marketing/…)';
  info(`Recommandé : ${rec}`);
  info('-- candidats --');
  if (result.candidates.length > 0) {
    for (const c of result.candidates) {
      info(`  ${c.profile}  (score ${c.score}) : ${c.signals.join(', ')}`);
    }
  } else {
    info('  (aucun signal détecté)');
  }
  info(`Appliqué   : ${result.applied.length ? result.applied.join(', ') : '(aucun)'}`);
  return 0;
}
```

- [ ] **Step 4: Wire dispatcher — modify `src/cli.js`**

```js
import * as detect from './commands/detect.js';
```
```js
      case 'detect':
        return await detect.run(rest);
```

- [ ] **Step 5: Run tests + lint**

Run: `node --test && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add detect command (plain + --json)"
```

---

## Task 11: `apply` command

**Files:**
- Create: `src/commands/apply.js`
- Modify: `src/cli.js`
- Test: `test/command-apply.test.js`

**Interfaces:**
- Consumes: `projectDir`, `skillsDir` (paths), `resolveProfiles`, `linkSkill`, `mergePlugins`, `readMarker`/`writeMarker`, `ensureGitignore`, `info`/`die`.
- Produces: `apply.run(args): number`. Marker rule: `managedPlugins = unique(prev.managedPlugins + resolvedPlugins)`, `extraSkills` preserved, `profiles = unique(args)`.

- [ ] **Step 1: Write `test/command-apply.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readMarker } from '../src/core/marker.js';
import { readEnabledPlugins } from '../src/core/settings.js';

test('apply links skills, enables plugins, writes marker', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.mkdirSync(path.join(home, 'skills-store', 'skill-a'), { recursive: true });
  fs.writeFileSync(
    path.join(home, 'profiles', 'web.json'),
    JSON.stringify({ plugins: ['plug-x'], skills: ['skill-a'] })
  );
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  const cwd = process.cwd();
  process.chdir(proj);
  const apply = await import('../src/commands/apply.js');
  const code = await apply.run(['web']);
  process.chdir(cwd);

  assert.equal(code, 0);
  assert.equal(fs.existsSync(path.join(proj, '.claude', 'skills', 'skill-a')), true);
  assert.deepEqual(readEnabledPlugins(proj), ['plug-x']);
  const m = readMarker(proj);
  assert.deepEqual(m.profiles, ['web']);
  assert.deepEqual(m.managedPlugins, ['plug-x']);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/command-apply.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/commands/apply.js`**

```js
// @ts-check
import fs from 'node:fs';
import { skillsDir } from '../core/paths.js';
import { projectDir } from '../core/project.js';
import { resolveProfiles } from '../core/profiles.js';
import { linkSkill } from '../core/links.js';
import { mergePlugins } from '../core/settings.js';
import { readMarker, writeMarker } from '../core/marker.js';
import { ensureGitignore } from '../core/gitignore.js';
import { info, die } from '../util/log.js';

/** @param {string[]} args */
export function run(args) {
  if (args.length < 1) {
    die('usage: ccprofile apply <profil> [profil...]');
  }
  const proj = projectDir();
  const dest = skillsDir(proj);
  fs.mkdirSync(dest, { recursive: true });

  const { plugins, skills } = resolveProfiles(args);

  info(`Projet : ${proj}`);
  info(`Profils: ${args.join(' ')}`);

  let ns = 0;
  for (const s of skills) {
    if (linkSkill(s, dest)) {
      ns += 1;
    }
  }
  if (plugins.length > 0) {
    mergePlugins(proj, plugins);
  }

  const prev = readMarker(proj);
  const prevExtra = prev?.extraSkills ?? [];
  const prevManaged = prev?.managedPlugins ?? [];
  const profiles = [...new Set(args)];
  const managed = [...new Set([...prevManaged, ...plugins])];
  writeMarker(proj, { profiles, extraSkills: prevExtra, managedPlugins: managed });

  ensureGitignore(proj);
  info(`✓ ${ns} skills symlinkés, ${plugins.length} plugins activés → .claude/settings.local.json`);
  info('  marqueur écrit → .claude/ccprofile.json');
  info('  (effet à la prochaine session Claude Code)');
  return 0;
}
```

- [ ] **Step 4: Wire dispatcher — modify `src/cli.js`**

```js
import * as apply from './commands/apply.js';
```
```js
      case 'apply':
        return await apply.run(rest);
```

- [ ] **Step 5: Run tests + lint**

Run: `node --test && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add apply command"
```

---

## Task 12: `skill` command

**Files:**
- Create: `src/commands/skill.js`
- Modify: `src/cli.js`
- Test: `test/command-skill.test.js`

**Interfaces:**
- Consumes: `projectDir`, `skillsDir`, `linkSkill`, `ensureGitignore`, `readMarker`/`writeMarker`, `info`/`die`.
- Produces: `skill.run(args): number`. Records names in marker `extraSkills` (union, unique); if no marker, creates one with empty profiles/managed.

- [ ] **Step 1: Write `test/command-skill.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readMarker } from '../src/core/marker.js';

test('skill links à-la-carte and records in extraSkills', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'skills-store', 'golang-pro'), { recursive: true });
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  const cwd = process.cwd();
  process.chdir(proj);
  const skill = await import('../src/commands/skill.js');
  const code = await skill.run(['golang-pro']);
  process.chdir(cwd);
  assert.equal(code, 0);
  assert.deepEqual(readMarker(proj).extraSkills, ['golang-pro']);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/command-skill.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/commands/skill.js`**

```js
// @ts-check
import fs from 'node:fs';
import { skillsDir } from '../core/paths.js';
import { projectDir } from '../core/project.js';
import { linkSkill } from '../core/links.js';
import { ensureGitignore } from '../core/gitignore.js';
import { readMarker, writeMarker } from '../core/marker.js';
import { info, die } from '../util/log.js';

/** @param {string[]} args */
export function run(args) {
  if (args.length < 1) {
    die('usage: ccprofile skill <nom> [nom...]');
  }
  const proj = projectDir();
  const dest = skillsDir(proj);
  fs.mkdirSync(dest, { recursive: true });
  ensureGitignore(proj);

  let ok = 0;
  for (const s of args) {
    if (linkSkill(s, dest)) {
      ok += 1;
    }
  }

  const prev = readMarker(proj);
  const extra = [...new Set([...(prev?.extraSkills ?? []), ...args])];
  if (prev) {
    writeMarker(proj, {
      profiles: prev.profiles ?? [],
      extraSkills: extra,
      managedPlugins: prev.managedPlugins ?? []
    });
  } else {
    writeMarker(proj, { profiles: [], extraSkills: extra, managedPlugins: [] });
  }
  info(`✓ ${ok} skill(s) ajouté(s) → ${dest} (suivi dans .claude/ccprofile.json)`);
  return 0;
}
```

- [ ] **Step 4: Wire dispatcher — modify `src/cli.js`**

```js
import * as skill from './commands/skill.js';
```
```js
      case 'skill':
        return await skill.run(rest);
```

- [ ] **Step 5: Run tests + lint**

Run: `node --test && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add skill (à-la-carte) command"
```

---

## Task 13: `verify` command (exit codes 0/1/3)

**Files:**
- Create: `src/commands/verify.js`
- Modify: `src/cli.js`
- Test: `test/command-verify.test.js`

**Interfaces:**
- Consumes: `projectDir`, `skillsDir`, `readMarker`, `resolveProfiles`, `readEnabledPlugins`, `isBrokenLink`, `info`.
- Produces: `verify.run(args): number` returning `0`/`1`/`3`. `--json` emits `{status, missingSkills, extraSkills, missingPlugins, stalePlugins, broken}` where `status` is `in-sync`/`drift`/(for no marker) `no-marker`.
- The drift sets, computed against sorted unique lists:
  - `expectedSkills = unique(resolved.skills + marker.extraSkills)`
  - `expectedPlugins = unique(resolved.plugins)`
  - `actualSkills` = entries in `.claude/skills`
  - `actualPlugins` = enabled plugins
  - `missingSkills = expected ∖ actual`; `extraSkills = actual ∖ expected`
  - `missingPlugins = expectedPlugins ∖ actualPlugins`
  - `managedActive = managed ∩ actualPlugins`; `stalePlugins = managedActive ∖ expectedPlugins`
  - `broken` = broken symlinks in `.claude/skills`

- [ ] **Step 1: Write `test/command-verify.test.js`**

```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/command-verify.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/commands/verify.js`**

```js
// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { skillsDir } from '../core/paths.js';
import { projectDir } from '../core/project.js';
import { readMarker } from '../core/marker.js';
import { resolveProfiles } from '../core/profiles.js';
import { readEnabledPlugins } from '../core/settings.js';
import { isBrokenLink } from '../core/links.js';
import { info } from '../util/log.js';

const sortedUnique = (arr) => [...new Set(arr.filter(Boolean))].sort();
const diff = (a, b) => { const sb = new Set(b); return a.filter((x) => !sb.has(x)); };
const inter = (a, b) => { const sb = new Set(b); return a.filter((x) => sb.has(x)); };

/** @param {string[]} args */
export function run(args) {
  const jsonMode = args[0] === '--json';
  const proj = projectDir();
  const marker = readMarker(proj);
  if (!marker) {
    if (jsonMode) {
      info(JSON.stringify({ status: 'no-marker' }));
    } else {
      info('ccprofile: aucun profil appliqué (pas de .claude/ccprofile.json)');
    }
    return 3;
  }

  const { plugins, skills } = resolveProfiles(marker.profiles ?? []);
  const expectedSkills = sortedUnique([...skills, ...(marker.extraSkills ?? [])]);
  const expectedPlugins = sortedUnique(plugins);

  const dir = skillsDir(proj);
  let actualSkills = [];
  try {
    actualSkills = sortedUnique(fs.readdirSync(dir));
  } catch {
    actualSkills = [];
  }
  const actualPlugins = readEnabledPlugins(proj);
  const managed = sortedUnique(marker.managedPlugins ?? []);

  const missingSkills = diff(expectedSkills, actualSkills);
  const extraSkills = diff(actualSkills, expectedSkills);
  const missingPlugins = diff(expectedPlugins, actualPlugins);
  const managedActive = inter(managed, actualPlugins);
  const stalePlugins = diff(managedActive, expectedPlugins);

  let broken = [];
  try {
    broken = sortedUnique(
      fs.readdirSync(dir).filter((b) => isBrokenLink(path.join(dir, b)))
    );
  } catch {
    broken = [];
  }

  const n = missingSkills.length + extraSkills.length + missingPlugins.length + stalePlugins.length + broken.length;

  if (jsonMode) {
    info(JSON.stringify({
      status: n === 0 ? 'in-sync' : 'drift',
      missingSkills, extraSkills, missingPlugins, stalePlugins, broken
    }));
  } else if (n === 0) {
    info(`✓ ccprofile: projet à jour avec '${(marker.profiles ?? []).join(' ')}'`);
  } else {
    info(`⚠ ccprofile: dérive détectée (${n} écart(s))`);
    printList('skills manquants (profil enrichi)', missingSkills);
    printList('skills en trop (profil réduit / orphelins)', extraSkills);
    printList('plugins manquants', missingPlugins);
    printList('plugins obsolètes', stalePlugins);
    printList('symlinks cassés (skill retiré du store)', broken);
    info('  → lance: ccprofile sync');
  }
  return n === 0 ? 0 : 1;
}

/**
 * @param {string} title
 * @param {string[]} body
 */
function printList(title, body) {
  if (body.length === 0) {
    return;
  }
  info(`  ${title} :`);
  for (const line of body) {
    info(`    - ${line}`);
  }
}
```

- [ ] **Step 4: Wire dispatcher — modify `src/cli.js`**

```js
import * as verify from './commands/verify.js';
```
```js
      case 'verify':
        return await verify.run(rest);
```

- [ ] **Step 5: Run tests + lint**

Run: `node --test && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add verify command with 0/1/3 exit codes"
```

---

## Task 14: `sync` command

**Files:**
- Create: `src/commands/sync.js`
- Modify: `src/cli.js`
- Test: `test/command-sync.test.js`

**Interfaces:**
- Consumes: `projectDir`, `skillsDir`, `readMarker`/`writeMarker`, `resolveProfiles`, `linkSkill`, `isBrokenLink`, `reconcilePlugins`, `ensureGitignore`, `info`/`die`.
- Produces: `sync.run(args): number`. Removes off-profile + broken skill links, relinks expected, reconciles managed plugins, refreshes marker `managedPlugins = expectedPlugins`.

- [ ] **Step 1: Write `test/command-sync.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readMarker } from '../src/core/marker.js';

test('sync removes off-profile skills and relinks expected', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.mkdirSync(path.join(home, 'skills-store', 'want'), { recursive: true });
  fs.writeFileSync(path.join(home, 'profiles', 'p.json'), JSON.stringify({ plugins: [], skills: ['want'] }));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  const sdir = path.join(proj, '.claude', 'skills');
  fs.mkdirSync(sdir, { recursive: true });
  fs.symlinkSync(path.join(home, 'skills-store'), path.join(sdir, 'stale'), process.platform === 'win32' ? 'junction' : 'dir');
  fs.writeFileSync(path.join(proj, '.claude', 'ccprofile.json'), JSON.stringify({ profiles: ['p'], extraSkills: [], managedPlugins: [], v: 1 }));

  const cwd = process.cwd();
  process.chdir(proj);
  const sync = await import('../src/commands/sync.js');
  const code = await sync.run([]);
  process.chdir(cwd);

  assert.equal(code, 0);
  assert.equal(fs.existsSync(path.join(sdir, 'want')), true);
  assert.equal(fs.existsSync(path.join(sdir, 'stale')), false);
  assert.deepEqual(readMarker(proj).managedPlugins, []);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/command-sync.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/commands/sync.js`**

```js
// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { skillsDir } from '../core/paths.js';
import { projectDir } from '../core/project.js';
import { readMarker, writeMarker } from '../core/marker.js';
import { resolveProfiles } from '../core/profiles.js';
import { linkSkill, isBrokenLink } from '../core/links.js';
import { reconcilePlugins } from '../core/settings.js';
import { ensureGitignore } from '../core/gitignore.js';
import { info, die } from '../util/log.js';

/** @param {string[]} _args */
export function run(_args) {
  const proj = projectDir();
  const marker = readMarker(proj);
  if (!marker) {
    die("aucun profil à synchroniser (pas de marqueur). Lance d'abord: ccprofile apply <profil>");
  }

  const { plugins, skills } = resolveProfiles(marker.profiles ?? []);
  const expectedSkills = new Set([...skills, ...(marker.extraSkills ?? [])].filter(Boolean));
  const expectedPlugins = [...new Set(plugins.filter(Boolean))];

  const dir = skillsDir(proj);
  fs.mkdirSync(dir, { recursive: true });

  let removed = 0;
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    entries = [];
  }
  for (const base of entries) {
    const full = path.join(dir, base);
    if (!expectedSkills.has(base)) {
      fs.rmSync(full, { recursive: true, force: true });
      removed += 1;
    } else if (isBrokenLink(full)) {
      fs.rmSync(full, { force: true });
    }
  }

  let added = 0;
  for (const s of expectedSkills) {
    if (!fs.existsSync(path.join(dir, s))) {
      if (linkSkill(s, dir)) {
        added += 1;
      }
    }
  }

  reconcilePlugins(proj, expectedPlugins, marker.managedPlugins ?? []);

  writeMarker(proj, {
    profiles: marker.profiles ?? [],
    extraSkills: marker.extraSkills ?? [],
    managedPlugins: expectedPlugins
  });

  ensureGitignore(proj);
  info(`✓ sync: +${added} skills, -${removed} skills, ${expectedPlugins.length} plugins gérés actifs`);
  info('  (effet à la prochaine session Claude Code)');
  return 0;
}
```

- [ ] **Step 4: Wire dispatcher — modify `src/cli.js`**

```js
import * as sync from './commands/sync.js';
```
```js
      case 'sync':
        return await sync.run(rest);
```

- [ ] **Step 5: Run tests + lint**

Run: `node --test && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add sync command"
```

---

## Task 15: `show`, `hint`, `reset` commands

**Files:**
- Create: `src/commands/show.js`, `src/commands/hint.js`, `src/commands/reset.js`
- Modify: `src/cli.js`
- Test: `test/commands-show-hint-reset.test.js`

**Interfaces:**
- Consumes: `projectDir`, `skillsDir`, `readEnabledPlugins`/`clearEnabledPlugins`, `readMarker`, `detect`, `verify` (reuse `verify.run` indirectly via re-computing), `info`.
- Produces: `show.run`, `hint.run`, `reset.run` — each `: number`.
- `hint` must be silent when in-sync, print the drift line when drifted, and print the detect suggestion when no marker. No network. Never throws (wrap in try/catch returning 0).

- [ ] **Step 1: Write `test/commands-show-hint-reset.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('reset removes marker, skill links, enabledPlugins', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  const sdir = path.join(proj, '.claude', 'skills');
  fs.mkdirSync(sdir, { recursive: true });
  fs.symlinkSync(home, path.join(sdir, 'lnk'), process.platform === 'win32' ? 'junction' : 'dir');
  fs.writeFileSync(path.join(proj, '.claude', 'settings.local.json'), JSON.stringify({ enabledPlugins: { x: true } }));
  fs.writeFileSync(path.join(proj, '.claude', 'ccprofile.json'), JSON.stringify({ profiles: [], v: 1 }));

  const cwd = process.cwd();
  process.chdir(proj);
  const reset = await import('../src/commands/reset.js');
  const code = await reset.run([]);
  process.chdir(cwd);

  assert.equal(code, 0);
  assert.equal(fs.existsSync(path.join(proj, '.claude', 'ccprofile.json')), false);
  assert.equal(fs.existsSync(path.join(sdir, 'lnk')), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(proj, '.claude', 'settings.local.json'), 'utf8')).enabledPlugins, undefined);
});

test('hint is silent and returns 0 when no marker and no signals', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  const cwd = process.cwd();
  process.chdir(proj);
  const out = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => { out.push(s); return true; };
  const hint = await import('../src/commands/hint.js');
  const code = await hint.run([]);
  process.stdout.write = orig;
  process.chdir(cwd);
  assert.equal(code, 0);
  assert.equal(out.join(''), '');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/commands-show-hint-reset.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/commands/show.js`**

```js
// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { skillsDir } from '../core/paths.js';
import { projectDir } from '../core/project.js';
import { readEnabledPlugins } from '../core/settings.js';
import { info } from '../util/log.js';

/** @param {string[]} _args */
export function run(_args) {
  const proj = projectDir();
  info(`Projet : ${proj}`);
  info('-- skills projet --');
  const dir = skillsDir(proj);
  let entries = [];
  try {
    entries = fs.readdirSync(dir).sort();
  } catch {
    entries = [];
  }
  if (entries.length === 0) {
    info('  (aucun)');
  } else {
    for (const e of entries) {
      info(`  ${path.basename(e)}`);
    }
  }
  info('-- plugins activés (settings.local.json) --');
  const plugins = readEnabledPlugins(proj);
  if (plugins.length === 0) {
    info('  (aucun)');
  } else {
    for (const p of plugins) {
      info(`  ${p}`);
    }
  }
  return 0;
}
```

- [ ] **Step 4: Write `src/commands/reset.js`**

```js
// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { skillsDir, markerPath } from '../core/paths.js';
import { projectDir } from '../core/project.js';
import { clearEnabledPlugins } from '../core/settings.js';
import { settingsPath } from '../core/paths.js';
import { info } from '../util/log.js';

/** @param {string[]} _args */
export function run(_args) {
  const proj = projectDir();
  const dir = skillsDir(proj);
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    entries = [];
  }
  let removedAny = false;
  for (const base of entries) {
    const full = path.join(dir, base);
    try {
      if (fs.lstatSync(full).isSymbolicLink()) {
        fs.rmSync(full, { force: true });
        removedAny = true;
      }
    } catch {
      /* ignore */
    }
  }
  if (removedAny) {
    info('✓ skills projet vidés');
  }
  if (fs.existsSync(settingsPath(proj))) {
    clearEnabledPlugins(proj);
    info('✓ enabledPlugins retiré de settings.local.json');
  }
  if (fs.existsSync(markerPath(proj))) {
    fs.rmSync(markerPath(proj), { force: true });
    info('✓ marqueur .claude/ccprofile.json supprimé');
  }
  return 0;
}
```

- [ ] **Step 5: Write `src/commands/hint.js`**

```js
// @ts-check
import { projectDir } from '../core/project.js';
import { readMarker } from '../core/marker.js';
import { resolveProfiles } from '../core/profiles.js';
import { detect } from '../core/detect.js';
import { skillsDir } from '../core/paths.js';
import { readEnabledPlugins } from '../core/settings.js';
import { isBrokenLink } from '../core/links.js';
import { info } from '../util/log.js';
import fs from 'node:fs';
import path from 'node:path';

const sortedUnique = (arr) => [...new Set(arr.filter(Boolean))].sort();
const diff = (a, b) => { const sb = new Set(b); return a.filter((x) => !sb.has(x)); };
const inter = (a, b) => { const sb = new Set(b); return a.filter((x) => sb.has(x)); };

/** @param {string[]} _args */
export function run(_args) {
  try {
    const proj = projectDir();
    const marker = readMarker(proj);
    if (marker) {
      const n = driftCount(proj, marker);
      if (n > 0) {
        const prof = (marker.profiles ?? []).join(',');
        info(`⚠ ccprofile: profil '${prof}' obsolète (${n} écart(s)) — lance: ccprofile sync`);
      }
    } else {
      const rec = detect(proj).recommended;
      if (rec.length > 0) {
        info(`ccprofile: aucun profil appliqué ; détecté → ${rec.join(' ')} (lance: ccprofile apply ${rec.join(' ')})`);
      }
    }
  } catch {
    /* hint must never fail a session */
  }
  return 0;
}

/**
 * @param {string} proj
 * @param {*} marker
 */
function driftCount(proj, marker) {
  const { plugins, skills } = resolveProfiles(marker.profiles ?? []);
  const expectedSkills = sortedUnique([...skills, ...(marker.extraSkills ?? [])]);
  const expectedPlugins = sortedUnique(plugins);
  const dir = skillsDir(proj);
  let actualSkills = [];
  try { actualSkills = sortedUnique(fs.readdirSync(dir)); } catch { actualSkills = []; }
  const actualPlugins = readEnabledPlugins(proj);
  const managed = sortedUnique(marker.managedPlugins ?? []);
  const missingSkills = diff(expectedSkills, actualSkills);
  const extraSkills = diff(actualSkills, expectedSkills);
  const missingPlugins = diff(expectedPlugins, actualPlugins);
  const stalePlugins = diff(inter(managed, actualPlugins), expectedPlugins);
  let broken = [];
  try { broken = actualSkills.filter((b) => isBrokenLink(path.join(dir, b))); } catch { broken = []; }
  return missingSkills.length + extraSkills.length + missingPlugins.length + stalePlugins.length + broken.length;
}
```

Note: the drift computation is duplicated between `verify.js` and `hint.js`. Acceptable for this task; **Plan 2 extracts it into `src/core/drift.js`** and both consume it (DRY). Do not extract now — keep tasks isolated.

- [ ] **Step 6: Wire dispatcher — modify `src/cli.js`**

```js
import * as show from './commands/show.js';
import * as hint from './commands/hint.js';
import * as reset from './commands/reset.js';
```
```js
      case 'show':
        return await show.run(rest);
      case 'hint':
        return await hint.run(rest);
      case 'reset':
        return await reset.run(rest);
```

- [ ] **Step 7: Run full test suite + lint**

Run: `node --test && pnpm lint`
Expected: PASS (all command tests).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add show, hint, reset commands"
```

---

## Task 16: ship the real profiles + end-to-end parity check vs Bash

**Files:**
- Create: `profiles/*.json` (copied from `~/.claude/profiles/`)
- Test: `test/parity.test.js`

**Interfaces:**
- Consumes: the full CLI via `run()`.
- Produces: bundled default profiles + a parity assertion that `detect --json` on a fixture matches the documented shape.

- [ ] **Step 1: Copy the user's real profiles into the package**

```bash
cd ~/Repositories/Personnel/ccprofile
mkdir -p profiles
cp ~/.claude/profiles/*.json profiles/
ls profiles
```

- [ ] **Step 2: Write `test/parity.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from '../src/cli.js';

test('apply→verify round-trips to in-sync (exit 0) with a bundled profile', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.mkdirSync(path.join(home, 'skills-store'), { recursive: true });
  // minimal profile referencing no skills/plugins so store linking is a no-op
  fs.writeFileSync(path.join(home, 'profiles', 'empty.json'), JSON.stringify({ plugins: [], skills: [] }));

  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  const cwd = process.cwd();
  process.chdir(proj);
  const applyCode = await run(['apply', 'empty']);
  const verifyCode = await run(['verify']);
  process.chdir(cwd);

  assert.equal(applyCode, 0);
  assert.equal(verifyCode, 0);
});
```

- [ ] **Step 3: Manual parity comparison against the Bash original (document results)**

Run, in a real project directory, both implementations and diff the output:

```bash
# Bash original
~/.claude/bin/ccprofile detect --json > /tmp/bash-detect.json
~/.claude/bin/ccprofile verify --json > /tmp/bash-verify.json 2>/dev/null || true
# Node port (from repo)
node ~/Repositories/Personnel/ccprofile/bin/ccprofile.js detect --json > /tmp/node-detect.json
node ~/Repositories/Personnel/ccprofile/bin/ccprofile.js verify --json > /tmp/node-verify.json 2>/dev/null || true
difft /tmp/bash-detect.json /tmp/node-detect.json
difft /tmp/bash-verify.json /tmp/node-verify.json
```

Expected: semantically identical JSON (key order may differ; values must match). Note any divergence and fix the Node side before continuing.

- [ ] **Step 4: Run full suite + lint**

Run: `node --test && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: bundle default profiles + parity round-trip test"
```

---

## Task 17: CI matrix (Windows/macOS/Linux), README, LICENSE, .npmignore

**Files:**
- Create: `.github/workflows/ci.yml`, `README.md`, `LICENSE`, `.npmignore`

**Interfaces:** none (project metadata + CI).

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:
jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: [18, 20, 22]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - run: corepack enable
      - run: pnpm install
      - run: pnpm lint
      - run: node --test
```

- [ ] **Step 2: Write `.npmignore`**

```
test/
docs/
.github/
eslint.config.js
```

- [ ] **Step 3: Write `LICENSE` (MIT, holder: Azurioh, year 2026) and `README.md`**

README must cover: what ccprofile does; install (GitHub now: `npm i -g Azurioh/ccprofile`; registry later: `npm i -g @azurioh/ccprofile`); `ccprofile init`; the command table; the profile JSON format (`extends`/`plugins`/`skills`/`description`); the SessionStart hook snippet (`ccprofile hint 2>/dev/null || true`); Windows note (junctions, no admin needed). Keep it in English.

- [ ] **Step 4: Run full suite + lint locally**

Run: `node --test && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "ci: add cross-platform test matrix; docs: README + LICENSE"
```

---

## Task 18: create the public GitHub repo + push (outward-facing — confirm before running)

**Files:** none (remote).

**Interfaces:** none.

> This task publishes to the user's public GitHub profile. Confirm with the user immediately before running, then execute.

- [ ] **Step 1: Confirm repo name/visibility with the user** (`ccprofile`, public, under `Azurioh`).

- [ ] **Step 2: Create + push**

```bash
cd ~/Repositories/Personnel/ccprofile
gh repo create ccprofile --public --source=. --remote=origin \
  --description "Per-project Claude Code plugins + skills profiles — cross-platform CLI" --push
```

- [ ] **Step 3: Verify**

```bash
gh repo view Azurioh/ccprofile --web
git remote -v
```

Expected: repo exists, `main` pushed, CI workflow running on the matrix.

- [ ] **Step 4: Confirm CI is green**

```bash
gh run watch
```

Expected: all matrix legs (incl. windows-latest) pass — this is the real cross-platform proof.

---

## Self-Review

**Spec coverage:** §1–4 context/goals/decisions → scaffold (T1) + Global Constraints. §5 architecture → T1–T15 module-by-module. §6 Windows mapping → paths(T2)/walk(T2)/json atomic(T2)/links junction(T6)/project git(T3). §7 parity (all ten commands + exit codes + marker schema) → T9–T15 + parity test T16. §9 distribution (GitHub-install, files, publishConfig) → T1 package.json + README T17. §10 migration → **deferred to Plan 2** (noted). §11 testing/CI → per-task tests + T17 matrix. New commands (init/upgrade/validate/diff/doctor/--dry-run) and sharing (export/import/share/pull) → **Plan 2** (out of scope here, by design). 

**Placeholder scan:** No "TBD/TODO/handle edge cases" — every code step carries full code. The one throwaway block in Task 4 is explicitly flagged for deletion with the correct final code following it.

**Type consistency:** Command modules all export `run(args): number | Promise<number>`. `resolveProfiles` returns `{plugins, skills}` consistently consumed by apply/verify/sync/inspect/hint. `linkSkill(skill, destDir)`, `isBrokenLink(p)`, `readMarker`→`{profiles,extraSkills,managedPlugins,...}|null`, `writeMarker(proj, {profiles,extraSkills,managedPlugins})`, `readEnabledPlugins(proj)`, `reconcilePlugins(proj, expected, managed)` — names match across all consuming tasks.

**Known intentional duplication:** drift computation in `verify.js` and `hint.js` — flagged in Task 15 for extraction in Plan 2.
