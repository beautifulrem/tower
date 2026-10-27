# Contributing to Tower

Thanks for helping. Tower is small on purpose; contributions that keep it quiet, honest and fast are the most welcome.

## Your first 30 minutes

1. `pnpm install && pnpm dev` and choose **Try a demo goal** on the welcome screen: one goal runs end to end without Pi or credentials.
2. Read `docs/17-implementation.md` (one page): what is built, how a goal moves through it, and where the code differs from the design.
3. Run `pnpm check` (what CI runs). The fastest loops are `cargo test -p tower-core` (pure rules: lifecycle, sentinels, review units) and `pnpm --dir apps/desktop test`.
4. Pick an issue labelled `good first issue`, or a sentinel case Tower misses: add it to `crates/tower-core/tests/sentinel_corpus.rs` first, then make it pass.

The full design (`docs/00`–`16`, the decision log and 112 review rounds) is there when you need the reasoning behind a rule; you do not need to read it to start.

## Before you start

- Most design questions are answered in `docs/00-vision-and-principles.md` or `docs/15-decision-log.md` (search it; it is long).
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
ln -sf ../../tools/pre-push.sh .git/hooks/pre-push   # formatting, lints, types and tests before every push
tools/ship.sh   # from a branch: open a pull request that merges itself once CI passes (main takes nothing else)
TOWER_SHIP_LOCAL=1 tools/ship.sh   # when GitHub's runners are unavailable: merge on the strength of the pre-push run (maintainers)
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
| Orchestration | `crates/tower-supervisor` (`run` engines, `control` pause/resume, `verify`, `jail` sandboxes, `pr` pull requests) |
| Interface | `apps/desktop/src` (SolidJS), styles in `src/styles` |

## Standards

- Rust: `cargo fmt`, `cargo clippy -- -D warnings`. Errors that reach the UI are written for the person reading them.
- Every lifecycle or verification change comes with a test; end-to-end behaviour goes in `crates/tower-supervisor/tests/flow.rs`.
- UI: use the semantic tokens in `src/styles/tokens.css`, never raw colours. Keep frames for exceptions; no new status colours; no spinners.
- Commits: one logical change each, imperative subject (`fix: …`, `feat: …`, `design: …`), body explaining why.

## Pull requests

Describe the user-visible change, how you tested it (with screenshots for UI), and anything you were unsure about. CI must be green.
