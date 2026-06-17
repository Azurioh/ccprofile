# ccprofile Plan 3 — Vendoring Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make applied profiles **portable**. Instead of symlinking skills from the local store and enabling plugins in the gitignored `settings.local.json`, `apply`/`sync` now **copy skills into `<project>/.claude/skills/` (committed)** and write **`enabledPlugins` + the needed `extraKnownMarketplaces` into the committed `<project>/.claude/settings.json`**. Result: clone the repo (or open it in a cloud container) → skills auto-load with zero setup, and plugins auto-enable from their registered marketplaces.

**Architecture:** Replace `core/links.js` (symlink/junction) with `core/vendor.js` (recursive copy). `core/settings.js` switches its target from `settings.local.json` to the committed `settings.json` and gains marketplace management (reading custom-marketplace sources from the user's global `~/.claude/settings.json`). `drift`/`verify`/`sync`/`apply`/`reset`/`show`/`doctor`/`gitignore`/`marker` update to copy + committed-settings semantics. The marker bumps to `v:2` with a `managedMarketplaces` field.

**Tech Stack:** Node.js ≥18, ESM, plain JS + `// @ts-check`, `node:test`, eslint (dev). Still zero runtime deps.

## Global Constraints

- **Node ≥18; zero runtime deps; ESM; `// @ts-check`; no build step.** French output text/glyphs preserved.
- **This refactor DELIBERATELY diverges from the original Bash** (which symlinked). Byte-parity with Bash is NOT a goal for the changed commands; the new copy/committed-settings behavior is.
- **Skills:** copied (not symlinked) into `<project>/.claude/skills/<skill>/` and intended to be committed. `core/vendor.js` removes any existing entry (symlink or dir) then `fs.cpSync(src, dst, {recursive:true})`.
- **Plugins:** `enabledPlugins` live in the **committed** `<project>/.claude/settings.json` (NOT `settings.local.json`). enabledPlugins keys are `plugin@marketplace`. `claude-plugins-official` is auto-registered (skip). For any other marketplace referenced, copy its source entry from the user's global `~/.claude/settings.json` `extraKnownMarketplaces` into the project's committed `settings.json`; warn if a source is not found.
- **gitignore:** STOP ignoring `.claude/skills/` (it must be committed) — remove that line if present. Keep ignoring `.claude/settings.local.json`. The committed `.claude/settings.json` is NOT ignored.
- **Marker schema v:2:** `{ profiles, extraSkills, managedPlugins, managedMarketplaces, appliedAt, v:2 }`. Reading a v:1 marker must still work (treat `managedMarketplaces` as `[]`).
- **Drift = presence** (skill dir present? plugin enabled?). Stale-content (store updated vs project copy) is NOT detected in v1; `sync` always re-copies expected skills to refresh them. The "broken symlink" concept is removed.
- **Atomic JSON writes; sorted unique** for marker fields and settings reconciliation (as in Plan 1).
- **Tests:** use a temp `CLAUDE_CONFIG_DIR` and temp dirs; capture command stdout via child process, never global `process.stdout.write` monkeypatch.

---

## File Structure

| File | Change |
|---|---|
| `src/core/paths.js` | Add `committedSettingsPath(proj)` (`.claude/settings.json`) and `globalSettingsPath()` (`claudeDir()/settings.json`). Keep `settingsPath` (local) for reference but it is no longer used by ccprofile. |
| `src/core/vendor.js` | NEW. `vendorSkill(skill, destDir)`, `isVendored(skill, destDir)`. Replaces `links.js`. |
| `src/core/settings.js` | Target `committedSettingsPath`. Add marketplace functions. |
| `src/core/marker.js` | v:2 + `managedMarketplaces`. |
| `src/core/drift.js` | Copy/presence semantics; plugins from committed settings; drop `broken`. |
| `src/core/gitignore.js` | Remove `.claude/skills/` ignore (migration); keep `settings.local.json`. |
| `src/commands/apply.js` | Vendor copy + committed plugins + marketplaces + marker v2. |
| `src/commands/sync.js` | Copy-refresh + reconcile plugins/marketplaces + marker v2. |
| `src/commands/reset.js` | Remove copied dirs + clear committed plugins/marketplaces. |
| `src/commands/show.js` | Read plugins from committed settings. |
| `src/commands/doctor.js` | Drop broken-link check; report vendored state. |
| `src/commands/verify.js`, `hint.js` | Consume updated `computeDrift` (no code change beyond what drift returns; verify drops the `broken` line). |
| `src/core/links.js` | DELETE (after no importers remain). |
| `README.md` | Document the vendoring model + portability. |

---

## Task 1: paths + settings.js → committed settings.json + marketplaces

**Files:** Modify `src/core/paths.js`, `src/core/settings.js`. Test: `test/settings.test.js` (extend), `test/settings-marketplaces.test.js`.

**Interfaces:**
- `paths.js` adds: `committedSettingsPath(proj)` → `<proj>/.claude/settings.json`; `globalSettingsPath()` → `<claudeDir>/settings.json`.
- `settings.js` (now targeting committed settings):
  - `readEnabledPlugins(proj)`, `mergePlugins(proj, names)`, `reconcilePlugins(proj, expected, managed)`, `clearEnabledPlugins(proj)` — all on `committedSettingsPath`.
  - `OFFICIAL_MARKETPLACE = 'claude-plugins-official'`.
  - `marketplaceOf(pluginKey)` → string after `@`, or `''`.
  - `requiredMarketplaces(pluginKeys)` → sorted unique non-official marketplace names.
  - `globalMarketplaceSources()` → object from global settings `extraKnownMarketplaces` (`{}` if absent).
  - `mergeMarketplaces(proj, names)` → `{ added: string[], missing: string[] }`; for each name found in global sources, add to project settings `extraKnownMarketplaces`; names not found → `missing`.
  - `reconcileMarketplaces(proj, expectedNames, managedNames)` → keep manual (non-managed) marketplaces + expected; drop managed-but-not-expected; (re)add expected from global sources. Returns `{ missing }`.
  - `clearMarketplaces(proj, managedNames)` → remove the listed marketplaces from project settings `extraKnownMarketplaces`.
  - `readMarketplaceNames(proj)` → keys of project settings `extraKnownMarketplaces`.

- [ ] **Step 1: Write `test/settings-marketplaces.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { requiredMarketplaces, mergeMarketplaces, readMarketplaceNames } from '../src/core/settings.js';

test('requiredMarketplaces drops official + dedups/sorts', () => {
  const r = requiredMarketplaces(['a@bencium', 'b@claude-plugins-official', 'c@accesslint', 'd@bencium']);
  assert.deepEqual(r, ['accesslint', 'bencium']);
});

test('mergeMarketplaces copies known sources from global, reports missing', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.writeFileSync(path.join(home, 'settings.json'), JSON.stringify({
    extraKnownMarketplaces: { bencium: { source: { source: 'github', repo: 'x/bencium' } } }
  }));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  fs.mkdirSync(path.join(proj, '.claude'), { recursive: true });
  const { added, missing } = mergeMarketplaces(proj, ['bencium', 'ghost']);
  assert.deepEqual(added, ['bencium']);
  assert.deepEqual(missing, ['ghost']);
  assert.deepEqual(readMarketplaceNames(proj), ['bencium']);
});
```

- [ ] **Step 2: Run → FAIL** (`node --test test/settings-marketplaces.test.js`).

- [ ] **Step 3: Edit `src/core/paths.js`** — add after `settingsPath`:

```js
/** @param {string} proj */
export function committedSettingsPath(proj) {
  return path.join(proj, '.claude', 'settings.json');
}
export function globalSettingsPath() {
  return path.join(claudeDir(), 'settings.json');
}
```

- [ ] **Step 4: Rewrite `src/core/settings.js`**

```js
// @ts-check
import { committedSettingsPath, globalSettingsPath } from './paths.js';
import { readJson, writeJsonAtomic } from './json.js';

export const OFFICIAL_MARKETPLACE = 'claude-plugins-official';

/** @param {string} proj */
function load(proj) {
  return readJson(committedSettingsPath(proj), {});
}

/** @param {string} proj */
export function readEnabledPlugins(proj) {
  const enabled = load(proj).enabledPlugins ?? {};
  return Object.keys(enabled).filter((k) => enabled[k] === true).sort();
}

/** @param {string} proj @param {string[]} names */
export function mergePlugins(proj, names) {
  const s = load(proj);
  s.enabledPlugins = s.enabledPlugins ?? {};
  for (const n of names) {
    s.enabledPlugins[n] = true;
  }
  writeJsonAtomic(committedSettingsPath(proj), s);
}

/** @param {string} proj @param {string[]} expected @param {string[]} managed */
export function reconcilePlugins(proj, expected, managed) {
  const s = load(proj);
  const current = s.enabledPlugins ?? {};
  const managedSet = new Set(managed);
  const expectedSet = new Set(expected);
  /** @type {Record<string, boolean>} */
  const next = {};
  for (const k of Object.keys(current)) {
    if (!managedSet.has(k) || expectedSet.has(k)) {
      next[k] = current[k];
    }
  }
  for (const p of expected) {
    next[p] = true;
  }
  s.enabledPlugins = next;
  writeJsonAtomic(committedSettingsPath(proj), s);
}

/** @param {string} proj */
export function clearEnabledPlugins(proj) {
  const s = load(proj);
  delete s.enabledPlugins;
  writeJsonAtomic(committedSettingsPath(proj), s);
}

/** @param {string} pluginKey */
export function marketplaceOf(pluginKey) {
  const at = pluginKey.lastIndexOf('@');
  return at >= 0 ? pluginKey.slice(at + 1) : '';
}

/** @param {string[]} pluginKeys */
export function requiredMarketplaces(pluginKeys) {
  const names = pluginKeys
    .map(marketplaceOf)
    .filter((m) => m && m !== OFFICIAL_MARKETPLACE);
  return [...new Set(names)].sort();
}

export function globalMarketplaceSources() {
  return readJson(globalSettingsPath(), {}).extraKnownMarketplaces ?? {};
}

/** @param {string} proj */
export function readMarketplaceNames(proj) {
  return Object.keys(load(proj).extraKnownMarketplaces ?? {}).sort();
}

/**
 * @param {string} proj @param {string[]} names
 * @returns {{ added: string[], missing: string[] }}
 */
export function mergeMarketplaces(proj, names) {
  const sources = globalMarketplaceSources();
  const s = load(proj);
  s.extraKnownMarketplaces = s.extraKnownMarketplaces ?? {};
  const added = [];
  const missing = [];
  for (const name of names) {
    if (sources[name]) {
      s.extraKnownMarketplaces[name] = sources[name];
      added.push(name);
    } else {
      missing.push(name);
    }
  }
  writeJsonAtomic(committedSettingsPath(proj), s);
  return { added: added.sort(), missing: missing.sort() };
}

/**
 * @param {string} proj @param {string[]} expected @param {string[]} managed
 * @returns {{ missing: string[] }}
 */
export function reconcileMarketplaces(proj, expected, managed) {
  const sources = globalMarketplaceSources();
  const s = load(proj);
  const current = s.extraKnownMarketplaces ?? {};
  const managedSet = new Set(managed);
  const expectedSet = new Set(expected);
  /** @type {Record<string, *>} */
  const next = {};
  for (const k of Object.keys(current)) {
    if (!managedSet.has(k) || expectedSet.has(k)) {
      next[k] = current[k];
    }
  }
  const missing = [];
  for (const name of expected) {
    if (sources[name]) {
      next[name] = sources[name];
    } else if (!next[name]) {
      missing.push(name);
    }
  }
  s.extraKnownMarketplaces = next;
  writeJsonAtomic(committedSettingsPath(proj), s);
  return { missing: missing.sort() };
}

/** @param {string} proj @param {string[]} managed */
export function clearMarketplaces(proj, managed) {
  const s = load(proj);
  const current = s.extraKnownMarketplaces ?? {};
  for (const name of managed) {
    delete current[name];
  }
  if (Object.keys(current).length === 0) {
    delete s.extraKnownMarketplaces;
  } else {
    s.extraKnownMarketplaces = current;
  }
  writeJsonAtomic(committedSettingsPath(proj), s);
}
```

- [ ] **Step 5: Update `test/settings.test.js`** — the existing tests wrote/read `settings.local.json`; they now target `settings.json`. Change any literal `'settings.local.json'` in that test file to `'settings.json'` (the helpers should create `.claude/` then call the settings functions; assertions reading the file must read `.claude/settings.json`). Keep the existing plugin merge/reconcile assertions intact.

- [ ] **Step 6: Run `node --test && pnpm lint`** → PASS.

- [ ] **Step 7: Commit** — `git commit -am "refactor: settings.js targets committed settings.json + marketplace management"`.

---

## Task 2: `core/vendor.js` (copy replaces symlink)

**Files:** Create `src/core/vendor.js`, `test/vendor.test.js`.

**Interfaces:**
- `vendorSkill(skill, destDir): boolean` — `false` + `⚠ skill absent du store: <skill>` warning if the skill is absent from the store; else remove any existing entry at `destDir/skill` (symlink OR dir) then `fs.cpSync(store/skill, destDir/skill, {recursive:true})`, return `true`.
- `isVendored(skill, destDir): boolean` — `destDir/skill` exists and is a directory.

- [ ] **Step 1: Write `test/vendor.test.js`**

```js
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
```

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Write `src/core/vendor.js`**

```js
// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { storeDir } from './paths.js';
import { warn } from '../util/log.js';

/**
 * @param {string} skill
 * @param {string} destDir
 * @returns {boolean}
 */
export function vendorSkill(skill, destDir) {
  const src = path.join(storeDir(), skill);
  if (!fs.existsSync(src)) {
    warn(`  ⚠ skill absent du store: ${skill}`);
    return false;
  }
  const dest = path.join(destDir, skill);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  return true;
}

/**
 * @param {string} skill
 * @param {string} destDir
 * @returns {boolean}
 */
export function isVendored(skill, destDir) {
  try {
    return fs.statSync(path.join(destDir, skill)).isDirectory();
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run `node --test && pnpm lint`** → PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat: add core/vendor.js (copy skills into project, replaces symlink)"`.

---

## Task 3: marker v:2 + drift.js (copy semantics) + verify/hint

**Files:** Modify `src/core/marker.js`, `src/core/drift.js`, `src/commands/verify.js`, `src/commands/hint.js`. Tests: extend `test/marker.test.js`, `test/command-verify.test.js`.

**Interfaces:**
- `marker.js`: `writeMarker(proj, { profiles, extraSkills, managedPlugins, managedMarketplaces })` stamps `appliedAt` + `v:2`. `readMarker` unchanged (returns object|null; callers default `managedMarketplaces ?? []`).
- `drift.js`: `computeDrift(proj, marker)` → `{ missingSkills, extraSkills, missingPlugins, stalePlugins, count }` (NO `broken`). Skills compared by directory presence in `.claude/skills`. Plugins from committed settings (`readEnabledPlugins`).
- `verify.js`: drop the `broken` line from output and the `broken` key from `--json`.

- [ ] **Step 1: Update `test/marker.test.js`** — add `managedMarketplaces: ['m']` to the write, assert `m.v === 2` and `m.managedMarketplaces` round-trips. Update the existing v:1 assertion to v:2.

- [ ] **Step 2: Edit `src/core/marker.js`**

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
 * @param {{ profiles: string[], extraSkills: string[], managedPlugins: string[], managedMarketplaces: string[] }} data
 */
export function writeMarker(proj, { profiles, extraSkills, managedPlugins, managedMarketplaces }) {
  writeJsonAtomic(markerPath(proj), {
    profiles,
    extraSkills,
    managedPlugins,
    managedMarketplaces,
    appliedAt: new Date().toISOString(),
    v: 2
  });
}
```

- [ ] **Step 3: Edit `src/core/drift.js`**

```js
// @ts-check
import fs from 'node:fs';
import { skillsDir } from './paths.js';
import { readEnabledPlugins } from './settings.js';
import { resolveProfiles } from './profiles.js';

const sortedUnique = (arr) => [...new Set(arr.filter(Boolean))].sort();
const diff = (a, b) => { const sb = new Set(b); return a.filter((x) => !sb.has(x)); };
const inter = (a, b) => { const sb = new Set(b); return a.filter((x) => sb.has(x)); };

/**
 * @param {string} proj
 * @param {{ profiles?: string[], extraSkills?: string[], managedPlugins?: string[] }} marker
 * @returns {{ missingSkills: string[], extraSkills: string[], missingPlugins: string[], stalePlugins: string[], count: number }}
 */
export function computeDrift(proj, marker) {
  const { plugins, skills } = resolveProfiles(marker.profiles ?? []);
  const expectedSkills = sortedUnique([...skills, ...(marker.extraSkills ?? [])]);
  const expectedPlugins = sortedUnique(plugins);

  const dir = skillsDir(proj);
  let actualSkills = [];
  try {
    actualSkills = sortedUnique(
      fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    );
  } catch {
    actualSkills = [];
  }
  const actualPlugins = readEnabledPlugins(proj);
  const managed = sortedUnique(marker.managedPlugins ?? []);

  const missingSkills = diff(expectedSkills, actualSkills);
  const extraSkills = diff(actualSkills, expectedSkills);
  const missingPlugins = diff(expectedPlugins, actualPlugins);
  const stalePlugins = diff(inter(managed, actualPlugins), expectedPlugins);

  const count = missingSkills.length + extraSkills.length + missingPlugins.length + stalePlugins.length;
  return { missingSkills, extraSkills, missingPlugins, stalePlugins, count };
}
```

- [ ] **Step 4: Edit `src/commands/verify.js`** — remove the `broken` line and the `broken` key:
  - In `--json`, emit `{ status, missingSkills, extraSkills, missingPlugins, stalePlugins }` (drop `broken`).
  - In plain mode, drop the `printList('symlinks cassés ...', d.broken)` line. Keep the other four `printList` calls and the `→ lance: ccprofile sync` line.
  (`hint.js` already consumes only `count` — no change needed there.)

- [ ] **Step 5: Update `test/command-verify.test.js`** — the in-sync test now needs the project skills dir to actually contain the expected skill directories (presence-based). For the empty-profile case it still returns 0. Add/adjust a drift test: apply-like setup where an expected skill dir is absent → verify returns 1 with `missingSkills`.

- [ ] **Step 6: Run `node --test && pnpm lint`** → PASS.

- [ ] **Step 7: Commit** — `git commit -am "refactor: marker v2 + copy-presence drift (drop broken-symlink concept)"`.

---

## Task 4: gitignore migration (commit skills)

**Files:** Modify `src/core/gitignore.js`. Test: update `test/gitignore.test.js`.

**Interfaces:** `ensureGitignore(proj)` — ensure `.claude/settings.local.json` is ignored; ensure `.claude/skills/` is NOT ignored (remove that exact line if present). Idempotent.

- [ ] **Step 1: Update `test/gitignore.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureGitignore } from '../src/core/gitignore.js';

test('ensureGitignore ignores settings.local.json but NOT skills/, and removes a stale skills/ ignore', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  fs.writeFileSync(path.join(root, '.gitignore'), '.claude/skills/\n.claude/settings.local.json\n');
  ensureGitignore(root);
  const lines = fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split('\n');
  assert.equal(lines.includes('.claude/skills/'), false);
  assert.equal(lines.filter((l) => l === '.claude/settings.local.json').length, 1);
});

test('ensureGitignore adds settings.local.json when missing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  ensureGitignore(root);
  assert.ok(fs.readFileSync(path.join(root, '.gitignore'), 'utf8').includes('.claude/settings.local.json'));
});
```

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Edit `src/core/gitignore.js`**

```js
// @ts-check
import fs from 'node:fs';
import path from 'node:path';

const KEEP = '.claude/settings.local.json';
const REMOVE = '.claude/skills/';

/** @param {string} proj */
export function ensureGitignore(proj) {
  const gi = path.join(proj, '.gitignore');
  let existing = '';
  try {
    existing = fs.readFileSync(gi, 'utf8');
  } catch {
    existing = '';
  }
  const lines = existing.split('\n');
  // Drop any stale `.claude/skills/` ignore so vendored skills are committed.
  const filtered = lines.filter((l) => l.trim() !== REMOVE);
  const present = new Set(filtered.map((l) => l.trim()));
  if (!present.has(KEEP)) {
    if (filtered.length > 0 && filtered[filtered.length - 1] !== '') {
      filtered.push('');
    }
    filtered.push(KEEP);
  }
  let out = filtered.join('\n');
  if (out !== '' && !out.endsWith('\n')) {
    out += '\n';
  }
  if (out !== existing) {
    fs.writeFileSync(gi, out);
  }
}
```

- [ ] **Step 4: Run `node --test && pnpm lint`** → PASS.

- [ ] **Step 5: Commit** — `git commit -am "refactor: gitignore commits skills/, keeps settings.local.json ignored"`.

---

## Task 5: `apply` → vendor copy + committed plugins + marketplaces

**Files:** Modify `src/commands/apply.js`. Test: update `test/command-apply.test.js`.

**Interfaces:** `apply.run(args)`:
- `--dry-run` preserved (now reports "skills à copier", "plugins à activer", "marketplaces à ajouter").
- Real path: `vendorSkill` each resolved skill (count); `mergePlugins(proj, plugins)` (committed settings); `requiredMarketplaces(plugins)` → `mergeMarketplaces(proj, names)` (warn `missing`); marker v:2 with `managedPlugins = union(prev, plugins).sort()`, `managedMarketplaces = union(prev.managedMarketplaces, added).sort()`, `profiles = unique(args).sort()`, `extraSkills` preserved; `ensureGitignore`.
- Summary: `✓ <n> skills copiés, <p> plugins activés (.claude/settings.json), <m> marketplace(s) ajouté(s)`; then `  skills + plugins commités avec le repo → portables (autre machine / conteneur cloud)`; then `  (effet à la prochaine session Claude Code)`.

- [ ] **Step 1: Update `test/command-apply.test.js`** — assert the skill is COPIED (real dir with content, not a symlink), `enabledPlugins` is in `.claude/settings.json` (not `.local`), and the marker has `v:2` + `managedMarketplaces`. Provide a global `~/.claude/settings.json` with an `extraKnownMarketplaces` entry for any non-official plugin used, or use an official-marketplace plugin to keep `managedMarketplaces` empty.

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readMarker } from '../src/core/marker.js';
import { readEnabledPlugins } from '../src/core/settings.js';

test('apply copies skills (real dir) + writes committed settings + v2 marker', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-'));
  process.env.CLAUDE_CONFIG_DIR = home;
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.mkdirSync(path.join(home, 'skills-store', 'skill-a'), { recursive: true });
  fs.writeFileSync(path.join(home, 'skills-store', 'skill-a', 'SKILL.md'), '# a');
  fs.writeFileSync(path.join(home, 'profiles', 'web.json'),
    JSON.stringify({ plugins: ['plug-x@claude-plugins-official'], skills: ['skill-a'] }));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
  const cwd = process.cwd();
  process.chdir(proj);
  const apply = await import('../src/commands/apply.js');
  const code = await apply.run(['web']);
  process.chdir(cwd);

  assert.equal(code, 0);
  const copied = path.join(proj, '.claude', 'skills', 'skill-a');
  assert.equal(fs.lstatSync(copied).isSymbolicLink(), false);
  assert.equal(fs.readFileSync(path.join(copied, 'SKILL.md'), 'utf8'), '# a');
  assert.equal(fs.existsSync(path.join(proj, '.claude', 'settings.json')), true);
  assert.deepEqual(readEnabledPlugins(proj), ['plug-x@claude-plugins-official']);
  const m = readMarker(proj);
  assert.equal(m.v, 2);
  assert.deepEqual(m.profiles, ['web']);
  assert.deepEqual(m.managedMarketplaces, []); // official marketplace → none added
});
```

- [ ] **Step 2: Run → FAIL** (apply still symlinks / writes settings.local.json).

- [ ] **Step 3: Rewrite `src/commands/apply.js`**

```js
// @ts-check
import fs from 'node:fs';
import { skillsDir } from '../core/paths.js';
import { projectDir } from '../core/project.js';
import { resolveProfiles } from '../core/profiles.js';
import { vendorSkill } from '../core/vendor.js';
import { mergePlugins, requiredMarketplaces, mergeMarketplaces } from '../core/settings.js';
import { readMarker, writeMarker } from '../core/marker.js';
import { ensureGitignore } from '../core/gitignore.js';
import { info, warn, die } from '../util/log.js';

/** @param {string[]} args */
export function run(args) {
  const dryRun = args.includes('--dry-run');
  const profileArgs = args.filter((a) => a !== '--dry-run');
  if (profileArgs.length < 1) {
    die('usage: ccprofile apply <profil> [profil...] [--dry-run]');
  }
  const proj = projectDir();
  const { plugins, skills } = resolveProfiles(profileArgs);
  const marketplaces = requiredMarketplaces(plugins);

  if (dryRun) {
    info(`Projet : ${proj}`);
    info(`Profils: ${profileArgs.join(' ')}  (dry-run — aucune écriture)`);
    info(`  skills à copier      : ${skills.length ? skills.join(', ') : '(aucun)'}`);
    info(`  plugins à activer    : ${plugins.length ? plugins.join(', ') : '(aucun)'}`);
    info(`  marketplaces à ajouter : ${marketplaces.length ? marketplaces.join(', ') : '(aucune)'}`);
    return 0;
  }

  const dest = skillsDir(proj);
  fs.mkdirSync(dest, { recursive: true });

  let ns = 0;
  for (const s of skills) {
    if (vendorSkill(s, dest)) {
      ns += 1;
    }
  }
  if (plugins.length > 0) {
    mergePlugins(proj, plugins);
  }
  let added = [];
  if (marketplaces.length > 0) {
    const res = mergeMarketplaces(proj, marketplaces);
    added = res.added;
    if (res.missing.length > 0) {
      warn(`  ⚠ marketplaces introuvables dans ~/.claude/settings.json: ${res.missing.join(', ')}`);
    }
  }

  const prev = readMarker(proj);
  const profiles = [...new Set(profileArgs)].sort();
  const managed = [...new Set([...(prev?.managedPlugins ?? []), ...plugins])].sort();
  const managedMkts = [...new Set([...(prev?.managedMarketplaces ?? []), ...added])].sort();
  writeMarker(proj, {
    profiles,
    extraSkills: prev?.extraSkills ?? [],
    managedPlugins: managed,
    managedMarketplaces: managedMkts
  });

  ensureGitignore(proj);
  info(`✓ ${ns} skills copiés, ${plugins.length} plugins activés (.claude/settings.json), ${added.length} marketplace(s) ajouté(s)`);
  info('  skills + plugins commités avec le repo → portables (autre machine / conteneur cloud)');
  info('  (effet à la prochaine session Claude Code)');
  return 0;
}
```

- [ ] **Step 4: Run `node --test && pnpm lint`** → PASS.

- [ ] **Step 5: Commit** — `git commit -am "refactor: apply copies skills + writes committed settings + marketplaces (v2 marker)"`.

---

## Task 6: `sync` → copy-refresh + reconcile plugins/marketplaces

**Files:** Modify `src/commands/sync.js`. Test: update `test/command-sync.test.js`.

**Interfaces:** `sync.run(args)`:
- `--dry-run` preserved (reports skills to copy/remove, plugins, marketplaces).
- Real path: expectedSkills = set(resolved.skills + extraSkills); expectedPlugins = sorted unique resolved.plugins; expectedMkts = requiredMarketplaces(expectedPlugins). Remove `.claude/skills` entries not expected (count); `vendorSkill` every expected (refresh-copy, count those that were missing as `added`); `reconcilePlugins(proj, expectedPlugins, marker.managedPlugins ?? [])`; `reconcileMarketplaces(proj, expectedMkts, marker.managedMarketplaces ?? [])` (warn `missing`); rewrite marker v:2 with `managedPlugins = expectedPlugins`, `managedMarketplaces = expectedMkts`, profiles + extraSkills preserved; `ensureGitignore`.
- Summary: `✓ sync: +<added> skills, -<removed> skills, <p> plugins gérés, <m> marketplace(s)`.

- [ ] **Step 1: Update `test/command-sync.test.js`** — set up a real store skill, a v:2 marker, a stale skill dir; assert after sync the off-profile dir is gone, the expected skill is a real copied dir, and the marker `managedMarketplaces` is the expected set.

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Rewrite `src/commands/sync.js`**

```js
// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { skillsDir } from '../core/paths.js';
import { projectDir } from '../core/project.js';
import { readMarker, writeMarker } from '../core/marker.js';
import { resolveProfiles } from '../core/profiles.js';
import { vendorSkill } from '../core/vendor.js';
import { reconcilePlugins, reconcileMarketplaces, requiredMarketplaces } from '../core/settings.js';
import { ensureGitignore } from '../core/gitignore.js';
import { info, warn, die } from '../util/log.js';

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
  const expectedMkts = requiredMarketplaces(expectedPlugins);
  const dir = skillsDir(proj);

  let current = [];
  try {
    current = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() || e.isSymbolicLink()).map((e) => e.name);
  } catch {
    current = [];
  }

  if (dryRun) {
    const toRemove = current.filter((b) => !expectedSkills.has(b)).sort();
    const toCopy = [...expectedSkills].sort();
    info('sync (dry-run — aucune écriture)');
    info(`  skills à retirer : ${toRemove.length ? toRemove.join(', ') : '(aucun)'}`);
    info(`  skills à copier  : ${toCopy.length ? toCopy.join(', ') : '(aucun)'}`);
    info(`  plugins gérés    : ${expectedPlugins.length ? expectedPlugins.join(', ') : '(aucun)'}`);
    info(`  marketplaces     : ${expectedMkts.length ? expectedMkts.join(', ') : '(aucune)'}`);
    return 0;
  }

  fs.mkdirSync(dir, { recursive: true });
  let removed = 0;
  for (const base of current) {
    if (!expectedSkills.has(base)) {
      fs.rmSync(path.join(dir, base), { recursive: true, force: true });
      removed += 1;
    }
  }
  let added = 0;
  for (const s of expectedSkills) {
    const existed = current.includes(s);
    if (vendorSkill(s, dir) && !existed) {
      added += 1;
    }
  }

  reconcilePlugins(proj, expectedPlugins, marker.managedPlugins ?? []);
  const res = reconcileMarketplaces(proj, expectedMkts, marker.managedMarketplaces ?? []);
  if (res.missing.length > 0) {
    warn(`  ⚠ marketplaces introuvables: ${res.missing.join(', ')}`);
  }

  writeMarker(proj, {
    profiles: marker.profiles ?? [],
    extraSkills: marker.extraSkills ?? [],
    managedPlugins: expectedPlugins,
    managedMarketplaces: expectedMkts
  });

  ensureGitignore(proj);
  info(`✓ sync: +${added} skills, -${removed} skills, ${expectedPlugins.length} plugins gérés, ${expectedMkts.length} marketplace(s)`);
  info('  (effet à la prochaine session Claude Code)');
  return 0;
}
```

- [ ] **Step 4: Run `node --test && pnpm lint`** → PASS.

- [ ] **Step 5: Commit** — `git commit -am "refactor: sync copy-refreshes skills + reconciles committed plugins/marketplaces"`.

---

## Task 7: `reset` + `show` + `doctor` (copy semantics)

**Files:** Modify `src/commands/reset.js`, `src/commands/show.js`, `src/commands/doctor.js`. Tests: update `test/commands-show-hint-reset.test.js`, `test/command-doctor.test.js`.

**Interfaces:**
- `reset.run`: remove every entry under `.claude/skills` (copied dirs AND any leftover symlinks) via `fs.rmSync(recursive,force)`; read marker for `managedPlugins`/`managedMarketplaces`; on committed settings call `clearEnabledPlugins` (or reconcile to remove only managed — keep simple: `clearEnabledPlugins` removes the whole key as today) and `clearMarketplaces(proj, managedMkts)`; delete marker. Keep the three `✓` lines (skills vidés / enabledPlugins retiré de settings.json / marqueur supprimé), conditioned on something having existed.
- `show.run`: list skill dirs under `.claude/skills`; list enabled plugins from committed `settings.json` (header text updated to `-- plugins activés (settings.json) --`).
- `doctor.run`: keep the profiles→store section and the env section; REPLACE the broken-symlink section with a vendored-skills section: count skill directories in the project's `.claude/skills` and flag any that are NOT directories (stray files); never reports "broken symlink".

- [ ] **Step 1: Update tests** — `reset` test: create a copied skill DIR + a `.claude/settings.json` with `enabledPlugins`; assert after reset the dir is gone, marker gone, `enabledPlugins` cleared from `settings.json`. `doctor` test: unchanged behavior for the missing-store-skill path (still exit 0). `show` test (if any) reads from settings.json.

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Edit `src/commands/reset.js`**

```js
// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { skillsDir, markerPath, committedSettingsPath } from '../core/paths.js';
import { projectDir } from '../core/project.js';
import { readMarker } from '../core/marker.js';
import { clearEnabledPlugins, clearMarketplaces } from '../core/settings.js';
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
    fs.rmSync(path.join(dir, base), { recursive: true, force: true });
    removedAny = true;
  }
  if (removedAny) {
    info('✓ skills projet vidés');
  }
  if (fs.existsSync(committedSettingsPath(proj))) {
    const marker = readMarker(proj);
    clearEnabledPlugins(proj);
    clearMarketplaces(proj, marker?.managedMarketplaces ?? []);
    info('✓ enabledPlugins retiré de settings.json');
  }
  if (fs.existsSync(markerPath(proj))) {
    fs.rmSync(markerPath(proj), { force: true });
    info('✓ marqueur .claude/ccprofile.json supprimé');
  }
  return 0;
}
```

- [ ] **Step 4: Edit `src/commands/show.js`** — change the settings header to `-- plugins activés (settings.json) --`; it already calls `readEnabledPlugins(proj)` which now reads the committed file. List skill directory names from `.claude/skills` (filter to directories).

- [ ] **Step 5: Edit `src/commands/doctor.js`** — replace the "liens projet courant" / broken-symlink block with:

```js
  info('-- skills vendorés (projet courant) --');
  const proj = projectDir();
  const sdir = skillsDir(proj);
  let vendored = [];
  let strays = [];
  try {
    for (const e of fs.readdirSync(sdir, { withFileTypes: true })) {
      if (e.isDirectory()) { vendored.push(e.name); } else { strays.push(e.name); }
    }
  } catch {
    vendored = [];
  }
  info(`  ✓ ${vendored.length} skill(s) copié(s)`);
  if (strays.length > 0) {
    problems += strays.length;
    info(`  ⚠ entrées non-dossier dans .claude/skills: ${strays.sort().join(', ')}`);
  }
```
(Keep the `isBrokenLink` import removed; doctor no longer references it.)

- [ ] **Step 6: Run `node --test && pnpm lint`** → PASS.

- [ ] **Step 7: Commit** — `git commit -am "refactor: reset/show/doctor for copy + committed settings semantics"`.

---

## Task 8: delete `links.js` + README + integration smoke

**Files:** Delete `src/core/links.js` and `test/links.test.js`. Modify `README.md`. 

- [ ] **Step 1: Confirm no importers of `links.js` remain**

Run: `grep -rn "core/links" src test` → expected: no matches (all moved to `vendor.js`). If any remain, repoint them to `vendor.js`/`isVendored` before deleting.

- [ ] **Step 2: Delete the dead module + its test**

```bash
git rm src/core/links.js test/links.test.js
```

- [ ] **Step 3: Update `README.md`** — replace the symlink/junction description with the vendoring model: `apply`/`sync` COPY skills into `.claude/skills/` (committed) and write `enabledPlugins` + `extraKnownMarketplaces` into the committed `.claude/settings.json`; commit `.claude/skills/` + `.claude/settings.json` so the repo is portable (another user / cloud container gets skills auto-loaded and plugins auto-enabled from their marketplaces). Remove the "Windows / junctions" note (no longer relevant — plain copy). Note `.claude/settings.local.json` stays gitignored. Keep README in English.

- [ ] **Step 4: Full suite + lint**

Run: `node --test && pnpm lint` → PASS, lint clean, and confirm `grep -rn "isBrokenLink\|linkSkill\|junction" src` returns nothing.

- [ ] **Step 5: Manual integration smoke (document results)**

In a temp `CLAUDE_CONFIG_DIR` home with a profile + a store skill + a global `extraKnownMarketplaces`, and a temp git project:
```bash
ccprofile apply <profile>
# assert: .claude/skills/<skill>/ is a real dir (not a symlink), committed-ready;
#         .claude/settings.json has enabledPlugins (+ extraKnownMarketplaces for custom);
#         .gitignore does NOT contain .claude/skills/ ; marker v:2.
ccprofile verify    # exit 0
# delete a skill dir → verify exit 1 (missingSkills) → sync → verify exit 0
ccprofile reset     # skills dir emptied, settings cleared, marker gone
```
Record the actual output.

- [ ] **Step 6: Commit** — `git commit -am "refactor: remove links.js; document vendoring model in README"`.

---

## Self-Review

**Spec coverage:** committed-settings + marketplaces (T1); copy module (T2); marker v2 + copy-drift (T3); gitignore migration (T4); apply (T5); sync (T6); reset/show/doctor (T7); cleanup + docs + integration (T8). Covers the full decision set: copy replaces symlink everywhere; plugins enablement-portable via committed `settings.json` + `extraKnownMarketplaces`.

**Placeholder scan:** complete code per step; the only described-not-pasted edits are localized line changes in `verify.js`/`show.js`/`doctor.js` with the exact old/new behavior named.

**Type consistency:** `vendorSkill(skill, destDir): boolean`, `isVendored(...)`, `computeDrift → {missingSkills,extraSkills,missingPlugins,stalePlugins,count}` (no `broken`), marker `{...,managedMarketplaces, v:2}`, settings functions on `committedSettingsPath`, `requiredMarketplaces`/`mergeMarketplaces`/`reconcileMarketplaces`/`clearMarketplaces` — names consistent across apply/sync/reset.

**Migration:** existing v:1 markers read fine (`managedMarketplaces ?? []`); existing symlinked projects: `sync` removes/replaces symlinks with copies, and `ensureGitignore` removes the stale `.claude/skills/` ignore so the copies get committed.

**Divergence from Bash:** intentional and documented (copy vs symlink, committed settings.json vs settings.local.json).
