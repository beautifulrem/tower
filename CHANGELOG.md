# Changelog

All notable changes are recorded here. The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Security
- The phone page is served on Tailscale only while Tailscale is connected (or on the local network when you switch that on), never on every interface by default; Settings says why it is off. Pushes carry fixed sentences, never the agent's text or the pairing token, go only to https (or this Mac / Tailscale), and can be tested from Settings.
- The browser that takes `look` screenshots runs confined: loopback only, its own folders, no credential stores.
- Claude Code's ACP adapter is installed from a lockfile shipped with Tower (integrity-checked, install scripts off) instead of `npx` at run time.
- Accepting a goal requires your git name and email instead of committing as "Tower".
- Everything the agent runs is under a deny-by-default macOS sandbox generated per goal — its shell and Pi's `read`, `edit` and `write` tools alike: no credentials, no other projects, writes only to its workspace, private temp dir and private package caches (seeded by copy-on-write), loopback only unless the contract allows the network; local proxies, foreign Unix sockets and the keychain service are unreachable.
- Pi starts with a fixed tool allowlist; MCP and a repository's own Pi resources are disabled.

### Verification
- A pass must come from the source: after the visible criteria pass, the agent's changes outside the program code (tests, test data, configuration, dotfiles, scripts, package settings) are put back as on the base and the criteria run again; passing only with them holds the goal. One file-role classifier (`tower-core/src/roles.rs`) decides what is source, and anything it does not recognise is treated as configuration.
- A test that must fail: a canary written in each JavaScript, TypeScript and Python test file's own style is added and the proving criteria run again; if it ran and the command still passed, assertions or the runner were tampered with and the goal is held.
- Held-out tests run only after the visible criteria pass, offline, with their output for you alone; a failure pauses the goal with a hint field instead of sending the agent back with the tests' output. Results produced with them are marked.
- Every verification uses fresh random directories, resets tracked files to the snapshot after setup and between steps, and stops processes it left running. Repeated sandbox refusals during a run are reported in review, and agent commands time out after five minutes unless the model asks otherwise.
- Red → green: after a pass, each criterion also runs on the base commit; one that already passed there is marked as unable to prove the goal is done.
- More sentinels: test cases removed from a file that stays, more skip forms across frameworks, assertions that cannot fail, early returns. The contract editor warns about criteria that only check text or a file's existence.

### Visual evidence
- `look` criteria: the verifier starts the app (sandboxed), waits until its URL answers on this machine and takes a screenshot with a Chromium-based browser, on the base and on the agent's snapshot; the human judges before and after in the review.

### Engines
- Claude Code as a second engine, through the Agent Client Protocol: a bridge speaks Pi's RPC to Tower and drives `claude-agent-acp`, which gets no built-in tools, settings, hooks or MCP servers of its own, only Tower's sandboxed tools. Choose it in Settings or per goal.

### Away from the desk
- Pushes through ntfy (your own server or a public one): items that block a goal arrive on your phone with their titles and open the phone page.
- A phone page, served over your own network (Tailscale recommended): what needs you, answered in place, and pausing running goals. Off by default; paired by a link or QR code carrying a 256-bit token.

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
- Review: accept a hunk (A) as your reading mark — it folds to its header and the review moves on; paired with undo (U), which changes the workspace. Marks are kept with the review per snapshot; the status bar counts them. Entering review, the file tree slides in while the diff crossfades.
- Each criterion the must-fail canary checked says what it saw — assertions checked, not checked (and why that matters), or a test that must fail having passed — on the goal page and in the verification readout. Sentinel details read as sentence and list.
- Held-out failures name the failing tests on the card, on the desk and on the phone, and offer to tell the agent only those names; the phone's card has the desk's grammar and every reply box a placeholder. The phone page's empty state is its own skeleton; axe runs on it.
- A missing git identity can be set from the welcome screen and Settings, with the command kept beside the fields.
- Fields show their focus (a text-3 edge, an inner line for the keyboard); an answered card folds the moment its receipt rises; toasts carry Tower's left rule (yours, needs you, error); the runs gauge sweeps to its reading; the briefing is one line; the palette groups actions and goals when you type.

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
