# ccprofile

> Per-project [Claude Code](https://claude.com/claude-code) plugins & skills profiles — keep your global config core-minimal, opt each project into the tooling it actually needs.

`ccprofile` is a zero-dependency, cross-platform (Windows / macOS / Linux) CLI. Instead of enabling every plugin and skill globally, you define reusable **profiles** (`web`, `backend`, `mobile`, …) and apply them per project. Skills are symlinked from a local master store into the project's `.claude/skills/`; plugins are enabled in the project's `.claude/settings.local.json`. A project marker (`.claude/ccprofile.json`) records what was applied so drift can be detected and reconciled.

## Install

**From GitHub (works today, no npm account needed):**

```sh
npm i -g Azurioh/ccprofile
# or
pnpm add -g Azurioh/ccprofile
```

**From the npm registry (once published):**

```sh
npm i -g @azurioh/ccprofile
npm update -g @azurioh/ccprofile   # update
```

Requires Node.js ≥ 18. No runtime dependencies.

## Quick start

```sh
ccprofile detect        # what profile fits this project?
ccprofile apply web     # symlink its skills + enable its plugins
ccprofile show          # what's active in this project
ccprofile verify        # is the project still in sync with the profile?
ccprofile sync          # reconcile after a profile changed
```

Changes take effect on the next Claude Code session.

## Commands

| Command | What it does |
| --- | --- |
| `ccprofile list` | List available profiles (with plugin/skill counts and `extends`). |
| `ccprofile detect [--json]` | Detect the profile(s) that fit the current project from its stack signals. |
| `ccprofile apply <p> [p...]` | Apply one or more profiles to the current project. |
| `ccprofile skill <name> [name...]` | Add an à-la-carte skill (tracked separately, never pruned by `sync`). |
| `ccprofile verify [--json]` | Check drift between the project and the profile's current definition. Exit `0` in-sync, `1` drift, `3` no profile applied. |
| `ccprofile sync` | Reconcile the project onto the profile's current definition. |
| `ccprofile inspect <p>` | Show a profile's plugins + skills (resolving `extends`). |
| `ccprofile show` | Show the current project's applied skills + enabled plugins. |
| `ccprofile hint` | One-line status for a `SessionStart` hook (silent when in sync). |
| `ccprofile reset` | Clear the project's skills, plugins, and marker. |

## Profiles

Profiles live in `~/.claude/profiles/*.json`:

```json
{
  "description": "Web apps frontend (React/Next/TS)",
  "extends": ["dev-common"],
  "plugins": ["code-review@claude-plugins-official"],
  "skills": ["frontend-design", "responsive-layouts"]
}
```

- `extends` — inherit plugins + skills from other profiles (resolved depth-first, deduplicated, cycle-safe).
- `plugins` — Claude Code plugin identifiers to enable.
- `skills` — skill directory names to symlink from the skills store (`~/.claude/skills-store`).

The store and profiles can be overridden by setting `CLAUDE_CONFIG_DIR`.

## SessionStart hook

Surface drift (or a profile suggestion) automatically at the start of each Claude Code session. In `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "ccprofile hint 2>/dev/null || true", "timeout": 10 }] }
    ]
  }
}
```

`hint` is silent when the project is in sync, makes no network calls, and never fails a session.

## Windows

Fully supported. Directory links use **junctions** on Windows, so no Administrator rights or Developer Mode are required. Paths, the home directory, and the optional `CLAUDE_CONFIG_DIR` override all resolve natively.

## License

MIT © Azurioh
