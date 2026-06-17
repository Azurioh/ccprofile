# ccprofile — Cross-platform rewrite + npm distribution + profile sharing

**Date:** 2026-06-17
**Status:** Approved design, pending spec review
**Author:** Azurioh

## 1. Context

`ccprofile` is currently a 677-line Bash 3.2 script at `~/.claude/bin/ccprofile`. It activates Claude Code plugins and skills per project, keeping the global config core-minimal. Each project opts into one or more *profiles* (JSON files in `~/.claude/profiles/`). Skills are symlinked from a local master store (`~/.claude/skills-store`, 138 entries) into the project's `.claude/skills/`; plugins are enabled in the project's `.claude/settings.local.json`. A project marker (`.claude/ccprofile.json`) records applied profiles, à-la-carte skills, and managed plugins. A `SessionStart` hook calls `ccprofile hint` to surface drift or a detected profile.

The script only runs on Unix-like systems. It depends on `jq`, `git`, and the GNU/BSD userland (`awk`, `comm`, `sort`, `sed`, `find`, `date`, `mktemp`, `ln -s`). On Windows none of these are available natively, and directory symlinks require Administrator or Developer Mode.

## 2. Goals

1. **Cross-platform parity.** One implementation that runs natively on Windows, Linux, and macOS with identical behavior.
2. **Easy install.** `npm i -g` from GitHub immediately; from the npm registry (`@azurioh/ccprofile`) once published.
3. **Easy update.** `npm update -g` / `ccprofile upgrade`.
4. **Public showcase.** Lives as a public repo on the `Azurioh` GitHub profile.
5. **Profile sharing.** Share a profile (or a whole collection) and import shared profiles from another machine/person.
6. **Behavioral parity (HARD).** Existing subcommands, flags, exit codes, marker schema, output text, and detection signals are preserved so the existing `SessionStart` hook and the user's CLAUDE.md workflow keep working unchanged.

## 3. Non-goals

- No backend, database, or hosted service. Sharing rides on GitHub Gists.
- No community/curated profile registry (deferred to a possible v2).
- No interactive profile builder, no skill-mutation subcommands, no shell completions in v1 (deferred).
- No telemetry, no network calls inside the `hint` hook (hooks stay fast and offline).
- The `skills-store` (personal, 2.6 MB) is **not** shipped or published. Profiles are.

## 4. Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Language | Plain modern ESM JavaScript, no build step | `npm i -g` from GitHub **and** registry works with zero compile; `// @ts-check` + JSDoc give type safety without a `dist/`. |
| Runtime deps | Zero | Everything the Bash script shelled out to becomes Node stdlib. No supply chain. |
| Dev deps | eslint only | Clean builds per project standards. |
| Package name | `@azurioh/ccprofile` (scoped, public) | Free on npm; matches GitHub handle. |
| Distribution | GitHub-installable now; registry-ready | Usable the day the repo exists; `npm login`/publish later. |
| Project path | `~/Repositories/Personnel/ccprofile` | Personal repos directory. |
| Node engine | `>=18` | `fs`/`os`/`node:test` features used are stable since 18. |

## 5. Architecture

Feature-organized: each subcommand is a self-contained module under `src/commands/`; shared logic lives in `src/core/`. No command imports another command.

```
ccprofile/
  package.json            # bin:{ccprofile}, type:module, engines.node>=18, files:[bin,src,profiles], publishConfig.access:public
  bin/ccprofile.js        # #!/usr/bin/env node — thin entry, calls src/cli.js
  src/
    cli.js                # arg parse + dispatch + usage
    commands/
      list.js detect.js apply.js skill.js verify.js sync.js inspect.js show.js hint.js reset.js
      init.js upgrade.js
      export.js import.js share.js pull.js validate.js diff.js doctor.js
    core/
      paths.js            # CLAUDE_DIR (CLAUDE_CONFIG_DIR override), STORE, PROFILES_DIR, os.homedir()
      project.js          # project root: git toplevel via spawnSync, fallback cwd
      profiles.js         # resolve(extends recursion + anti-cycle) -> {plugins, skills}
      marker.js           # read/write .claude/ccprofile.json (schema v:1)
      links.js            # link/unlink skill: fs.symlinkSync(target, path, win32?'junction':'dir'); broken-link detection via lstat
      settings.js         # merge / reconcile enabledPlugins in settings.local.json
      detect.js           # signal collection (deps + file globs + python libs)
      gitignore.js        # ensure .claude/skills/ and .claude/settings.local.json ignored
      json.js             # readJson / writeJson (atomic: tmp + renameSync)
      schema.js           # profile shape validation (used by validate + import/pull)
      gist.js             # share/pull transport via `gh` (preferred) or GitHub REST fallback
    util/
      log.js              # info / warn / die (preserve French messages + glyphs)
      walk.js             # recursive fs walk, prunes node_modules (replaces find)
  profiles/               # the user's real 10 profiles, shipped as defaults
  test/                   # node:test parity + unit tests, fixtures
  .github/workflows/
    ci.yml                # matrix: {ubuntu, macos, windows} x node {18,20,22} -> eslint + node --test
    publish.yml           # on tag v* -> npm publish --access public (needs NPM_TOKEN secret)
  README.md  LICENSE(MIT)  .gitignore  .npmignore  eslint.config.js
```

## 6. Windows adaptation

| Bash construct | Node replacement |
|---|---|
| `jq` | `JSON.parse` / `JSON.stringify` |
| `awk` / `comm` / `sort -u` / `sed` | JS arrays, `Set`, `Map` |
| `find ... -prune node_modules` | `src/util/walk.js` recursive `fs.readdirSync` |
| `date -u +...Z` | `new Date().toISOString()` |
| `mktemp` + `mv` | write to tmp path then `fs.renameSync` (atomic) |
| `ln -sfn` (directory symlink) | `fs.symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir')` — **junctions need no admin on Windows** |
| broken-symlink test (`-L && ! -e`) | `fs.lstatSync(...).isSymbolicLink()` + `fs.existsSync` of target |
| `$HOME` / `~/.claude` | `os.homedir()` (resolves `C:\Users\…` on Windows) |
| path building | `path.join` everywhere |
| `git rev-parse --show-toplevel` | `spawnSync('git', ['rev-parse','--show-toplevel'])`, fallback `process.cwd()` |

`CLAUDE_CONFIG_DIR` override is preserved.

## 7. Behavioral parity (existing commands)

These must match the current script exactly — same args, output text (French, including `✓`/`⚠`/`→` glyphs), and exit codes.

| Command | Behavior preserved |
|---|---|
| `list` | List profiles with plugin/skill counts and `+ extends`. |
| `detect [--json]` | Same signal sets (web/backend/mobile/devops/data: dep names, file globs, python libs), same scoring, same recommended/candidates/applied JSON shape. |
| `apply <p…>` | Resolve profiles (extends), symlink skills, merge plugins, write marker (managed plugins = union(old, new), extras preserved), ensure gitignore. |
| `skill <n…>` | Link à-la-carte skills, record in `extraSkills` (never pruned by sync). |
| `verify [--json]` | Drift detection; **exit 0 in-sync, 1 drift, 3 no-marker**; same JSON keys (`status`, `missingSkills`, `extraSkills`, `missingPlugins`, `stalePlugins`, `broken`). |
| `sync` | Reconcile: remove off-profile/broken skill links, relink expected, reconcile managed plugins without touching manually-enabled ones, refresh marker. |
| `inspect <p>` | Show description, extends, own vs inherited plugins/skills. |
| `show` | Project state: linked skills + enabled plugins. |
| `hint` | One-line `SessionStart` output; silent when in-sync; no network. |
| `reset` | Clear skill links + `enabledPlugins` + marker. |

Marker schema unchanged: `{ profiles, extraSkills, managedPlugins, appliedAt, v: 1 }`.

## 8. New commands

### Bootstrap / maintenance
- **`init`** — seed `~/.claude/profiles` from the bundled `profiles/` when absent (fresh machine). Never overwrites existing files unless `--force`.
- **`upgrade`** — run `npm i -g @azurioh/ccprofile@latest` (registry) or the GitHub spec; prints resulting version.
- **`validate <profile>`** — schema-check: required shape, unknown referenced skills (not in store), referenced plugins, malformed JSON, broken `extends`. Exit non-zero on error. Reused by `import`/`pull`.
- **`diff <a> <b>`** — show plugin/skill delta between two profiles (resolved, including extends).
- **`doctor`** — environment + cross-machine health: profiles referencing missing store skills, broken symlinks in the current project, orphan entries, `git` availability. Read-only; suggests fixes.
- **`--dry-run`** flag on `apply` and `sync` — compute and print the change set, write nothing. Exit 0.

### Sharing
- **`export <profile> [--resolved]`** — print profile JSON to stdout (or `--out <file>`). `--resolved` flattens the `extends` chain into a single standalone profile so it is portable without its parents. Output embeds a `meta` block (author, ccprofile version, createdAt) without breaking the existing profile schema (meta is ignored by the resolver).
- **`import <file|url>`** — read a profile (or bundle) from a local path or HTTP(S) URL, validate it, write it into `~/.claude/profiles`, and print a dependency report (`missing skills:` / `missing plugins:`). On name collision: prompt or honor `--overwrite` / `--skip` / `--rename <name>`.
- **`share <profile> | --all`** — push one profile, or the whole `~/.claude/profiles` collection as a **bundle**, to a GitHub Gist; print the gist id + URL. Uses `gh` if available, else the GitHub REST API with the existing token.
- **`pull <gist-id|url>`** — fetch a shared profile or bundle from a gist, then run the same validate + import + dependency-report + collision flow as `import`. A **bundle** imports every contained profile; per-profile collisions are reported and resolved with the same flags.

**Share format.** A single profile is the profile JSON plus an optional `meta` block. A bundle is `{ ccprofileBundle: 1, meta, profiles: { <name>: <profileJson>, … } }`. `pull`/`import` detect single vs bundle by the `ccprofileBundle` key.

## 9. Distribution & update

- **Now (no account):** `npm i -g Azurioh/ccprofile`. npm runs from the GitHub repo; no build step means no `prepare` compilation needed.
- **Registry (later):** user runs `npm login` once, then `npm publish --access public` — or pushes a `v*` tag and `publish.yml` publishes via the `NPM_TOKEN` repo secret the user adds. Then `npm i -g @azurioh/ccprofile`, update with `npm update -g @azurioh/ccprofile` or `ccprofile upgrade`.
- `package.json`: `bin: { "ccprofile": "bin/ccprofile.js" }`, `type: "module"`, `engines.node: ">=18"`, `files: ["bin","src","profiles"]`, `publishConfig.access: "public"`.

## 10. Migration of the user's current machine

After global install, `ccprofile` resolves on `PATH` from npm's global bin. Steps (the settings edit is confirmed with the user before writing):

1. Update the `SessionStart` hook in `~/.claude/settings.json`: `$HOME/.claude/bin/ccprofile hint 2>/dev/null || true` → `ccprofile hint 2>/dev/null || true` (PATH-based, cross-platform).
2. Keep the old `~/.claude/bin/ccprofile` as a `.bak` (already present) rather than deleting it.
3. Verify `ccprofile verify` / `hint` produce identical output to the Bash version in a real project before considering the migration done.

## 11. Testing & CI

- **Unit/parity tests** with the built-in `node:test` runner (no dep):
  - profile resolution: `extends` recursion, anti-cycle, dedup order;
  - marker read/write round-trip and schema `v:1`;
  - detection signals against fixture project trees (web/backend/mobile/devops/data);
  - verify drift matrix → correct exit codes and JSON;
  - link/junction creation and broken-link detection in a temp dir;
  - schema validation accept/reject cases;
  - bundle export → pull round-trip.
- **CI** (`ci.yml`): matrix `{ubuntu-latest, macos-latest, windows-latest} × node {18,20,22}` running eslint + `node --test`. The Windows leg is the real proof of cross-platform support.
- **Publish** (`publish.yml`): on `v*` tag, `npm publish --access public` using `NPM_TOKEN`.

## 12. Risks & mitigations

- **Windows symlink permissions.** Mitigated by junctions for directories (no admin). Skills-store entries are directories, so this covers the real case. `doctor` reports if a link could not be created.
- **`gh` not installed for share/pull.** Fallback to GitHub REST with the token from `gh auth` / `GH_TOKEN`; if neither present, fail with a clear message.
- **Behavioral drift from the Bash original.** Mitigated by the parity test suite and a manual side-by-side `verify`/`hint`/`detect --json` comparison on a real project during migration.
- **Publishing is hard to undo.** The repo is GitHub-installable without publishing; registry publish stays a deliberate, user-run step.

## 13. Out of scope / deferred (v2 candidates)

Community profile registry; interactive `create`/`edit`; `add-skill` / `remove-skill` profile mutators; shell tab-completions; update-availability check in `hint`.
