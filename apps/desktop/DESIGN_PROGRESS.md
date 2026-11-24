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
- 2026-11-25 Milestone review of `aa1026b` (independent, own worktree and port): **not accepted, 7.4 / 10**; P1-01 board
  Space, P1-02 clamped high-sentinel prose, P2-01–P2-04, P3-01–P3-08. Recorded as D08 (reopened), D09, D12, D28–D37.
- 2026-11-25 Iteration 3 (T20–T26): Space peeks a decision line; high sentinels and their review notes readable whole;
  one tone per pill meaning; decision lines carry glyph and verdict; fold path beside its own title; R and "Open
  changes" only with changed files; one "Review n files" action; accept sheet blockers before the stamp, reasons as
  words; contract masthead, optional title, MicroVM reason; review code paints with its line numbers (colours tint in);
  zh hunk mark 标为已读. Own audit found CSS `::before` middle dots the text-node check could not see (D38): four
  replaced by gaps, the e2e check now reads pseudo-elements on nine routes (verified failing on the old CSS).
  Operations: zone on Next/Last, storage bars as share of the total. Detector on changed files: the same three
  triaged `side-tab` warnings (`/tmp/tower-design/detect-iter3.json`). Shots in `/tmp/tower-design/iter3/shots`.
- 2026-11-25 Review of `3faaf0c` (independent, own worktree and port 1441): **not accepted, 7.2 / 10**; P1-01 a
  not-evidence pass read as ready with a green seal on the inbox card and in the peek, P1-02 green CI count and legend
  steps; P2-01–P2-05, P3-01–P3-08. Recorded as D41–D58 (D58 is a product question for the owner).
- 2026-11-25 Iteration 4 (T27–T33): one `notEvidence()` verdict behind every seal, status word and glyph; neutral CI
  counts; criteria head ≤ 600 px in all four variants (578 / 560 / 588 / 542); one review queue and a global ⇧R; peek R
  only with changes; reviewed / read; `titleFrom`; aligned decision-line slot and lowercase hints; matching accept
  summary; one trust-tier lookup (mock corrected to the supervisor); held-out path first in the low fold; refusal
  output said once, and the zh refusal now parsed at all; steer pill translated. New `e2e/verdict.spec.ts` (13 tests).
  The bundle went 234 B over the total after the fixes; paid back by removing repetition (ghost "Open changes",
  Cause's copies of failed rows, dead `FlakyLine`), a shorter look-sheet line, hints from existing words and smaller
  helpers — no budget raised. Gates: tsc; vitest 41 files / 220 tests; Playwright WebKit 245 passed, 0 failed (76 shot tests skip without SHOTS);
  shots 69/69 (`/tmp/tower-design/iter4/shots`); line limit; bundle all JS 163,810 / 163,840 B (30 B left), goal page
  12,106 / 12,288 B; detector: no new findings.
- 2026-11-25 Review of `815bd99` (independent, own worktree and port 1441): **not accepted, 7.2 / 10**; P1-01 the
  peek's exits threw a stale-value error on every goal (my D48 fix had hidden R, not fixed the cause), P1-02 a no-CI
  goal whose pass doesn't count filed under "To accept" with a board bar that didn't say so; P2-01–P2-05, P3-01–P3-08.
  Recorded as D59–D70.
- 2026-11-25 Iteration 5 (T34–T39): peek exits read the id before closing; "To review / 待评审"; a per-goal count of
  passes that don't count, read by every bar given an `id`; middle dots out of attributes, a `::before` and two locale
  tags, with an e2e sweep over 9 routes and 5 overlays in both languages that reads aria-label, title and placeholder;
  neutral suggestion rule; "Mark reviewed"; one `qualifiers()` for the goal page and the readout; merge-queue verdict;
  provenance runs that wrap between words; one ◆ per board line; palette in queue order; env phrase once; the board
  re-selects the goal you come back from. My own look at the no-CI board found the 11em criteria cell cutting the new
  words and the withheld seal's pin at 1100 px (D71): the tiny bar now says the words instead of "2/3", segments narrow
  first, the line drops the seal; e2e measures the words inside the cell. New tests were checked against the old code
  (peek exits, dot sweep, clipping all fail there). Gates: tsc; vitest 41 files / 220 tests; Playwright WebKit 284
  passed, 0 failed (76 shot tests skip without SHOTS; the run logs 3 Vite client "Importing a module script failed"
  rejections under parallel load, none in a single-worker run of the new spec, no test fails on them); shots 69/69
  (`/tmp/tower-design/iter5/shots`); line limit; bundle all JS 163,818 / 163,840 B, goal page 11,381 / 12,288 B (the
  DecisionCard read and the virtual badge removed, qualifiers moved out of the goal chunk); detector: the same 15
  findings as at HEAD (13 app.css, 2 unchanged workbenches.css lines), nothing new.
