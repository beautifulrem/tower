# Design evolution — progress and recovery state

Branch `design/evolution`, cut from `main` at `bf22cad` (2026-11-25). Nothing is pushed.

## Where things are

| Item | Location |
|---|---|
| Product record | `apps/desktop/PRODUCT.md` |
| Design system (to be written) | `apps/desktop/DESIGN.md` |
| Audit consolidation, contract, reviews | `apps/desktop/DESIGN_REVIEW.md` |
| Roadmap and task status | `apps/desktop/DESIGN_ROADMAP.md` |
| Curated before/after evidence (committed) | `apps/desktop/design-evidence/` |
| Working evidence (not committed) | `/tmp/tower-design/` — `baseline/shots`, `fixtures`, `research.md`, `impeccable-A.md`, `impeccable-B.md`, `review-baseline/report.md` |
| Frozen baseline checkouts (not committed) | `/tmp/tower-design/wt-baseline` (reviewer, port 1441), `/tmp/tower-design/wt-baseline-b` (detector, port 1442) |

## How to re-render

```sh
# first run builds the Rust supervisor and dumps real views
SHOTS=/tmp/tower-design/<name>/shots tools/e2e.sh e2e/shots.spec.ts
# afterwards, without cargo
cd apps/desktop && SHOTS=/tmp/tower-design/<name>/shots E2E_FIXTURES=/tmp/tower-design/fixtures \
  ./node_modules/.bin/playwright test e2e/shots.spec.ts --project=webkit
```

## Baseline engineering state (bf22cad)

- `tsc --noEmit`: clean. Vitest: 41 files, 216 tests, all pass. Shots: 69/69 pass.
- `tools/line-limit.sh`: pass.
- `tools/bundle-budget.sh` (after `vite build`): start-up 53,935 / 65,536 B; on-demand 108,807 / 110,592 B;
  all JS 162,742 / 163,840 B; goal page 11,707 / 12,288 B. **Under 2 KB of headroom** — every change must pay
  for its JavaScript.

## Log

- 2026-11-25 Phase 0–1: branch, deps, baseline shots, PRODUCT.md (inferred, owner asked for no interview).
- 2026-11-25 Phase 2–4: external research done; Unslop diagnosis (light slop → polish in the existing direction);
  independent reviewer, Impeccable critique A and detector B running against the frozen baseline.
- 2026-11-25 Phase 4–8: consolidated D01–D27 (`DESIGN_REVIEW.md`); three directions sketched, critic chose C1
  (evidence-first goal page) with conditions; Design Contract AC1–AC11 and roadmap T01–T19 written.
- 2026-11-25 Iteration 1 — commit `bf31644` (T01–T08): opaque reading sheets, plain verdict copy and plurals,
  reading text ≥ 12px, contract order and masthead, neutral statistics, accept-sheet reasons, one status word,
  stable board selection. Gates green.
- 2026-11-25 Iteration 2 — commit `aa1026b` (T09–T17): evidence-first goal page, one-strip criterion rows, agent
  claims labelled, review fold guard and visible risk reason, neutral queue focus and one ◆, "To review" starts the
  queue, empty board without ghosts, contract focus, approve wording, docs/12 and docs/19 updated. Gates: tsc,
  vitest 218/218, e2e 220/220, line limit, bundle (163,402 / 163,840 B). Shots in `/tmp/tower-design/iter2/shots`.
  Independent milestone review started against a read-only worktree at `aa1026b`.
- 2026-11-25 While the review runs (uncommitted): D14 hunk mark renamed "Mark read" in English; D21 empty review on
  the title's line without the wordmark; D16 fractional mono sizes kept by decision (recorded); axe on the rich goal
  page, inbox, risky review and new contract in both themes (8 tests, pass). T18, T19, D22 stay deferred.
