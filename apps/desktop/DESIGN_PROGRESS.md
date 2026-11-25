# Design evolution — progress and recovery state

Branch `design/evolution`, cut from `main` at `bf22cad` (2026-11-25). Nothing is pushed.

## Where things are

| Item | Location |
|---|---|
| Product record | `apps/desktop/PRODUCT.md` |
| Design system | `apps/desktop/DESIGN.md` |
| Final delivery report | `apps/desktop/DESIGN_DELIVERY.md` |
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
- 2026-11-25 Review of `d0dc2a1` (independent, own worktree and port 1441): **not accepted, 7.85 / 10**, no P0 or
  P1; P2-01 the no-CI board criteria cell overlapped and clipped in English at 1440/1800 (my D71 zero segment minimum,
  and a 1241–1560 grid in console.css the app.css widening never reached), P2-02 the English peek's provenance label
  fell below its statement (my D65 wrap); P3-01–P3-07. Recorded as D72–D80.
- 2026-11-25 Iteration 6 (T40–T45): 5px segment floor and a 16em criteria column from 1400 px in the file that owns
  that range, the human count to the tooltip below 1400 for a pass that doesn't count; an inline-flex provenance badge
  whose words wrap only between speaker and kind; "Review queue / 评审队列" for the queue (sidebar and Needs you, same
  count) and the title bar's count in words, "n need you"; no second ◆ or verdict on the sidebar row, peek head or the
  card's seal row; ⇧R from the peek; "Ports" in the rail; zh git line and `text-wrap: pretty` on checks; zh held-out
  hint in one line; the assumption note names no button; three tampered-canary explanations made one (seal title,
  canary line, bar). Each new test was run against `d0dc2a1` and fails there (board cell 10 of 10, peek gutter, ⇧R,
  title-bar words, said-once, ports, zh note, the welcome orphan at 1440). An iteration-5 test treated the new words
  wrapper as a word; it now checks each run and the mark whole and lets the wrapper break between runs. The seal-title
  unit test follows the consolidated wording. Gates: tsc; vitest 41 files / 220 tests; Playwright WebKit 307 passed,
  0 failed (76 shot tests skip without SHOTS; the same 3 Vite client "Importing a module script failed" logs under
  parallel load, no test fails on them); shots 69/69 (`/tmp/tower-design/iter6/shots`); line limit; bundle all JS
  163,641 / 163,840 B (199 B left, up from 22 B; the 1 KB the review asked for is not reached, D78), goal page
  11,399 / 12,288 B; detector on the changed UI files: 13 findings, all app.css and the same as at HEAD
  (`/tmp/tower-design/iter6/detect.json`).
- 2026-11-25 Review of `16ac40c` (independent, own worktree and port 1441): **not accepted, 8.03 / 10**, over the bar
  but with one P1: the peek did not keep focus, so Tab then r or ↩ typed into the quick-start field behind it and asked
  for a quick goal out of sight. No P2. P3: the 16em criteria column cost running rows their titles; G-0003's peek said
  "Verified @pin" twice; bundle headroom; 11px labels (kept); zh supervisor data (deferred). Recorded as D81–D86.
- 2026-11-25 Iteration 7 (T46–T49): one `trapTab` for the sheets and the peek; the criteria column back to 11em at every
  width, the human count of a pass that doesn't count in the cell's tooltip; the peek's head seal only when "Now" has
  none. Hardening probe (`/tmp/tower-design/harden/`, not committed): long en/zh titles, long branches and 30 more goals
  at 1040 and 1440 run past no edge; text contrast on 8 routes is at least 5.26:1 light and 5.70:1 dark (the first
  probe read nothing, as WebKit's canvas did not parse oklch — it now paints the colour and reads the pixel, checking
  63–154 texts a page); every Tab stop on 4 routes has a ring; nothing animates under reduced motion. It found money
  without grouping and a goal title cut with no tooltip (D87), both fixed. New e2e checked against `16ac40c`: the
  focus tests, the running-row title test (32 < 37) and the one-seal test fail there. Gates: tsc; vitest 41 files /
  220 tests; Playwright WebKit 314 passed, 0 failed (76 shot tests skip without SHOTS; 4 Vite client "Importing a
  module script failed" logs under parallel load, no test fails on them); shots 69/69 (`/tmp/tower-design/iter7/shots`);
  line limit; bundle all JS 163,743 / 163,840 B (97 B left, D84 deferred), goal page 11,437 / 12,288 B; detector: the
  same 13 app.css findings (`/tmp/tower-design/iter7/detect.json`).
- 2026-11-25 Review of `3145645` (independent, own worktree and port 1441, final acceptance): **PASS, 8.18 / 10**, no P0
  or P1, AC1–AC11 met; review 6's P1 and P3s confirmed fixed. New: P2-01 a long goal title crushed the short labels
  beside it (Needs you card heads, the review header's id, Operations' storage table, which also ran past its frame at
  1100 with a title at the quick start's cap), which my iteration-7 probe missed because it measured edges, not line
  counts; P3-01 a To review row said "Needs you"; P3-02 the peek head said "Running" over "Unresponsive"; P3-03 the same
  claim from two runs read as a duplicate row; P3-04 the contract's side column numbered ahead of the form. Recorded as
  D88–D92.
- 2026-11-25 Iteration 8 (T50–T53), the last of the eight: only the title gives way. The card head and the review header
  keep every item but the title on one line and unshrinkable; a data-table cell holding a truncating name takes what the
  other columns leave (`max-width: 0`), its id and verdict whole, the size columns never wrapping (the merge queue's own
  rules folded into the general one); the four truncating titles carry their whole text as a tooltip. A board row no
  longer says it needs you, in words or by a trailing ◆: what needs you is a decision line in the queue above, and the
  title bar counts those. A silent run is "Unresponsive / 无响应" in the peek head. The contract's side column goes
  unnumbered beside the form and numbers on when folded under it (CSS). P3-03 and folding the contract's advanced
  section are deferred (JS, and 60 B left). New e2e checked against `3145645`: the long-title tests fail in all six
  variants (inbox, both reviews, Operations), the no-CI row tests, both peek-head tests and the contract numbering at
  1440 fail there; the two CI-card row variants pass on both commits and stay as guards. Gates: tsc; vitest 41 files /
  220 tests; Playwright WebKit 327 passed, 0 failed (76 shot tests skip without SHOTS; 3 Vite client "Importing a module
  script failed" logs under parallel load, no test fails on them); shots 69/69 (`/tmp/tower-design/iter8/shots`); line
  limit; bundle all JS 163,780 / 163,840 B (60 B left, D84), goal page 11,424 / 12,288 B; detector: the same 13 app.css
  findings, none in console.css (`/tmp/tower-design/iter8/detect.json`).
- 2026-11-25 Review of `d6f07ef` (independent re-check, own worktree and port 1441): **PASS, 8.30 / 10**, no P0, P1 or
  P2; review 7's P2-01 fixed (600 page states: no short label wrapped, no table past its frame), its P3-02 and the
  contract numbering fixed, P3-03 deferred. Four new P3s: two from iteration 8's own fixes (the peek head called a
  silent run that was waiting for your answer "Unresponsive" over "Needs you"; the sidebar still said Needs you, and
  drew a ◆, for a goal in To review), two older (the schedule table's cron broke at 1040; the review header left a "·"
  at its end). Recorded as D93–D96. Report saved to `design-evidence/reports/review8.md` from the agent's final
  message (the agent could not write it itself).
- 2026-11-25 Review-8 fixes (T54–T56): a running goal's state is said once, by "Now", and the peek head keeps its glyph
  and id; the sidebar row reads its own group; reading cells in a data table are one token (CSS); the human count's
  dot travels inside its span. New and extended tests checked against `d6f07ef`: the sidebar/board test fails there on
  the dumped views and without CI (en, zh), all four peek-head variants fail, the long-title test from 1040 fails on
  the cron, the stats test fails on the dangling dot (G-0001 zh); CI-card variants pass on both and stay as guards.
  Gates: tsc; vitest 41 files / 220 tests; Playwright WebKit 331 passed, 0 failed (76 shot tests skip without SHOTS;
  4 Vite client "Importing a module script failed" logs under parallel load, no test fails on them); shots 69/69
  (`/tmp/tower-design/iter8b/shots`); line limit; bundle all JS 163,720 / 163,840 B (120 B left), goal page
  11,437 / 12,288 B; detector: the same 13 app.css findings (`/tmp/tower-design/iter8b/detect.json`). Curated
  `design-evidence/*.after.webp` re-rendered from these shots. These fixes are verified by tests, not independently
  re-reviewed; the acceptance stands on `d6f07ef`. `DESIGN_DELIVERY.md` is the final report.
- 2026-11-25 Perf project on `3b11e8e` (not part of the default gate command): passes. Board of 50 goals 549 / 265 / 185 ms
  against the seeded board's 179 / 167 / 116 ms; view switches with 50 goals 31–67 ms (`/tmp/tower-design/iter8b/checks/perf.log`).
- 2026-11-25 Iteration 9 — the owner's remaining list, all of it (T57–T67, D20, D22, D23, D51, D58, D84, D86, D91,
  D92, D96, D97, docs/12). Bundle headroom first: the dictionaries ship their keys once (`plugins/localeKeys.ts`),
  165,126 → 160,049 B of 163,840, no budget raised. Then the deferred P3s, each with an e2e test run against
  `4d0b9c4` in a separate worktree: 14 new UI tests fail there and pass here (the D22, D91, D92, D96, D20, D58 tests,
  the D23 identity test and the held-pass test); the language tests pass on both, as they should: D51/D86 was the test
  data (Chinese tests read English supervisor views), fixed in `tools/e2e.sh`. The new D92 test caught its own first
  version breaking a setting under the chevron in the 280 px side column; fixed before the gates. D58: the supervisor's
  `progress.qualified` and the high-finding hold (Rust), "Verified, with caveats" on every seal, two presses to
  accept. docs/12 reconciled to the code by a docs-only agent, checked here; four specs of unbuilt components left as
  specs. Packaged app: debug `Tower.app` on a seeded `TOWER_HOME`, demo engine only, looked at through the
  accessibility tree (`design-evidence/packaged-app/`); review, research and critique reports committed in
  `design-evidence/reports/`. Gates: tsc; vitest 43 files / 230 tests; Playwright WebKit 353 passed, 0 failed (76
  shot tests skip without SHOTS); shots 69/69 (`/tmp/tower-design/iter9/shots`); perf passes (board of 50:
  468 / 253 / 184 ms against 196 / 221 / 111 ms; switches 34–89 ms against 16–29 ms); line limit; bundle all JS
  160,049 / 163,840 B, start-up 54,859 / 65,536 B, goal page 11,573 / 12,288 B; doc numbers; rustfmt, clippy
  `-D warnings`; cargo test (see the delivery report for one test that failed once under parallel load); detector:
  no new finding (the 3 `side-tab` hunk-pen findings are the baseline's, kept by decision).
- 2026-11-25 Independent review of `7a23f45` (general-purpose agent as reviewer, read-only worktree, own ports): **PASS
  8.28 / 10**, no P0 or P1; R9-P2-01, R9-P3-01–07 and three docs/12 places, recorded as D98–D106
  (`design-evidence/reports/review9.md`). Reviewer worktree removed.
- 2026-11-25 Iteration 10 — every review 9 finding (T68–T75). An accepted goal keeps its caveats on the stamp and the
  glyph (●*). The review header fits by measuring (`review/fitStats.ts`) so the verdict goes last at every width; the
  run pickers became run-name faces over the native select, whose pins go before the criteria words; key caps go
  only for the seal, and the buttons' tooltips say the shortcut. The ledger's runs note is text-3, under the claim.
  The evidence strip reads the supervisor's own test-machinery list. The folded engine clause names non-default
  settings. The board says an overlap in words after the row's own id. The "$" bug was a class collision (`.unit`);
  the field's unit is now `.field-unit` and its padding measured. docs/12's last three places said as built.
  `fitStats` moved out of `Review.tsx` (line limit). Checked against `7a23f45` by restoring its sources under the new
  tests: 13 e2e and 2 unit tests fail there, pass here. Gates: tsc; vitest 43 files / 233 tests; Playwright WebKit
  366 passed, 0 failed (76 shot tests skip without SHOTS); shots 69/69 (`/tmp/tower-design/iter10/shots`); perf
  passes (board of 50: 564 / 230 / 176 ms against 170 / 161 / 107 ms; switches 35–64 ms against 19–39 ms); line
  limit; bundle all JS 160,896 / 163,840 B, start-up 55,129 / 65,536 B, goal page 11,588 / 12,288 B; doc numbers;
  detector: nothing new. No Rust changed. Not yet independently re-reviewed.
- 2026-11-25 Independent review of `deef352` (general-purpose agent as reviewer, read-only worktree, ports 1441–1442):
  **PASS 8.20 / 10**, no P0 or P1. Iteration 10's fixes confirmed, R9-P2-01 mostly and R9-P3-03 partly; one new P2 from
  iteration 10 (the overlap note squeezes the title, D107) and five P3s, recorded as D107–D112, open
  (`design-evidence/reports/review10.md`). Its e2e run was 362/4 by the plain command (fonts 403 through the symlinked
  node_modules) and 366/0 with fonts served. Reviewer worktree removed.
- 2026-11-25 Iteration 11 — every review 10 finding (T76–T81) and the empty settings test. The board's overlap note
  gives way before the title: measured per row, it keeps its ◇ alone when the title would show less than all of a short
  title or 12em of a long one (the peek button's room kept, so hovering never flips it), and the title column's floor is
  16em at 1241–1560. Every seal of a goal accepted or merged with caveats says they were taken with it; the merged ring
  keeps the gap (◉*). The run pickers: one option per point, the select holding what its face says, names worded in
  the interface language from kind, run and time ("Verification", not "Verified", for the verifier's point). The
  ledger's runs note is 11px and worded as a note ("said in runs 1 and 2"). A caveat on the evidence strip is a
  neutral pill in the seal's words; a high finding is named for what was done; the weakened-assertion sentinels, which
  the strip called "runner patched", say "assertions weakened". The unit test checks Chinese settings and must find a
  unit. Checked against `deef352` by restoring its sources under the new tests: 12 e2e and 5 unit tests fail there,
  pass here (the picker also by a name-free variant); the three unit-clearance cases pass there too, as guards.
  Gates: tsc; vitest 43 files / 236 tests; Playwright WebKit 374 passed, 0 failed (76 shot tests skip without
  SHOTS); shots 69/69 (`/tmp/tower-design/iter11/shots`); perf passes (board of 50: 664 / 282 / 198 ms against
  247 / 167 / 109 ms; switches 30–82 ms against 15–46 ms); line limit; bundle all JS 161,693 / 163,840 B, start-up
  55,478 / 65,536 B, goal page 11,596 / 12,288 B; doc numbers; detector: 0 anti-patterns, 2 advisories on older
  lines. No Rust changed. Not yet independently re-reviewed.
- 2026-11-25 Independent review of `2f1d0c5` (general-purpose agent as reviewer, read-only worktree, ports 1441–1442):
  **PASS 8.38 / 10**, no P0, P1 or P2. Iteration 11's fixes confirmed (R10-P3-04 for one finding); the new tests fail
  on `deef352` for the right reasons. Four P3s, recorded as D113–D116, open: the overlap note's hover room hides its
  words where the row fits them (from iteration 11), a neutral caveat pill beside a held pass, picker names lost on a
  refresh or scope switch, and older hard cuts in the live and identity columns
  (`design-evidence/reports/review11.md`). Its e2e run was 369/5 by the plain command (fonts 403 through the
  symlinked node_modules) and 374/0 with fonts served. Reviewer worktree removed.
- 2026-11-25 Iteration 12 — every review 11 finding (T82–T85). The board's overlap note is decided on the row at rest
  and gives way a step at a time ("◇ Overlaps G-0003", "◇ G-0003", the ◇), saying as much as leaves the title its
  room; from 1561 the title column keeps the floor it has below, so it goes 366 → 352 px across the step. The evidence
  strip says each family by its weightiest finding, and a pass a high finding holds draws no neutral caveat pill. The
  run pickers key a point by kind, run and rev, the review keeps the points you picked, and an end that left the list
  is named ("No longer listed @15085f2"). The live seal and the identity column give way by measure (`lib/refit.ts`):
  the seal's word, then the seal, never a green mark without its pin; the engine's name, the PR's quieter readings,
  the project's name, the word "muted", each into the title's tooltip. Checked against `4ea4567` by restoring its
  sources under the new tests: 8 e2e and 3 unit tests fail there, pass here; each for the review's reason except the
  older crowded-row test, which fails only on the renamed `data-crowded` value.
  Gates: tsc; vitest 43 files / 239 tests; Playwright WebKit 377 passed, 0 failed (76 shot tests skip without
  SHOTS); shots 69/69 (`/tmp/tower-design/iter12/allshots`); perf passes (board of 50: 713 / 303 / 198 ms against
  239 / 184 / 123 ms; switches 30–110 ms against 16–61 ms); line limit; bundle all JS 162,269 / 163,840 B, start-up
  55,749 / 65,536 B, goal page 11,597 / 12,288 B; doc numbers; detector: the three triaged `side-tab` findings and
  10 advisories, none on a changed line. No Rust changed. Not yet independently re-reviewed.
