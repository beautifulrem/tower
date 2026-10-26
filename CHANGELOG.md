# Changelog

All notable changes are recorded here. The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Security
- Everything the agent runs is under a deny-by-default macOS sandbox generated per goal — its shell and Pi's `read`, `edit` and `write` tools alike: no credentials, no other projects, writes only to its workspace, private temp dir and private package caches (seeded by copy-on-write), loopback only unless the contract allows the network; local proxies, foreign Unix sockets and the keychain service are unreachable.
- Pi starts with a fixed tool allowlist; MCP and a repository's own Pi resources are disabled.

### Verification
- Red → green: after a pass, each criterion also runs on the base commit; one that already passed there is marked as unable to prove the goal is done.
- More sentinels: test cases removed from a file that stays, more skip forms across frameworks, assertions that cannot fail, early returns. The contract editor warns about criteria that only check text or a file's existence.

### Workflow
- One-click demo goal on a bundled scripted engine — no Pi or credentials.
- Overlap radar between unfinished goals of a project; merge-conflict prediction on acceptance; pull request state and checks followed after pushing.
- Typed environment check with a Pi version check.
- Notifications name the goal and open it when Tower comes to the front; the Dock badge counts only blocking items.
- Background failures are never silent: they pause the goal with "Tower ran into an internal error" and a way out.
- Better quick-goal titles and branch names for Chinese titles; review state stored with the goal in SQLite.

### Interface
- English and Simplified Chinese throughout: interface, native menu, notifications, Needs-You cards, errors, briefings, review risk reasons, sentinel titles and the extension's approval prompts. A new install follows the macOS language; Settings → Language switches everything at once, including the menu bar.
- Needs-You options are matched by meaning, not text: a card written in one language can be answered in the other.

## [0.1.0] — 2026-10-26

The first working version of the M1 loop described in `docs/`.

### Goals and contracts
- One-line quick path and a contract editor: intent, done-when, constraints, stop conditions, executable and human criteria, scope fence, budget, wall clock, autonomy, model and thinking level.
- Lifecycle draft → ready → running → claimed → verifying → in review → accepted → integrated → archived, with named pauses and one way out each.

### Engine
- Pi in RPC mode, one process per running goal, explicit environment; the `tower-goal` extension adds `ask_user`, `log` and `submit`, gates writes outside the scope and commands by autonomy preset, and replaces bash with a sandboxed, credential-free version.
- Explicitly loaded Pi extensions (e.g. model providers), user and project memory, agent language.

### Verification and honesty
- Content-addressed snapshots, clean checkouts, sandboxed criteria without credentials, bounded and redacted output.
- Automatic rework with failure evidence; environment failures never count as criterion failures.
- Sentinels for deleted tests, skip markers, changed test commands, removed assertions, test config and snapshot changes and scope violations.
- Stall detection (repeated failures, no progress) and wall-clock caps.
- Facts, observations, claims and human decisions kept apart in data and on screen; a claim-versus-fact ledger.

### Review and integration
- Risk-ordered review units, syntax highlighting, line comments as steering, viewed marks, persistent drafts, "since last review" scope, open in editor at a line.
- Accepting seals one commit by you on a new local branch; optional push and PR via `gh`; integration detected after fast-forward or squash merges.

### Interface
- Overview of goal cards, goal pages, Needs-You inbox, watch mode and trace, command palette, native menu bar, notifications and Dock badge, re-entry briefings, light and dark themes.

### Project
- Local files (e.g. `.env`) copied into workspaces and checkouts; a workspace setup command; workspace cleanup; keep-awake while running.
