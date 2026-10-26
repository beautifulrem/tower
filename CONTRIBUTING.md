# Contributing to Tower

Thanks for helping. Tower is small on purpose; contributions that keep it quiet, honest and fast are the most welcome.

## Before you start

- Read `docs/00-vision-and-principles.md`. Most design questions are answered there or in `docs/15-decision-log.md`.
- For anything larger than a bug fix, open an issue first and describe the user problem, not the solution.
- Two rules are not negotiable, because the product depends on them:
  1. **Facts and claims stay apart.** Nothing the agent says may be shown as verified. Green is only for verifier results on the current snapshot.
  2. **Amber means "needs you".** Do not use the attention colour for warnings, progress or decoration.

## Setup

macOS 13+, Rust (pinned by `rust-toolchain.toml`), Node 22+, pnpm, git, and optionally [Pi](https://github.com/earendil-works/pi).

```sh
pnpm install
pnpm dev        # run the app with hot reload
pnpm check      # what CI runs: tsc, clippy -D warnings, all tests
```

No model credentials? `tools/demo-engine` is a scripted Pi stand-in; the README shows how to seed a demo.

## Where things live

| Change | Crate / folder |
|---|---|
| Lifecycle rules, contracts, sentinels, review units | `crates/tower-core` (pure, no I/O) |
| Persistence and projections | `crates/tower-store` |
| Talking to Pi | `crates/tower-pi`, `extensions/tower-goal` |
| Git isolation, snapshots, sealing | `crates/tower-git` |
| Running criteria | `crates/tower-verify` |
| Orchestration | `crates/tower-supervisor` |
| Interface | `apps/desktop/src` (SolidJS), styles in `src/styles` |

## Standards

- Rust: `cargo fmt`, `cargo clippy -- -D warnings`. Errors that reach the UI are written for the person reading them.
- Every lifecycle or verification change comes with a test; end-to-end behaviour goes in `crates/tower-supervisor/tests/flow.rs`.
- UI: use the semantic tokens in `src/styles/tokens.css`, never raw colours. Keep frames for exceptions; no new status colours; no spinners.
- Commits: one logical change each, imperative subject (`fix: …`, `feat: …`, `design: …`), body explaining why.

## Pull requests

Describe the user-visible change, how you tested it (with screenshots for UI), and anything you were unsure about. CI must be green.
