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
  room; from 1561 the title column keeps the floor it has below, so it goes 370 → 352 px across the step. The evidence
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
- 2026-11-25 Independent review of `886ab38` (general-purpose agent as reviewer, read-only worktree, ports 1441–1442):
  **PASS 8.42 / 10**, no P0, P1 or P2. Iteration 12's fixes confirmed, the identity column's in part; the new tests
  fail on `4ea4567` for the right reasons. Two P3s, recorded as D117–D118: a merged or closed PR with rework still ran
  past the identity's last step ("⟳3/" at 1440), and the PR readings a step set aside were in neither the tooltip nor
  the button's name, a short project name held 3.5em, a separator's gap stayed (`design-evidence/reports/review12.md`).
  Its e2e run was 373/4 by the plain command (fonts 403 through the symlinked node_modules) and 377/0 with fonts
  served. Reviewer worktree removed.
- 2026-11-25 Iteration 13 — both review 12 findings (T86–T87) and two of its record-only notes. The identity gives way
  in this order: the engine's name, the PR's quieter readings, "muted", the project's name (which may first shorten
  to 3.5em), the PR's state, and last the whole identity folds into the tooltip, as below 1241: the last step always
  fits. What a step
  sets aside leaves the line but not a screen reader; the title's tooltip says the whole identity, the PR in words; the
  PR button's name is its own text with its counts said in words (the first full run had a label laid over it, and
  axe's `label-content-name-mismatch` failed the inbox in both themes; fixed before the commit). A project name takes
  its own width; the separator goes with the counts. A run picker's gone end keeps its pin in a narrow header.
  Checked against `886ab38` by restoring its sources under the new tests: 5 e2e fail there (the four sweeps: `lib` 42 px
  for 13 px of text, the name "PR merged" with the identity past its column; the picker: the gone end's pin hidden at
  1100), pass here. Gates: tsc; vitest 43 files / 239 tests; Playwright WebKit 379 passed, 0 failed (76 shot tests
  skip without SHOTS); shots 69/69 (`/tmp/tower-design/iter13/allshots`); perf passes (board of 50: 1082 / 466 / 252 ms
  against 269 / 254 / 196 ms; switches 49–179 ms against 32–73 ms); line limit; bundle all JS 162,638 / 163,840 B,
  start-up 56,037 / 65,536 B, goal page 11,597 / 12,288 B; doc numbers, once the two READMEs and docs/17 quote the
  build's 55 KB start-up and 159 KB total (they said 54 and 157; the check allows 1 KB); detector: the three triaged
  `side-tab` findings and 12 advisories, none on a changed line. No Rust changed. Not yet independently re-reviewed.
- 2026-11-26 Independent review of `3ff2ebf` (general-purpose agent as reviewer, read-only worktree, ports 1441–1442):
  **PASS 8.47 / 10**, no P0, P1 or P2. Iteration 13's fixes confirmed: the identity's last step always fits, the PR is
  said in the tooltip and the button's name, short names take their own width. 5 of its 6 new e2e fail on `886ab38` for
  the right reasons. Two P3s, recorded as D120–D121: a project name squeezed to ≤ 1 px counted as set aside (a sliver,
  a reversed order, steps going back, in 1–2 px bands), and a gone end's kept pin cut the criteria bar at en 1040–1052
  (`design-evidence/reports/review13.md`). Reviewer worktree removed.
- 2026-11-26 Status marks and motion (D119, T88), on the owner's word: the red square, the amber diamond and the blue
  half disc, and crude UI like them, were to go, with good agent front ends, design systems and motion libraries as
  the reference. Researched through context7 (Primer Octicons and colour roles, Geist StatusDot and Badge, Lucide,
  Vercel AI Elements' Shimmer, Motion's springs in CSS, Animate UI, Magic UI). One mark family: a disc with its symbol
  as a hole (! amber, × red, an outlined i), each one even-odd path, so the symbol shows the ground it sits on; the
  stylesheets' text marks (■ ◆ ◇) became masks of the same paths, and the phone page shares them (a unit test holds
  the three equal; one mutated path fails it). Running and verifying turn a quarter arc on a faint ring, the runs
  gauge is that mark, paused keeps its ring. Segments are capsules on a track, observed hatched, filling in place.
  Springs from Motion's formula, generated with no overshoot after the detector named the first one's 1.4% bounce.
  The shimmer runs only on the goal in view (a board of running goals keeps still words beside turning marks), and
  everything stands still under reduced motion. Evidence pills went back to the 4 px chip corner (they hold words).
  DESIGN.md, its sidecar, PRODUCT.md principle 2 and docs/12 §12.6–§12.7 rewritten to say so. Gates: tsc; vitest 42
  files, 241 tests; e2e 380/0; shots 69/69; perf (50-goal board medians 596 against 323 ms, switches within 150 ms);
  line limit; bundle 162,671 / 163,840 B, start-up 56,058 B, goal page 11,600 B; doc numbers; detector triaged in
  `DESIGN_REVIEW.md`. On `3ff2ebf`'s sources (a separate worktree, the new tests copied in) 5 unit and 2 e2e tests
  fail for the right reasons; the switch test, only taught to ignore endless animations, passes there. Before/after:
  `design-evidence/marks-*.webp`.
- 2026-11-26 Iteration 14 — review 13's two P3s (T89–T90) and two of its record-only notes. The board identity's
  project name is set aside by its step, never by its width: a name flex squeezes to nothing is a cut one, so before the
  project step a shortened name keeps min(its own width, 3.5em) or the next step is taken (the sweep is now every 1 px
  from 1241 to 1561, plus 1600, 1728, 1800). The review header's verdict outlasts a gone end's pin: fixing it showed
  the key caps step had never run since iteration 10 (`fitStats` looked the header up when Solid called the ref,
  before the line was in it), and that a criteria bar's box always fits while its segments are clipped inside it. Now
  the header is found on each fit and observed (the caps' going re-fits in the same frame), the verdict is the seal and
  the segments, each against every box that clips it, and after the caps a gone end's pin goes. `.g-id` keeps its
  line's height when folded (no ResizeObserver loop), and a folded PR button leaves the Tab order. A third sweep,
  review 13's stress row, reaches the fold. Checked on `1c9af8a`'s sources, one file set at a time: the sweep fails
  (G-0002's name 0.297 px at en 1246), the picker fails (both segments cut, the seal gone, at en 1040), the stress
  sweep fails on 2 loop notices with the old stylesheet and on a Tab stop with the old row and PR line; all pass here.
  Gates: tsc; vitest 42 files / 241 tests; e2e 382/0; shots 69/69 (`/tmp/tower-design/iter14/allshots`); perf (board
  of 50: 1541 / 772 / 435 ms against 442 / 451 / 329 ms; switch medians 149.5 against 79 ms); line limit; bundle
  162,773 / 163,840 B, start-up 56,115 B, goal page 11,598 B; doc numbers; detector the same 19 findings as `1c9af8a`.
  The sweeps now take the 120 s budget the layout sweeps had (one timed out at 30 s under five workers). No Rust
  changed. Not yet independently re-reviewed.
- 2026-11-26 Review 14 (independent, `1ad1439`): PASS 8.35 / 10; R14-P2-01 (the running mark turned on runs waiting
  on you or silent, in the sidebar and the gauge), R14-P3-01 (a segment's `::after` filled under reduced motion),
  -02 (the shimmer cost a quarter of a core), -03 (✓ ✕ ○ in the held-out file list), -04 (the phone strip's 9 px !),
  and seven record-only notes. Saved as `design-evidence/reports/review14.md`.
- 2026-11-26 Iteration 15 — review 14's five (T91–T95) and every note left open from reviews 12–14 (T96–T110). One
  `moving(goal, now)` in `lib/labels.ts` decides every loop: the mark turns only where you watch work (board row, goal
  page, peek; the runs gauge while some run moves; the phone the same) and holds still in lists and on runs waiting on
  you or silent. The shimmer is a band of the line's own ground over the words, clipped to them and moved by transform
  (CPU at rest 9–11 % of a core against 33–38 %). Reduced motion reaches `::before`/`::after`. The held-out list names
  only the files that ran; the phone strip's ! is 12 px; the title bar's errors and engine-down wear the red × disc;
  the phone's middle dots and the text × buttons are gone. From older notes: a gone end shortens to "Gone" and its pin
  before the key caps go; the app selects only text worth copying (WebKit needed the prefix); a closed or merged PR
  keeps its state at the pr-state step; rework is read once; a project's name shortens only after "muted" goes (review
  13's no-PR row added to the sweeps, whose step-back check now holds that rule); a decision line with no project to
  name gives its question the identity column; a held pass names the high finding on another criterion that holds
  it; a merged human-only goal has a hatched core. Kept by decision: the × at DPR 1 (D128), caveats on a seal that
  does not count (D139), a held pass's amber caveat (D140). Each fix's test fails on `1ad1439`'s sources (checked by
  swapping the sources back, one set at a time). Gates: tsc; vitest 42 files / 245 tests; e2e 395/0; shots 69/69
  (`/tmp/tower-design/iter15/allshots`); perf (board of 50: 1664 / 512 / 399 ms against 340 / 313 / 216 ms; switch
  medians 117 against 45 ms); line limit; bundle 163,064 / 163,840 B, start-up 56,292 B, goal page 11,523 B; doc
  numbers; `cargo test -p tower-supervisor remote` 4/4; detector 20 findings against 21 (the shimmer's
  `gradient-text` gone). Not yet independently re-reviewed.
- 2026-11-26 Iteration 15 follow-up — its own pixel checks (DPR 2, light and dark; `/tmp/tower-design/iter15/visual`)
  confirmed the shimmer band changes no ground pixel on the goal page or in the peek and only the words' own, the
  hatched merged core reads at 12 px, the chip and panel buttons sit at their sizes, and found two older faults: the
  phone's "Live" wore the verifier's green (D142, T111) and silence was a red ring in the title bar and on the phone
  where docs/12 §12.4.3 and docs/08 §8.6.3 draw the uncoloured hint mark (D143, T112). Both fixed, each with a test that
  fails on `ae1c049`. Also: the phone's action and target are two words (a real space); the D rows' evidence paths and
  D137, D139, D140's wording corrected; docs/12's two "differ only by colour" leftovers gone. Gates: tsc; vitest 42 /
  245; e2e 394 + the phone test made deterministic (10/10 under five workers, phone suite 17/17); shots 69/69; perf
  alone (board of 50: 672 / 394 / 215 ms against 280 / 183 / 148 ms; switch medians 72 against 29 ms); line limit; doc
  numbers; cargo remote 4/4; bundle 163,047 / 163,840 B; detector unchanged on the touched files (17 against 17).
- 2026-11-26 Review 15 — independent (`2408609`): FAIL — 8.285 / 10, above 8.0, but one open P1 (the phone drew the verifier's green on
  every goal to accept), one P2 (held-out files under the wrong line), five P3s (a path's "C9" read as a criterion; a
  wrapped evidence strip 18px off; titles, ids, pins, commands and paths not copyable; "Unresponsive" for the desk's
  own reading of silence; "No sandbox" in amber) and record-only notes. Saved as `design-evidence/reports/review15.md`.
- 2026-11-26 Iteration 16 — review 15's seven (D144–D150, T113–T119) and every record-only note (D151–D156,
  T120–T124). The phone's goals to accept are green only when the verifier's pass counts, with its pin; otherwise the
  amber ! and "Passed, doesn't count", or the dashed neutral ring and "Not machine-verified". On the phone a run inside
  a tool call (mode reading, editing or executing) is busy, never silent, and the header says the tool and how long it
  has run; a run that waits on you says Needs you with the !, a silent one Silent with the hint mark. The held-out files
  that ran sit right under their count; a finding names only the goal's own criteria; the evidence strip spaces by gap
  and gives a tag's 6px hang back on the trailing side, so every wrapped line keeps the title's edge; titles, ids,
  pins, commands, paths and diff lines select (a pointer's focus stays on the diff table, Tab still lands on its first
  line); "No sandbox" is ink with the hint mark; the title bar's running mark is 12px on the desk and the phone; the
  shimmer's band is a quarter of a short word. docs/12: the PR step without ■, Tower's own failures on the red list, the
  title bar's sandbox and phone-off gauges; references to §12.2 corrected to §12.4.3. Kept: D136, D137, the phone's
  hollow rows, D128, `┆` (D156). Each fix's test fails on `2408609`'s sources (one file set at a time; the phone badges
  also with only the old badge code). Gates (run alone): tsc; vitest 42 / 246; e2e 403/0 on the first full run, then
  the phone suite 19/19 after matching its badge order to the desk; shots 69/69 (`/tmp/tower-design/iter16/allshots`);
  perf (board of 50: 608 / 242 / 196 ms against 190 / 146 / 114 ms; switch medians about 60 against 25 ms); line limit;
  doc numbers; cargo remote 4/4; bundle 163,205 / 163,840 B; detector 20 against 20 on the touched files, the same
  findings. Visual check at DPR 2, light and dark, en and zh: `/tmp/tower-design/iter16/visual/`. Not yet independently
  re-reviewed.
- Iteration 16 follow-up: after a press kept focus on the diff table, ↑↓ did nothing; they now move from the line
  pressed (or land on the first line), and the review-keys test checks it (fails on `2cd8b3d`'s `FileDiff.tsx`).
  Review 15's verdict corrected to FAIL in these documents (8.285 with R15-P1-01 open). DELIVERY §15 records that busy
  has no upper bound. Gates rerun alone, all pass: vitest 42 / 246; e2e 403/0; shots 69/69; perf (board of 50:
  604 / 243 / 186 against 177 / 152 / 107 ms; switch medians about 60 against 25 ms); line limit; doc numbers; cargo
  remote 4/4; bundle 163,258 / 163,840 B.
- 2026-11-26 Review 16 — independent (`2d3eeb8`): PASS — 8.46 / 10, no P0, P1 or P2; five P3s (the phone's silent badge
  a step louder than the desk's; a docs/12 reference to §12.2; grey stand-in rows on the empty phone page, overturning
  D156's keep; the held-out names and the review's pin pair copying the wrong text; a pass with caveats looking clean
  on the phone) and nine record-only notes. Saved as `design-evidence/reports/review16.md`.
- 2026-11-26 Iteration 17 — review 16's five (D157–D161, T125–T129) and every record-only note (D162–D169,
  T130–T137), with stale ◆ and ◇ words found on the way (D170, T138). On the phone a silent row's badge is text-2 at
  400 with no glyph, the hint mark the header's alone; an empty list is one sentence, no stand-in rows; a pass with
  caveats keeps the cut ring and seal, reads "Verified, with caveats" and names its caveats after the amber !; a ready
  row's meta line wraps at 320. Copies say what they show: the held-out names with their separators, each review pin
  whole, diff lines as code (↩ after a press comments; a triple-click anywhere on a line takes its code; a copy keeps
  blank lines; `review/diffSelect.ts`). The shimmer's peak is the ground at 60%, so a letter keeps at least 30% of its
  ink; the title bar's engine gauge has no dot and a down gauge is text-1; a look thumbnail holds a 3:4 frame until it
  decodes; a steer box whose code fails to load says so with Retry, and the goal rail's rule now finds it
  (`:has(.steer)` had never matched); an id inside a path names no criterion; and a second tool call in flight keeps
  the run busy on the supervisor and the desk (the oldest call's mode). Each fix's test fails on `2d3eeb8`'s sources
  (one file set at a time; the Rust test on the old ToolEnd logic). The first gate run went over: all interface JS
  163,953 B against 163,840 and `FileDiff.tsx` at 836 lines against 800; the selection code moved to its own module
  and this iteration's own additions were written tighter (no budget changed). Gates (run alone): tsc; vitest
  43 / 248; e2e 407/0 on the first full run; shots 69/69 (`/tmp/tower-design/iter17/allshots`); perf alone (board of 50: 712 / 247 / 187 ms against 190 / 164 / 128 ms; switch
  medians about 65 against 24 ms); line limit; doc numbers; `cargo test -p tower-supervisor` 212 passed, 2 ignored, rustfmt;
  bundle 163,810 / 163,840 B; detector 17 against 17 on the touched files, the same findings. Visual check at DPR
  2, light and dark, en and zh, 390 and 320: `/tmp/tower-design/iter17/visual/`. Not yet independently re-reviewed.
- 2026-11-26 Review 17 — independent (`f9dd353`): PASS — 8.45 / 10, no P0 or P1; one P2 (after a press on a diff line,
  ⌘⇧↩ opened the line's comment box behind the accept dialog, focus in it, from D163), three P3s (two drags dropped
  lines from a copy, from D163; the goal rail still under the steer box at 560 and 640 high; answering a question set
  the run to thinking while another call ran), the phone's Pause found fixed by the way and unrecorded, and ten
  record-only notes. Saved as `design-evidence/reports/review17.md`.
- 2026-11-26 Iteration 18 — review 17's four (D171–D174, T139–T142), the Pause test (D175, T143) and every record-only
  note (D176–D183, T144–T151), with the bundle (D184, T152) and the reviews table (D185, T153). The diff table takes ↩
  alone; a copy across files is the browser's own, and in the split view takes the side that holds lines. From 1281
  wide the steer box stops at the rail's column, so the two never overlap at any height or scroll. The supervisor has
  one rule at a call's start, its end and an answer: the run is at work on the newest call still in flight (not log,
  submit or an answered question), and the live line names that call (`Store::set_live_line`); the desk's pulse keeps
  the same calls (engine_error keeps them, run_ended clears them). On the phone the caveat line reads "With caveats,
  look first: …", keeps CJK words whole, and its mark stands on the title; docs/12 §12.5.3 rule 8 says where the amber
  ! goes. A look thumbnail waits in the frame of Tower's capture (the desktop's 16:10, the phone's 390×844 on the Mobile
  tab); a load failure is said in the interface's language; the Chinese held-out list has no space after "："; in the
  dark theme the shimmer is a gap in a veil of the ground, so the words brighten as the light passes (142 to 209 grey
  on the action words, about 5.7:1 at rest). Each fix's test fails on `f9dd353`'s sources, one file set at a time
  (`/tmp/tower-design/iter18/oldsrc/`; the Pause test on `2d3eeb8`; the phone's keep-all and mark rules by taking each
  out). The first gate run went over budget (164,051 B): Vite's modulepreload polyfill is off and the unused
  `LookStepsRead` is gone, no budget changed. The first full e2e run failed two look tests: the shared fixture image had
  been made 16:10, which their tall page needs; the fixture is back and the phone's frame was added instead. Gates
  (run alone, second run): tsc; vitest 43 / 249; e2e 410/0 (76 shot tests skip without SHOTS); shots 69/69 (`/tmp/tower-design/iter18/allshots`); perf alone (board of 50: 615 / 240 / 187 ms against 175 / 149 / 106 ms; switch medians about 61 against 27 ms); line limit; doc numbers; `cargo test -p tower-supervisor -p tower-store -p tower-core` 384 passed, 2 ignored, rustfmt; bundle 163,829 / 163,840 B; detector 19 against 19 on the touched files, the same findings. Visual check at DPR 2, light and dark: `/tmp/tower-design/iter18/visual/`. Not
  yet independently re-reviewed.
- Iteration 18 follow-up — own checks before review 18 (D186–D188, T154–T156). With a question open, a call starting
  or ending beside it took the run out of "waiting on you": the start and the settle now keep it waiting while a
  question is open, the live line still on the call at work (`flow.rs`, fake Pi "ask_while_running"; fails with either
  path's old code). Two calls starting in the same millisecond: the desk takes the later, as the supervisor does
  (`pulse.test.ts`; fails on the sort). The rail and steer box test also runs at 1281 and 1280 wide. The look fixture's
  desktop captures are 1280×800 as Tower takes them; two tests about a tall page have their own. The diff's ↩ check
  uses `normalizeCombo` (10 B). Gates (run alone): tsc; vitest 43 / 250; e2e 410/0; shots 69/69; perf alone (board
  of 50: 660 / 296 / 188 ms against 188 / 161 / 107 ms; switch medians about 66 against 24 ms); line limit; doc numbers;
  `cargo test -p tower-supervisor -p tower-store -p tower-core` 385 passed, 2 ignored, rustfmt; bundle 163,830 /
  163,840 B; detector 19 against 19 on the touched files. Not yet independently re-reviewed.
- Review 18 — independent reviewer (general-purpose agent, read-only worktree at `54ba274`, ports 1441–1443):
  **PASS, 8.47 / 10**, no P0, P1 or P2 (`design-evidence/reports/review18.md`). Review 17's P2 and three P3s confirmed
  fixed. New P3s: the rail's head under the title bar at the end of a short page (from D173), ↩ after ⌘⇧↩ and Esc on
  line 0, the phone silent beside a command running with a question open, D171's evidence test flaky under load; and
  thirteen record-only notes. Recorded as D189–D203.
- Iteration 19 — review 18's four P3s and every record-only note (D189–D203, T157–T168). The steer box ends the main
  column, so the rail's row runs to the page's foot (D189); focus handed back by a sheet or the window keeps the
  press, focus from another control or from nowhere goes to the first line (D190); the live line says whether its call
  is in flight, and the phone and the desk read that (D191, D192); the diff's evidence test waits for text and colours
  (D193); the shots harness waits for code, the highlighting worker and pictures (D194), which found a slow first
  highlight cut short and cached for the session, now run again (D195); a dialog whose time runs out closes (D196);
  docs/12 names the hint mark one way (D197); the dark shimmer fades out instead of leaping to full ink (D198); a
  missing side keeps its capture's frame (D200); sixteen duplicate keys merged keep the bundle inside its budget
  (D201); observed failures (GitHub checks, merge conflicts, the sidebar notice) are drawn in ink (D202). Kept by
  decision: the steer box's width at the fold (D199), the Chinese caveat label's break at its colon (D203). Each fix's
  test fails on `54ba274`'s sources or a stated mutation (`/tmp/tower-design/iter19/oldsrc/`). Caught at the gates and
  fixed before commit: the first fold layout (a flex column; a section past the edge, the criteria head at 624 px),
  the first focus rule (the first Tab on a page no longer reached the first line), the phone's copied rule in
  `Glyph.test.tsx`. Gates (run alone): tsc; vitest 44 / 252; e2e 415/0 (76 shot tests skip without SHOTS); shots 69/69 (`/tmp/tower-design/iter19/allshots`); perf alone (board of 50: 607 / 250 / 187 ms against 178 / 148 / 107 ms; switch medians about 63 against 24 ms); line limit; doc numbers; `cargo test -p tower-supervisor -p tower-store -p tower-core` 388 passed, 2 ignored, rustfmt; bundle 163,802 / 163,840 B. The new dialog test first ran a timed command and missed it once under the full suite's load; its command now runs until the test lets it end (three full flow runs pass, and it still fails with the expiry off). Visual check at DPR 2, light and dark: `/tmp/tower-design/iter19/visual/`. Detector 19 against 19 on the touched UI files, the same findings.
  Not yet independently re-reviewed.
- Review 19 — independent reviewer (general-purpose agent, read-only worktree at `939be97`, ports 1441–1443):
  **PASS, 8.59 / 10**, no P0, P1 or P2 (`design-evidence/reports/review19.md`). Review 18's four P3s confirmed fixed.
  New P3s: a dialog's expiry raced the event pump (from D196; the flow suite failed 3 of 12 runs), a missing side
  upright beside its picture with a long reason taller than the strip and a URL broken letter by letter (D200 not
  done), an ended call written as what the run was doing (what D192 left); and seven record-only notes. Recorded as
  D204–D213. It also showed that "three full flow runs pass" proved nothing about a race.
- Iteration 20 — review 19's three P3s and every record-only note (D204–D213, T169–T177), and D214–D217 from its own
  checks (T178–T181). One lock orders every write of the mode, a call joining the calls in flight inside it, and the
  turn's end stops the line of a call never ended (D204; the dialog code moved to `run/asks.rs`); a missing side is its
  capture's frame in the strip and side by side, its words clamped and breaking after URL punctuation (D205); the live
  line names a call only while it runs or once the run is quiet (D206); highlighting runs again only for a line cut
  short (D207); `settled()` names what it still waited for, and shots fail on it (D208); a merge conflict has its own
  mark and name in the sidebar, and docs/04 lists conflict prediction as a notice (D209, D211); a question closes a
  tenth before Pi's limit and a late answer is refused (D210); the shimmer's fade is `--dur-settle` (D212); focus
  handed back to a diff rings the line pressed (D213). Its own checks: the flow suite run 20 times passed 18, from two
  writes the engine's reply could overtake, now written before the send (D214; then 20 runs of 20); the gates now run
  what CI runs, workspace clippy and tests (D215); twenty-nine duplicate keys merged keep the bundle inside its budget
  (D216); the held tags under a criterion lost their amber rings (D217). Each fix's test fails on `939be97`'s sources
  or a stated mutation (`/tmp/tower-design/iter20/oldsrc/`, `mut/`, `race2/`). Caught at the gates and fixed before commit: workspace clippy found a test of D204's holding a lock across an await (now on a thread of its own, its mutation still failing), and the new `settled()` test failed once under the full suite's load, the overview's idle warming of a waiting review owing its own 2 worker answers at the test's cap (a probe saw them from 628 ms after load); it now opens a world with no review waiting (30 of 30 with ten workers). Gates (run alone): tsc; vitest 45 / 257; e2e 420/0 (76 shot tests skip without SHOTS); shots 69/69, which now fail on anything still drawing (`/tmp/tower-design/iter20/allshots`); perf alone (board of 50: 609 / 286 / 202 ms against 200 / 163 / 136 ms; switch medians about 67 against 27 ms); line limit; doc numbers; rustfmt, `cargo clippy --workspace --all-targets -D warnings` and `cargo test --workspace` (29 suites, 472 tests, 2 ignored); the flow suite 20 of 20; bundle 163,733 / 163,840 B. Visual check at DPR 2, light
  and dark, en and zh: `/tmp/tower-design/iter20/visual/`. Detector 16 against 16 on the touched UI files, the same
  findings. Not yet independently re-reviewed.
- Review 20 — independent reviewer (general-purpose agent, read-only worktree at `b6baa8a`, ports 1441–1443):
  **PASS, 8.63 / 10** (8.625), no P0, P1 or P2 (`design-evidence/reports/review20.md`). Review 19's three P3s
  confirmed fixed. New P3s: a question answered the moment it reached the inbox found no dialog and left the run waiting
  on you (a 300 ms probe reproduced it on both commits), the board's detail changed twice a call with its elapsed time
  jumping (from D206), and the focus ring crossed a diff line's number; eleven record-only notes; and three orderings
  its mutations showed untested. Recorded as D218–D233.
- Iteration 21 — review 20's three P3s, every record-only note and every test weakness it named (D218–D233,
  T182–T191), and D234–D235 from its own reading and gates (T189, T192). A question's inbox item, its dialog and its
  mode are one step under the run's mode lock, and an answer that finds no dialog is refused and logged (D218); every
  write of the mode beside the engine's events takes the lock, the engine's own modes and the first message never cover
  an open question (D229), and once a run is stopping nothing writes a mode, or a running live line, over the stop's (D234). On the board a
  call's words linger a second and the elapsed time follows only the run's name (D219); the diff's ring stands clear of
  the digits (D220); a missing side's code stays whole and the strip holds five lines (D221); the goal page's header
  names the run and its live line says how long it has gone, "已进行" replaces the doubled 运行, the board's elapsed time is whole or set aside by measure (it was
  cut at 1241, and in Chinese at 1440), a quiet first run is "Run 1", and the time beside the run's name is its last
  movement (D224, D225); the sidebar's count is in ink (D226); DESIGN.md and docs/04 say when the detail names
  the run (D227); `·` leaves the supervisor's strings where DESIGN.md's rule applies (D230). Tests: a test step between
  two writes (`between`, a no-op outside tests) gives the three untested orders a test each (D232), the flow test counts
  only its own sleep and the highlight test reaches Shiki's highlighter as made (D231), and D217 has its test (D233).
  Kept by stated decision: the side-by-side rule (D222), the phone strip's frame width (D223), the merged keys (D228)
  and where two tests first fail on old sources (D236). The icons became markup strings to fit the budget (D235). Each fix's test fails on `b6baa8a`'s sources (or
  `939be97`'s for D217) or a stated mutation (`/tmp/tower-design/iter21/oldsrc/`, `mut/`). Caught before commit: the
  first board fix gave the elapsed time a column of its own, which cut the detail at 1241, so the time rides only
  beside the run's name; the ring test's comment claimed 4 px of room where there are 3. Then, in a follow-up commit before review: the
  first fix of D224 hid the run's number in the goal page's header while the goal ran, which left the page naming no
  run while a call was in flight, so the header names it again and the line says how long the run has gone; a call
  started after a stop put a running live line on the stopped goal (D234, now guarded in the store); and the first
  twenty flow runs overlapped the cargo gates only at their start, so the suite ran twenty more with ten CPU burners
  held for the whole run. Gates: tsc; vitest 45 / 260;
  e2e 423/0 (76 shot tests skip without SHOTS); shots 69/69 (`/tmp/tower-design/iter21/allshots`); perf alone (board of 50: 888 / 486 / 274 ms against 273 / 275 / 193 ms; switch medians about 115 against 44 ms); line limit;
  doc numbers; rustfmt, `cargo clippy --workspace --all-targets -D warnings` and `cargo test --workspace` (29 suites,
  480 tests, 2 ignored); the flow suite 20 of 20 (50 tests each, with ten CPU burners held for the whole run, one-minute load 17.5–48.7); bundle 163,674 / 163,840 B. Visual check at DPR 2, light and dark, en and
  zh. Detector 16 against 16 on the touched UI files, the same findings. Not yet independently re-reviewed.
- Review 21 — independent reviewer (general-purpose agent, read-only worktree at `9397e07`, with `b59e68a`, ports
  1441–1443): **PASS, 8.69 / 10** (8.685), no P0, P1 or P2 (`design-evidence/reports/review21.md`). Review 20's three
  P3s confirmed fixed. New P3s: side by side a missing side's code still broke after `_`, D221's rule having done
  nothing in WebKit while its test read the computed style; and an approval's code block read `bash rm -rf …`, a
  command no one would run, with the stall title gluing the tool to its command (from D230). Fourteen record-only notes,
  among them a pause beside a settle under way, reproduced with a 400 ms delay, and two of D234's sentences without a
  test. Recorded as D237–D252, with D221, D227, D230, D233 and D234 corrected.
- Iteration 22 — review 21's two P3s and every record-only note (D237–D252, T193–T197), and D253 from its own gates
  (T198). Side by side the missing side's frame breaks only an address, after `://` or a `/`, and the `.u` rule is gone
  (D237); an approval's code block is the command or path alone, every line, the reason says what it does (a path's
  now names the write), and the stall title names the command before the tool (D238); the stop is marked under the mode
  lock, so a settle under way finishes first and a pause beside it has the last word (D239), and `settle_on`'s lock
  and `report_mode`'s stop guard have a test each (D240). On the board the badge lingers with its call (D242); the
  tooltip gives the run's name and time their own line (D243); the time reads "elapsed", on the desk and the phone
  (D244, D248); a starting run and one with no start time are named by their number (D245, D246); the docs say so
  (D247); the English badge column holds "Thinking" and "Working" (D249); the + clears the ring by 4 px (D250); the
  conflict count's ink is tested (D251); an evidence line ends on its pin (D252). Kept by stated reason: the answer's
  lock held to the send, untested (D241). D221, D227, D230, D233 and D234 now say what review 21 found they
  overstated. Each fix's test fails on `9397e07`'s sources or a stated mutation (`/tmp/tower-design/iter22/oldsrc/`,
  `mut/`); the clients' approval tests pin that they add nothing to the body (the clients did not change). The gates
  now run on fixtures dumped from the supervisor under test, as `tools/e2e.sh` makes them; the first run failed one
  test that named the old dump's revision (D253). Gates: tsc; vitest 45 / 262; e2e 425/0 (76 shot tests skip without
  SHOTS); shots 69/69 (`/tmp/tower-design/iter22/allshots`); perf alone (board of 50: 862 / 390 / 241 ms against
  270 / 227 / 180 ms; switch medians about 99 against 36 ms); line limit; doc numbers; rustfmt, `cargo clippy
  --workspace --all-targets -D warnings` and `cargo test --workspace` (29 suites, 485 tests, 2 ignored); the
  extension's tests (32) and `tools/security-tests.mjs` (118 named tests present); the flow suite 20 of 20 (50 tests
  each, ten CPU burners held for the whole run, one-minute load 20.3–41.4); bundle 163,722 / 163,840 B. Visual check
  of the shots at DPR 2, light and dark, en and zh. Detector 17 against 17 on the four touched UI files, the same
  findings. Not yet independently re-reviewed.
- Review 22 — independent reviewer (general-purpose agent, read-only worktree at `864d6c3`, ports 1441–1443):
  **PASS, 8.81 / 10** (8.810), no P0, P1 or P2 (`design-evidence/reports/review22.md`). Review 21's two P3s confirmed
  fixed, each reproduced on `9397e07`; D239, D240, D242–D253 confirmed and D241 kept with reason. New P3, pre-existing:
  an approval's code block did not tell a row it carried over from a line of the command's own, and the phone parted
  `--` and `fill`. Eight record-only notes, among them an approval Pi raises as a run is stopped and the desk's fold of
  two approvals alike; D237's and D250's wording corrected; three sentences without a test. Recorded as D254–D264.
- Iteration 23 — review 22's P3, every record-only note and every untested sentence (D254–D264, T199–T205), and
  D265–D267 from its own reading (T206). An approval's command is a row per line, a carried-over row two in under a
  hook, a word moved whole, on the desk and the phone, and what is copied is the command (D254); a dialog to a run being
  stopped is cancelled to the engine and opens nothing (D255); where the start time is unknown the goal page's line says
  nothing and does not shimmer, the header having named the run (D256, superseding D246); a stall's command and a
  failing check's name are code in the question, marked by the store (D257), as the ledger's pin is (D261); the
  tooltip reads "Run 2, elapsed 21h 33m" (D258); the fold of a note said again moved into the store and every dialog is
  its own item on both surfaces (D259); a failed capture says why on the phone's tab too (D262); D250 and D237 corrected
  (D260, D263); the denial's sentences live once in `policy.ts` with a test, and the phone's Chinese time and multi-line
  body are tested (D264). The phone says Chinese times in words (D265), its page's policy lets data-URL marks draw and
  its tests serve that policy (D266), and its tails copy a blank line as blank (D267). Each fix's test fails on
  `864d6c3`'s sources or a stated mutation (`/tmp/tower-design/iter23/oldsrc/`, `mut/`); a desk mutation the first
  version of the hook's test let through (the word box inline) is caught by a sweep of widths, and the CSP mutation
  fails on the missing ink, the screenshot read on a page of its own. Gates: tsc; vitest 44 / 263; e2e 434/0 (76 shot
  tests skip without SHOTS); shots 69/69 (`/tmp/tower-design/iter23/allshots`); perf alone (board of 50: 871 / 465 /
  276 ms against 246 / 262 / 225 ms; switch medians about 113 against 40 ms); line limit; doc numbers; rustfmt,
  `cargo clippy --workspace --all-targets -D warnings` and `cargo test --workspace` (29 suites, 489 tests, 2 ignored);
  the extension's tests (33) and `tools/security-tests.mjs` (118 named tests present); the flow suite 20 of 20 (50
  tests each, ten CPU burners held for the whole run, one-minute load 17.0–36.0); bundle 163,733 / 163,840 B. Visual
  check of the approval blocks at DPR 2 (desk light 1440 and dark 1040, phone light 390 and dark 320) and the stall
  card (`/tmp/tower-design/iter23/vis`). Detector 17 against 17 on the seven touched UI files, the same findings. Not
  yet independently re-reviewed.
- Iteration 23, second commit — what a check of the first found before review (D268, D269, T207, T208, and D262 and
  D254 corrected). An item Tower closes (replaced by the run's next question, withdrawn, a dialog timed out) is marked
  `auto` in the trace's event and is the system's, never "Your answer" (D268); the phone page's policy forbids framing,
  plugins, a base and forms, with `X-Frame-Options: DENY`, and docs/11 says what it is (D269); the sheet's phone frame
  breaks its words as the strip does, at every window height (D262); D254's mutation wording corrected. Each new test
  fails on `864d6c3`'s sources or a stated mutation (`trace-old`, `remote-rs-old`, `auto-source-human`,
  `withdraw-not-auto`, `phone-sheet-wide` in `/tmp/tower-design/iter23/oldsrc/` and `mut/`). Gates, again in full:
  tsc; vitest 44 / 264; e2e 434/0 (76 shot tests skip without SHOTS); shots 69/69; perf alone (board of 50: 814 / 452 /
  273 ms against 247 / 257 / 196 ms; switch medians about 107 against 38 ms); line limit; doc numbers; rustfmt,
  workspace clippy and `cargo test --workspace` (29 suites, 490 tests, 2 ignored); the extension's tests (33) and
  `tools/security-tests.mjs` (118 named tests present); the flow suite 20 of 20 (ten CPU burners, one-minute load
  17.5–51.2); bundle 163,772 / 163,840 B. Visual check of the sheet's phone frame at 1040 wide and 900, 720 and 560
  tall, en and zh (`/tmp/tower-design/iter23/vis2`). Detector 17 against 17 on the eight touched UI files. Not yet
  independently re-reviewed.
- Iteration 24 — review 23's P2, its two tests that could not fail, every record-only note and what it did not cover
  (D270–D285, T209–T215), D286 from this iteration's own visual check (T216) and D287 from its own gate run (T217). A
  line's first word in an approval's code block is the line's own text, so a path or URL longer than a row hangs its
  carried rows two in under the hook and fills each row, the words after it in order, on the desk and the phone; a tab
  parts words (D270, D277). The hook's test reads the ink's fill, tone and grey and its repeat (D271), and the arrow
  stands clear of the next character (D278). A stop between the dialog guard's check and the dialog is timed by a test
  (D272); the agent reads "No one answered…" for a dialog no person answered (D273), the reason after a colon (D274),
  and the trace notes a dialog Tower cancelled (D275). Tower's closings are one sentence from the store naming the
  item, under Tower's mark, the opening row names its item (D276), and migration 24 gives older traces their closings
  back (D285). Each failing check is its own code (D280); Look's missing frame is one shape and shows its whole reason
  side by side (D281); the trimmed blank lines at a command's ends are said (D279); the phone page's escaping is
  tested (D282); a card's unsent words outlive it until an answer goes (D283). No trace row is an event's name: the
  supervisor words the kinds the desk has no row for, and the desk's label keys are found from the kind, which pays
  for this iteration's bytes (D286); the budget is kept (D284). The full gate run's one failure was a measurement that
  read a command block after the phone page had repainted it: the page set its cards' markup whole at every read,
  changed or not, so a selection on a card went too; it now repaints only what changed, holds a state while words on a
  card are selected, and keeps a reply's unsent words until an answer goes, as the desk does, and the helper reads a
  block taken out of the document again (D287). Each fix's test fails on `43576b0`'s sources or a stated mutation, all
  re-run on the final tree with fixtures dumped from it (`/tmp/tower-design/iter24/oldsrc/`, `mut/`, 40 checks).
  Gates, run alone on the final tree: rustfmt, workspace clippy, `cargo test --workspace` (29 suites, 494 tests, 2
  ignored), the extension's 34 tests, security 118, the flow suite 20 of 20 under ten CPU burners (load 18.7–36.4, run
  before D287's page change, which no flow test loads), tsc, vitest 44 files and 265 tests, build, budget (163,735 /
  163,840 B), line limit, e2e 439 passed and 0 failed (76 shot tests skip without SHOTS), shots 69/69, perf alone
  (board of 50: 1243 / 599 / 334 ms against 320 / 348 / 310 ms; switch medians about 142 against 58 ms), doc numbers.
  Visual check at DPR 2 of the approval blocks (desk light 1440 and dark 1040, phone light 390 and dark 320: a 220-
  and 95-character path, a URL piped to `sh`, a tab-separated command), the failing-checks question and the trace's
  end (Tower's closing under its mark, the cancel note, the named opening rows, the must-fail check in words)
  (`/tmp/tower-design/iter24/vis`). Detector: 17 against 17 at `43576b0` on the 5 changed UI files, the same findings.
  Not yet independently re-reviewed.
