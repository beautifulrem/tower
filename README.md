# Tower

English · [简体中文](README.zh-CN.md)

**A goal-centric Air-Traffic Control Flight Deck for supervising coding agents — with independent clean-checkout verification, kernel sandboxing, and multi-engine ACP.**

Most agent GUIs inherit the chat-era IDE layout: disposable sessions on the left, a scrolling transcript stream in the middle, a diff drawer on the right. That metaphor breaks down the moment you supervise concurrent, long-running agents: motion looks like progress, and an agent saying *"all tests pass"* wears the same visual register as a real test run.

Tower rejects **Chat UI inertia**. Instead of chat bubbles and session trees, it gives you a calibrated instrument console built around one question: **what is each agent going to do, what is it doing, what did it actually prove, and what changed — backed by verifiable evidence?**

![Tower Flight-Deck Overview (Warm Carbon)](assets/screenshots/overview.png)

---

## Anti-"Chat UI Inertia" Flight-Deck Philosophy

Tower is designed as an **ATC Flight Deck × Swiss Instrument Console** ([`docs/19-anti-chat-console-design.md`](docs/19-anti-chat-console-design.md)) calibrated for ≤ 3-second supervisory scannability in both **Warm Carbon** (dark) and **Warm Parchment** (light) OKLCH surface themes — zero glassmorphism, zero decorative animation, and zero unverified green checkmarks.

### Four Physical Provenance Frames (Honesty Grammar)

Facts and claims are separated in both the data model and on screen through geometry, typography, and color permission — distinguishable in monochrome and screen readers, never by color alone:

| Register | Physical Frame | Meaning & Color Rule |
|---|---|---|
| **Fact** | Solid `2px` left rule + solid frame (`JetBrains Mono`) | Harness-measured ground truth (clean-checkout verifier results, sentinels, CDP console errors). **Only a fresh, untampered verifier pass may wear green.** |
| **Observation** | Dotted `1px` frame, hollow mark | Output observed inside the agent's own sandbox environment. Strictly neutral greyscale — **never green**. |
| **Claim** | Dashed `2px` left rule + explicit `Agent claims` badge | Anything the agent writes (`log`, summaries, review narratives, `blocked` reports, synthetic holdout drafts). **Never green**; cross-checked against facts in the Honesty Ledger. |
| **Human** | Solid primary ink rule + `You · HH:MM` stamp | Your contracts, approvals, review steering, ratified memory rules, and acceptance seals. Immutable audit authority. |

### Situational Awareness Without Leaving the Board

- **Telemetry Title Bar**: Active concurrency slot lamps & swept runs gauge (`1/4 running`), blocking Needs-You amber counter (`◆`), live OS sandbox posture badge (`macOS Seatbelt (S2)` / `Landlock` / `MicroVM`), engine heartbeat, spend, quiet hours, and remote phone status on one quiet baseline.
- **Pinned Decision Gate Strip & ATC Flight-Strip Board**: Blocking questions, approvals, held-out failures, assumptions, and stalls pin above active goals on the same column grid (`Goal · Live · Criteria · Change · Spend · Updated · Identity`). Resolve cards in place (`1–9` choices, `⌘↩` reply, `Esc` fold). Each flight strip shows a single-line live activity readout, dual-track criteria segments (verified solid vs. observed hollow), a budget burn track with a soft-cap tick, concurrent **Overlap Radar** warnings (`◇ G-0003`), and engine / trust tier badges.
- **`Space`-Key Quick Peek (`L1 / L2 / L3`)**: Press `Space` on any flight strip to slide open a `440px` right-edge instrument card without leaving the board — **L1** live mode & target, **L2** dual-track criteria, sentinels & latest claim, **L3** spend/wall-clock burn & next-step projection — with inline `P` pause/resume, `R` review, and `↵` open.
- **Lossless Flight Recorder (`W`)**: Escape hatch without chat bubbles. Time-indexed instrument rail with one-click anomaly-first filters (`All`, `Anomalies & Denials`, `Tower Injections`, `Decisions & Claims`, `Tools`, `Facts`). Every message Tower injects into an engine is visible verbatim.

---

## Core Capabilities

### 1. Six-Step Independent Verification & Anti-Cheat Bench

A goal is a **contract** (intent, executable / `look` / human criteria, scope fence, spend & wall-clock budget, autonomy preset, stop conditions, optional `depends_on`, and rework model escalation). Completion has three distinct states: **Claimed → Verified → Accepted**.

When an agent claims completion, Tower pins a content-addressed snapshot and runs a six-step verification bench in a **fresh random clean-checkout directory** with a disposable copy-on-write package cache, zero credentials, and tracked files reset to the pin:

1. **Base Red → Green Preflight**: Criteria run on the base commit inside the verification sandbox while the agent starts. A criterion that already passed on base is marked *unable to prove completion*; base-fail → snapshot-pass proves red → green.
2. **Sandboxed Visible Criteria**: Setup runs offline on the agent's snapshot unless the contract permits network or you explicitly approve changed dependencies; visible machine criteria execute under the goal's sandbox rules.
3. **Held-Out Tests & Human-Ratified Synthetic Holdouts**: Held-out tests never enter the agent's workspace, contract, or prompts. They are copied into the clean checkout only after visible criteria pass and run offline; failures pause for you instead of leaking output to the agent. Each markable file (JS/TS, Python, shell, Rust) carries a per-run random token written to a **write-only drop box** (writable, unreadable, unlistable from the sandbox) so Tower proves file-by-file execution (`m of n ran`; unrun or unprovable files are listed for you alone). Optional **synthetic holdout drafts** enter as dashed Claims and move into `holdout/` only after explicit human review and ratification.
4. **Source-Only Re-Run + Tree-sitter Rust Inline Test Restore**: Tower reverts every non-source edit (tests, fixtures, config, dotfiles, scripts, package settings — centrally classified in `tower-core/src/roles.rs`) and uses **`tower-ast` (Tree-sitter)** to restore Rust inline `#[cfg(test)]` modules and test functions back to base before re-running criteria. New `#[cfg(test)]` branches or test-environment probes in production Rust trigger the `rust_test_branch_cheat` high-severity sentinel.
5. **Must-Fail Canary & Runtime Assertion-Identity Guard**: Tower injects a must-fail canary written in each test file's own style and mutates exact-equality expectations; if a criterion still passes, the pass is withheld as tampered (*not evidence*). Simultaneously, Tower preloads a runtime assertion-identity guard before any project code — including **Node 22.15+/24 synchronous `module.registerHooks()`** for ESM/CJS (`node:assert`, `vitest`, `chai`, `@jest/globals`, `expect`), Python startup hooks, and exit-listener hardening. Multi-process completeness (`report.finished < report.started`) ensures a silent child cannot hide behind a clean parent, while **`chflags uappnd` append-only transcripts** plus **SHA-256 commit-reveal nonces** prevent verdict forgery.
6. **Perturbation + AST Bypass-Around-Bug Escalation & Flaky Detection**: Tower perturbs numeric literal inputs in base assertions and combines `Confined` perturbation findings with `tower-ast` **bypass-around-bug** structural analysis to hold hard-coded lookup/derived-property shortcuts high while keeping honest mappings and calendar-edge fixes free of false holds. A newly failed visible criterion automatically reruns **1×** to surface **`Flaky`** tests and preserve both outputs without burning rework rounds.

**Visual Evidence (`look` criteria)**: After verifying the target port is free and that every listener answering it lives inside the verification sandbox, Tower captures before/after screenshots with a deny-by-default headless Chromium browser across **desktop and mobile viewports** (`side`, `onion` slider, and pixel `diff` modes) and attaches **CDP `Console.error` and uncaught `pageerror`** events directly beneath the screenshots as **Fact** records.

### 2. Defense-in-Depth Sandbox & Cross-Platform Isolation

Every safety claim is backed by **100 automated security tests** in [SECURITY.md](SECURITY.md), verified on every push by `tools/security-tests.mjs` against real `sandbox-exec` and real git.

- **Persistent Sandboxed FS Helper (`--fs-helper`)**: A long-lived helper runs inside the goal's Seatbelt profile over a stdio JSONL pipe (`extensions/tower-goal/sandboxfs.ts`), enforcing the 16 MiB file cap and exact kernel file policy on every `read`, `edit`, and `write` at sub-millisecond latency.
- **macOS Seatbelt (Deny-by-Default Per Goal)**:
  - **Allowlist reads only**: system paths, toolchains and version-manager selectors (`rustup`, `nvm`, `fnm`, `volta`, `asdf`, `mise`, Xcode), the goal workspace, and private directories — never `$HOME`, other projects, credential stores (`~/.ssh`, `~/.aws`, `~/.config/gh`, Pi `auth.json`), or `*_API_KEY` environment variables.
  - **Scoped writes & COW caches**: writes only to the satellite workspace, private temp dir, and **APFS copy-on-write private package caches** (seeded from yours so your caches can never be poisoned; verification gets a fresh clone each run).
  - **Prompt-poisoning & hard-link denial**: the kernel profile blocks writes to `AGENTS*.md`, `CLAUDE*.md`, `.pi/`, and `.agents/` at any depth and enforces `(deny file-link)`.
  - **Closed loopback + 10-port dynamic pool**: without the contract's network switch, external traffic and loopback are closed by default. Each active goal receives a non-overlapping **10-port block** (`TOWER_PORT_BASE`, `TOWER_PORT_0..9`) automatically added to its sandbox profile; loopback widens only on base-commit evidence from your own tests or explicit choice. Local proxies, keychain, and foreign Unix sockets (`docker.sock`) stay blocked.
  - **Kernel `sandbox_check` process cleanup**: at run end, pause, abandon, crash, quit, or startup, Tower terminates every process inside that goal's sandbox as identified by the kernel — regardless of working directory, process group, or session — without touching your own processes.
- **Cross-Platform `SandboxBackend` Abstraction**:
  - **Linux**: `bubblewrap` (`bwrap --unshare-all`) + **Landlock ABI v3+** (reproducing write-only drop boxes and append-only transcripts) + **cgroups v2 `cgroup.kill`** atomic teardown, with bilingual Ubuntu 24.04+ AppArmor userns diagnostics.
  - **Apple Containerization MicroVM (macOS 26+ Apple Silicon, optional)**: selectable per contract for high-risk goals (untrusted build scripts, major dependency upgrades) as hypervisor-level defense in depth.

### 3. Engine-Neutral Multi-Engine ACP & Fail-Closed Trust Gate

Choose your default engine in Settings or override per contract without lowering sandbox standards:

| Engine | Transport | Trust Tier | Tool & Sandbox Posture |
|---|---|---|---|
| **Pi** | Native JSONL RPC | `Full S2` | Fixed 7-tool allowlist (`read`, `bash`, `edit`, `write`, `ask_user`, `log`, `submit`); MCP and repo-local Pi resources disabled. |
| **Claude Code** | ACP bridge (`acp.ts`) | `Full S2` | Built-in tools, settings, hooks, external MCPs, and claude.ai connectors stripped; routed strictly through Tower's sandboxed MCP server. |
| **Codex CLI** / **Gemini CLI** / **OpenCode** | Generic ACP bridge (`codex-acp`, `--acp`, `acp`) | `Restricted S2` | Fail-closed Onboarding Trust Gate rejects any non-`mcp__tower__*` permission request across adapter payload formats and emits an audited `acp_unauthorized_tool` sentinel. |
| **Custom ACP adapters** | Generic ACP bridge | `Experimental` | Explicitly labeled in Settings, environment checks, and flight strips; bundled adapters install via `npm ci --ignore-scripts` after lockfile SRI integrity verification. |

- **Honest `submit(outcome: "blocked")`**: Keeps the strict 7-tool surface while giving agents a sanctioned exit when specs conflict or prerequisites are impossible (`PauseReason::AgentReportedBlocked`, rendered as a dashed Claim) instead of tempting reward-hacking.
- **Anti-Probing Early Stall**: Automatically pauses if an agent hits ≥ 5 out-of-workspace sandbox denials with no workspace progress.
- **Structured POSIX Shell Parser (`shell_parse.ts`)**: Parses pipelines, subshells, env prefixes, quoting, escapes, wrappers, and redirections so one-way doors and cautious-mode hidden writes cannot be bypassed by string tricks.
- **Layered Rework Model Escalation**: Start a goal on a fast model and escalate automatically to a stronger model after consecutive verification failures, with every switch logged as a first-class trace event.
- **Multimodal Attachments & `@file` References**: Paste or drop screenshots into contracts, steering replies, and decision cards (canonical goal-directory containment; read via the sandboxed `read` tool).

### 4. Evidence-Driven Review Theater

- **Risk-Ordered Review Units (≤ 300 lines)**: High-risk files and sentinel targets surface first, with viewed marks, persistent drafts, and full-window theater focus.
- **Split-Geometry Virtualized Diffs**: `content-visibility: auto` plus lightweight virtualization past 400 rows (or whole-file view) keeps large diffs responsive at 60 fps while staying inside the JS budget.
- **Snapshot Timeline**: Switch cleanly between **`All`**, **`Since last review`**, **`Last turn`**, and **`Compare runs…`** backed by content-addressed run/pin snapshots (`refs/tower/runs/<n>`, `refs/tower/pin`).
- **AST Semantic Noise Collapse**: `tower-ast` identifies pure moved-unchanged blocks (`Moved unchanged`) and formatting-only hunks so reviewers focus on logic changes.
- **Dashed "Agent claims why" Unit Narratives**: Synthesized from the goal's `log` trace and rendered inside a dashed Claim frame — never mistaken for verified fact.
- **Steering Dispatch (`⌘↩`) & In-Place Hunk Actions**: Line comments batch into a steering dispatch back to the agent; accept hunks (`A`), undo/revert hunks (`U`), or jump straight to the line in your editor (`⌘`-click).
- **4-Point Physical Acceptance Seal (`⌘⇧↩`)**: Checks *Snapshot fresh*, *0 high sentinels*, *Human checks clear*, and *Merge prediction clear* before writing a single commit authored by you to a new local branch `tower/<goal>-<slug>`. Pushing and opening a PR via `gh` are always explicit actions of yours.

### 5. Learning, Operations & Away from the Desk

- **Learning Console (`⌘3`)**:
  - **Taint-Gated Memory Ratification Queue**: Mines candidate rules from human review comments and harness failure signatures under a reverse-whitelist taint model — `Taint: none` (pure human quote / harness fact), `Taint: standard` (repo/tool output), `Taint: high` (external content or instruction-like patterns, hard-locked until you edit the rule or type `CONFIRM`; secrets blocked).
  - **Model Calibration Scoreboard**: Pure-Fact historical telemetry per engine and model (first-pass verification rate, average rework rounds, sentinel rate, cost per accepted goal).
- **Operations Console (`⌘4`)**:
  - **Scheduled Goals (`Unattended strict`)**: Cron-triggered overnight/recurring goals reusing the exact same contract, sandbox, and six-step verification bench, with durable checkpoint resume across restarts or rate limits — while every one-way door or privilege widening hard-pauses into Needs-You.
  - **Per-Project Merge Queue & `depends_on`**: Order accepted branches sequentially with `git merge-tree` conflict prediction and one-click re-verification after baseline moves, complemented by cross-goal dependencies and 15-second Overlap Radar.
  - **Disk Storage & Sandbox Posture**: Per-goal breakdown of workspace, verification, and cache disk usage with safe reclamation that hard-protects active, unmerged, Needs-You, and dirty workspaces.
- **Away from the Desk**:
  - **Tailscale-Only Phone Page** (off by default): Served only over Tailscale while connected (LAN is a separate opt-in), paired via a 256-bit token carried in the URL fragment / QR code (never in query strings), backed by an async Bearer-authenticated `/api/events` SSE stream. Privilege-widening decisions are refused from the phone and stay at the desk.
  - **ntfy Pushes** (off by default): Sends only goal ID, title, and a fixed item kind over HTTPS (or local/Tailscale) — zero agent text, zero code, zero pairing token.
- **English & Simplified Chinese**: New installs follow your macOS language; Settings → Language switches the interface, native menu bar, notifications, structured reasons, and agent language at once.

---

## Visual Showcase

| `Space` Quick Peek Drawer (Telemetry, Criteria & Budget) | Goal Command Deck (Provenance, Sentinels & Contract Rail) |
|---|---|
| ![Quick Peek Drawer](assets/screenshots/peek.png) | ![Goal Command Deck](assets/screenshots/goal.png) |

| Review Theater (Snapshot Timeline & AST Noise Folding) | Contract Studio (5-Clause Spec, Engine & Sandbox Tier) |
|---|---|
| ![Review Theater](assets/screenshots/review.png) | ![Contract Studio](assets/screenshots/contract.png) |

| Learning Console (Taint-Gated Ratification & Calibration) | Operations Console (Schedules, Merge Queue & Disk/Sandbox) |
|---|---|
| ![Learning Console](assets/screenshots/learning.png) | ![Operations Console](assets/screenshots/operations.png) |

| Overview — Warm Parchment (Light) | Goal Command Deck — Warm Parchment (Light) |
|---|---|
| ![Overview Light](assets/screenshots/overview-light.png) | ![Goal Deck Light](assets/screenshots/goal-light.png) |

---

## Try It, Install & Build

### 1. Zero-Credential Demo (Fastest Way to Explore)

Open Tower and choose **Try a demo goal** on the Welcome screen. Tower creates a small sample repository and runs a bundled scripted engine (`tools/demo-engine`) through the full loop — a question, a claim, clean-checkout verification, sentinels, and review — without any model or API key (Node.js is needed for the demo's tests).

### 2. Releases, Homebrew Cask & Explicit Updater

There is no signed public release yet; build from source below (about five minutes on a recent Mac). Tagged releases (`v*`) build universal Apple Silicon + Intel `.dmg` installers via [`.github/workflows/release.yml`](.github/workflows/release.yml) (signed and notarized once Apple Developer credentials are configured; see [`RELEASING.md`](RELEASING.md)) and update the Homebrew cask ([`packaging/homebrew/tower.rb`](packaging/homebrew/tower.rb)). First unsigned builds require right-click → **Open** once.

When release updater signing keys are configured, Tower uses `tauri-plugin-updater` with Ed25519 signature verification against `latest.json` — and follows a strict **never silent** rule: it only checks on request and downloads/installs when you explicitly confirm.

### 3. Configure an Agent Engine

Install [Pi](https://github.com/earendil-works/pi) (default `Full S2` engine) or select Claude Code, Codex CLI, Gemini CLI, or OpenCode in Settings or per contract:

```sh
npm i -g @earendil-works/pi-coding-agent
pi            # then /login
```

If your models come from a Pi extension package (for example ClinePass), list its entry file under **Settings → Extra Pi extensions to load** and export its key in your login shell (`export CLINE_API_KEY=…`). Tower passes `*_API_KEY` variables to Pi, never to the agent's sandboxed shell.

### 4. Build from Source

**Prerequisites**: macOS 13+ (or Linux with `bwrap` + Landlock ABI v3+ for core supervisor/sandbox workloads), Rust (pinned in [`rust-toolchain.toml`](rust-toolchain.toml)), Node 22+, `pnpm`, and `git`.

```sh
pnpm install
pnpm dev        # Tauri dev build with hot reload
pnpm build      # .app / .dmg in target/release/bundle
pnpm check      # type-check, unit tests, clippy, cargo test, extension tests
```

### 5. CLI Workflows & Verification Tools

```sh
# Seed and open the interactive demo workspace (isolated from ~/.tower)
tools/demo-engine/make_demo_repo.sh /tmp/tower-demo/shop
TOWER_HOME=/tmp/tower-demo/home cargo run -p tower-supervisor --example seed_demo -- /tmp/tower-demo/shop
TOWER_HOME=/tmp/tower-demo/home pnpm dev

# Launch directly into a specific view (e.g. goal/G-0001, review/G-0001, inbox)
TOWER_OPEN=review/G-0001 pnpm dev

# Run one goal headlessly against your real Pi engine
TOWER_HOME=/tmp/tower-live cargo run -p tower-supervisor --example run_goal -- \
  <repo> "<intent>" "<acceptance command>" [provider/model] [extension…]

# Run CI guardrails locally
pnpm --dir apps/desktop build && tools/bundle-budget.sh && tools/doc-numbers.sh
node tools/security-tests.mjs
tools/adversarial.sh            # optional real-model anti-cheat regression
```

---

## Architecture

```text
apps/desktop/            Tauri 2 shell (Rust, explicit updater) + SolidJS Flight-Deck console
  src-tauri/             Commands 1:1 with Supervisor methods; coalesced tower://update stream
  src/                   Views (Overview, Peek, Goal, Review, Learning, Operations, Contract), OKLCH tokens
crates/
  tower-core/            Pure domain model: lifecycle state machine, contracts, honesty grammar, sentinels, review units
  tower-ast/             Tree-sitter AST analysis (Rust/JS/TS/Python/Bash) for inline tests, sentinels & diff folding
  tower-store/           Single-writer SQLite WAL event log with concurrent read pool & projections
  tower-pi/              Pi JSONL RPC adapter with multimodal image attachments & process-group teardown
  tower-git/             Satellite clones, content-addressed snapshots, timeline compare, sealing, merge-tree queue
  tower-verify/          Criterion runner: process groups, timeouts, bounded redacted output
  tower-supervisor/      Single writer: lifecycle, 6-step verification bench, SandboxBackend (Seatbelt/Linux/MicroVM),
                         --fs-helper, 10-port pool, learning, schedules, storage, async remote SSE
extensions/tower-goal/   Pi & generic ACP bridge (index, policy, shell_parse, sandboxfs, acp, engines, acp_tools)
packaging/homebrew/      Homebrew cask definition (tower.rb)
docs/                    Product spec (00–17), evolution roadmap (18), anti-chat console spec (19), 112 review rounds
tools/                   Demo engine, security-test gate, bundle/doc/line-limit checks, E2E & adversarial runners
```

The supervisor owns all authoritative state in SQLite WAL (single writer plus a concurrent read pool); the interface holds a read-only replica fed by coalesced updates. Start-up JavaScript is about 52 KB gzipped (including the first half of one interface language; the other language loads only if you switch). The goal page and later-view strings follow once the first frame is up, while Review, Settings, Learning, Operations, Contract Studio, Quick Peek, and the Command Palette load on first use, and syntax highlighting runs in a Web Worker. CI enforces budgets for start-up (`64 KB`), the goal page (`12 KB`), and all interface JavaScript combined (`160 KB`; about 155 KB today) via [`tools/bundle-budget.sh`](tools/bundle-budget.sh), so moving code out of start-up cannot hide growth. The desktop bundle is about 11 MB.

---

## Design & Documentation

The full design specification lives in [`docs/`](docs/) (written in Chinese): vision & principles (`00`), research (`01`), domain model (`02`), lifecycle (`03`), UX (`04`), Pi integration (`05`), system architecture (`06`), verification & honesty (`07`), attention (`08`), memory & learning (`09`), isolation & concurrency (`10`), security (`11`), visual system (`12`), performance (`13`), roadmap (`14`), decision log (`15`, ADR-001–240), registry (`16`), and went through 112 rounds of adversarial review (`docs/reviews/`).

Start here for the current codebase:
- [`docs/19-anti-chat-console-design.md`](docs/19-anti-chat-console-design.md) — Anti-"Chat UI Inertia" Flight-Deck console specification
- [`docs/17-implementation.md`](docs/17-implementation.md) — Implementation map, verification details, and design deltas
- [`docs/18-evolution-roadmap.md`](docs/18-evolution-roadmap.md) & [`ROADMAP.md`](ROADMAP.md) — P0–P2 evolution architecture and shipped milestones
- [`SECURITY.md`](SECURITY.md) — Threat model, sandbox guarantees, and all 100 CI-verified security properties

## Contributing & License

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Report security vulnerabilities privately as described in [`SECURITY.md`](SECURITY.md).

Licensed under the [MIT License](LICENSE).
