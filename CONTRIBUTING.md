# Contributing to Tower

Thanks for helping. Tower is small on purpose; contributions that keep it quiet, honest and fast are the most welcome.

## Your first 30 minutes

1. `pnpm install && pnpm dev` and choose **Try a demo goal** on the welcome screen: one goal runs end to end without Pi or credentials.
2. Read `docs/17-implementation.md` (one page): what is built, how a goal moves through it, and where the code differs from the design.
3. Run `pnpm check` (what CI runs). The fastest loops are `cargo test -p tower-core` (pure rules: lifecycle, sentinels, review units) and `pnpm --dir apps/desktop test`.
4. Pick an issue labelled `good first issue`, or a sentinel case Tower misses: add it to `crates/tower-core/tests/sentinel_corpus.rs` first, then make it pass.

For interface work, also read `apps/desktop/PRODUCT.md` (who it is for) and `apps/desktop/DESIGN.md` (its rules: colour, type, marks, motion).

The full design (`docs/00`–`16` and the decision log) is there when you need the reasoning behind a rule; you do not need to read it to start.

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
tools/e2e.sh    # the interface in WebKit, against views dumped from a real supervisor (CI runs it too)
SHOTS=/tmp/shots tools/e2e.sh e2e/shots.spec.ts   # render every screen to PNG; the final-* ones are the README's pictures
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
| Interface | `apps/desktop/src` (SolidJS), styles in `src/styles`, end-to-end tests in `apps/desktop/e2e` |
| The phone page | `crates/tower-supervisor/src/remote.html` (one file, served by `remote.rs`) |

## Standards

- Rust: `cargo fmt`, `cargo clippy -- -D warnings`. Errors that reach the UI are written for the person reading them.
- Every lifecycle or verification change comes with a test; end-to-end behaviour goes in `crates/tower-supervisor/tests/flow.rs`.
- UI: use the semantic tokens in `src/styles/tokens.css`, never raw colours. Keep frames for exceptions and add no status colours. Status is a drawn mark from `components/Glyph.tsx`, never a text character or an emoji. The only loops are a running goal's turning ring and the live line of the goal in view; nothing else spins or pulses, and everything stands still under reduced motion. `apps/desktop/DESIGN.md` has the full rules.
- The interface has JavaScript budgets (`tools/bundle-budget.sh`: start-up, the goal page, everything together). A change that adds code has to fit them.
- Commits: one logical change each, imperative subject (`fix: …`, `feat: …`, `design: …`), body explaining why.

## Pull requests

The template asks four things: what changes for the user, how you tested it (with screenshots for UI), the risk, and how to revert. Say what you were unsure about. CI must be green.
