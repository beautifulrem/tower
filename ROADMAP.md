# Roadmap

What has shipped and what comes next. The reasoning is in `docs/00` (vision), `docs/14` (the design's own roadmap) and `docs/18-evolution-roadmap.md`; the detail of each change is in [`CHANGELOG.md`](CHANGELOG.md).

## Shipped

**Verification that holds up against a cheating agent**

- Six steps on a pinned snapshot in a clean, credential-free checkout: base run, visible criteria, held-out tests, source-only re-run, tamper checks, perturbation and one flaky re-run.
- Tree-sitter analysis (`crates/tower-ast`) for Rust, JavaScript, TypeScript, Python and Bash. It finds inline test blocks, weighs special cases and folds moved or reformatted code in review.
- An assertion-identity check that runs while the criteria run, a must-fail canary, and held-out files that prove one by one that they ran.
- Held-out test drafts Tower proposes and you approve before they count.

**Sandboxing**

- A deny-by-default macOS Seatbelt profile per goal, for the agent's shell and for its file tools through a sandboxed helper process.
- Prompt-instruction files and hard links are closed inside the workspace. Each goal has its own block of 10 loopback ports.
- A confined browser takes `look` screenshots at desktop and phone sizes and records the page's console errors.

**Engines**

- Pi over its native RPC, and Claude Code, Codex CLI, Gemini CLI and OpenCode over ACP, each with an explicit trust tier and a gate that refuses any tool outside Tower's.
- A POSIX shell parser in front of every command, `submit(outcome: "blocked")` for an agent that is stuck, an early pause for an agent that keeps probing outside its workspace, and image attachments in prompts.

**Learning and operations**

- Rules mined from your review comments and from failed checks, with taint tracking and your approval before any rule is used. Per-model results.
- Scheduled goals, a merge queue with conflict prediction, `depends_on` between goals, disk use per goal with safe cleanup, and model escalation in steps.
- A phone page and ntfy pushes for when you are away. Both are off by default.

**The interface**

- A board of goals with what needs you on top, a quick peek, a contract editor, the goal page, and a full-window review with a snapshot timeline and the acceptance seal.
- The 2026-11 design pass (25 iterations, each read by an independent review): one verdict everywhere with the snapshot it was measured at, status marks drawn as one family, Tower's own actions named in the trace, and a phone page that repaints only what changed. `apps/desktop/DESIGN.md` holds the rules it settled.

## Written, not yet in use

- **Linux and MicroVM sandboxes.** The Linux backend (`bubblewrap`, Landlock, cgroups v2) and the Apple Containerization MicroVM backend (macOS 26+, Apple Silicon) are written and unit-tested, but no run uses them yet. Today only macOS Seatbelt sandboxes a goal. A contract can already name the MicroVM tier and the interface shows it, but that goal still runs under Seatbelt. On Linux and Windows the agent's commands are fenced by path only, and the environment check says so.
- **The real-model anti-cheat regression.** `tools/adversarial.sh` exists and does not pass yet. `docs/17-implementation.md` §17.7 lists the classes it still misses.

## Next

- **A signed release.** Apple notarization and the update-signing keys need to be set as CI secrets (`RELEASING.md`). Until then Tower is built from source.
- **The adversarial run in CI.** `.github/workflows/adversarial.yml` runs `tools/adversarial.sh` nightly with a real model once the repository variable `TOWER_ADVERSARIAL` is `on` and the `CLINE_API_KEY` secret is set. Until then each run reads "skipped".
- **Sandboxes beyond macOS.** Wire the Linux backend into runs and test it on a real kernel in CI.
- **Remote and multi-machine runs.** An optional `serve` daemon and remote workspace runners, under the same contract and verification rules.

Have a use case that does not fit? Open an issue describing the problem.
