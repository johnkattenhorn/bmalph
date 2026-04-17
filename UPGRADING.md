# Upgrading a bmalph-managed project

Practical playbook for pulling a new bmalph release into an existing BMAD project.
Based on real learnings migrating a live project from v2.11.0 (BMAD v6.2.0) to v3.0.0 (BMAD v6.3.0).

## Order of operations

1. Finish or halt any in-flight Ralph loop (`tmux attach -t ralph`, `Ctrl+C` the `bmalph run` pane, exit). Upgrading mid-run rewrites `.ralph/` scripts under Ralph's feet.
2. Update the global install.
3. Upgrade the project.
4. Handle migration-specific cleanup (version-dependent).
5. Verify with `bmalph doctor` and a smoke `bmalph run --dry-run` (where available).

## 1. Update the global install

```bash
# If you installed the stock LarsCowe package from npm:
sudo npm uninstall -g bmalph
sudo npm install -g github:johnkattenhorn/bmalph#main

# If you installed from a local clone:
cd <path-to-local-bmalph> && git pull && sudo npm install -g .

# Verify
bmalph --version                                   # reports fork version (e.g. 3.0.0)
cat "$(npm root -g)/bmalph/bundled-versions.json"  # reports current BMAD SHA
```

> **Note for published tarballs:** consumers installing `github:...` via `npm install -g` rely on the `prepare` script to run `tsc` at install time. The fork ships that script — the stock LarsCowe package does not (as of v2.11.0). If you're installing from a non-fork source without `prepare`, the CLI will be missing `dist/` and fail on launch.

## 2. Upgrade the project

```bash
cd <your-project>
git pull                   # pull any project-level changes
bmalph doctor              # baseline
bmalph upgrade             # refreshes _bmad/, Ralph scripts, slash-commands
bmalph doctor              # verify
```

`bmalph upgrade` refreshes:
- `_bmad/` — bundled BMAD assets (bmm, core, lite)
- `.ralph/ralph_loop.sh`, `.ralph/ralph_import.sh`, `.ralph/ralph_monitor.sh`, `.ralph/lib/`
- `.ralph/RALPH-REFERENCE.md`, `.ralph/REVIEW_PROMPT.md`
- `.claude/commands/` (adds new, but does **not** remove stale — see below)
- `.gitignore`

It preserves:
- `bmalph/config.json`, `bmalph/state/`
- `.ralph/logs/`, `.ralph/@fix_plan.md`, `.ralph/docs/`, `.ralph/specs/`
- `.ralph/.ralphrc` (your project-level Ralph config)

## 3. Migration cleanup — version-dependent

### Upgrading across a BMAD major (e.g. v6.2.x → v6.3.x)

BMAD majors may remove agents and skills. `bmalph upgrade` does **not** delete slash-commands for removed agents — it treats unknown files as user-created. You must clean them up manually after any BMAD major bump.

For the v6.2.0 → v6.3.0 migration specifically, BMAD consolidated three agent personas (Barry/quick-flow-solo-dev, Quinn/QA, Bob/SM) into Amelia (`dev`). Remove the orphaned slash-commands:

```bash
cd .claude/commands
rm -f sm.md qa.md qa-automate.md \
      quick-flow-solo-dev.md quick-dev.md quick-dev-new.md \
      tech-spec.md
```

General pattern: after any `bmalph upgrade`, diff `ls .claude/commands/` against the expected bundle list (`ls $(npm root -g)/bmalph/slash-commands/`) and delete the orphans. A future bmalph release may automate this via a `--clean-orphaned` flag.

### Update `CLAUDE.md` agent references

If your project's `CLAUDE.md` documents the BMAD agent set (e.g. a table of `/analyst`, `/pm`, `/sm`, `/qa`, etc.), update it after any agent-set change. For v6.3.0:
- Remove rows for `/sm`, `/qa`, `/quick-flow-solo-dev`
- Note that Amelia (`/dev`) now owns sprint planning, story creation, QA test generation, code review, retrospectives, and quick-dev

### Update `.mcp.json` for Aspire MCP

If your project uses the Aspire MCP server and is upgrading to Aspire CLI 13.2.2+:

```diff
 "aspire": {
   "command": "aspire",
-  "args": ["mcp", "start"]
+  "args": ["agent", "mcp"]
 }
```

The `aspire mcp start` command is deprecated in 13.2.2 in favour of `aspire agent mcp`. The old command still works but prints a deprecation warning on every launch. If you run `aspire agent init` interactively in your project root it will also register the Aspire skill and wire Playwright alongside.

### After `bmalph implement`, re-apply any `PROMPT.md` customisations

`bmalph implement` (the phase-4 transition command) regenerates `.ralph/PROMPT.md` from scratch. Any custom rules you've added to PROMPT.md — e.g. post-story gates, project-specific slopwatch hooks, extra TDD directives — are wiped. Keep a canonical copy of your custom sections somewhere versioned (e.g. `docs/ralph-custom-prompt.md`) and paste back after every `bmalph implement`.

`bmalph upgrade` does NOT touch PROMPT.md — only `bmalph implement` does. Routine upgrades are safe.

### Decide what `_bmad-output/` tracking policy you want

Default bmalph gitignore excludes `_bmad-output/` entirely. Planning artefacts (PRD, architecture, epics) live there, and these are the contract Ralph reads mid-run. Two schools of thought:

- **Versioned (recommended):** un-gitignore `_bmad-output/` so planning edits are versioned and survive clones. You can still gitignore transient sub-paths like `_bmad-output/implementation-artifacts/*.tmp`.
- **Local-only:** accept that planning docs live outside git. Fine for solo projects that never leave one machine.

## 4. Verify and smoke-test

```bash
bmalph doctor      # all green (one known benign warning: _bmad-output/ in .gitignore
                   # if you un-gitignored it — bmalph considers this a missing rule)

# Dry-run a loop (does not execute Claude, just validates config)
bmalph run --help  # confirm --review flag available

# Optional: watch one loop live in tmux
tmux new -s ralph
bmalph run --review enhanced
# Ctrl+b then d to detach
```

## Rollback

If the upgrade breaks your project:

```bash
# Re-install the previous fork version by pinning a commit
sudo npm uninstall -g bmalph
sudo npm install -g github:johnkattenhorn/bmalph#<previous-tag-or-sha>

# Restore the project's _bmad/ from git
cd <your-project>
git checkout <pre-upgrade-sha> -- _bmad/ .ralph/ .claude/commands/
```

Pin a "pre-upgrade" git tag on your project before every upgrade so rollback is one command:

```bash
git tag -a "pre-bmalph-upgrade-$(date +%Y-%m-%d)" -m "before bmalph upgrade"
git push origin "pre-bmalph-upgrade-$(date +%Y-%m-%d)"
```

## Scripting the upgrade

A rough scriptable sequence (adjust paths for your environment):

```bash
#!/usr/bin/env bash
set -e
PROJECT="${1:?usage: $0 <project-dir>}"

# 1. snapshot
cd "$PROJECT"
TAG="pre-bmalph-upgrade-$(date +%Y-%m-%d-%H%M%S)"
git tag -a "$TAG" -m "before bmalph upgrade"
git push origin "$TAG"

# 2. update global install
sudo npm uninstall -g bmalph
sudo npm install -g github:johnkattenhorn/bmalph#main

# 3. upgrade project
bmalph upgrade

# 4. v6.2→v6.3 cleanup (adjust per BMAD version)
cd "$PROJECT/.claude/commands"
rm -f sm.md qa.md qa-automate.md quick-flow-solo-dev.md quick-dev.md quick-dev-new.md tech-spec.md

# 5. verify
cd "$PROJECT"
bmalph doctor
```

Project-specific edits (CLAUDE.md agent tables, `.mcp.json` aspire args, PROMPT.md customisations) are **not scriptable in general** — they depend on project structure and what customisations you've made. Keep them as a project-local checklist in `docs/bmalph-upgrade-checklist.md`.
