# Design evolution — final delivery

Branch `design/evolution`, from `main` at `bf22cad`, nineteen local commits, nothing pushed, merged or deployed. Working
evidence is under `/tmp/tower-design/` (not committed); curated evidence is in `design-evidence/`: before/after
pairs, the review, research and critique reports (`reports/`) and the packaged-app screenshots (`packaged-app/`). Status words:
**Implemented** (in code), **Verified** (a test, gate or measurement passed), **Accepted** (an independent review
accepted it), **Unverified**, **Deferred** (with reason), **Blocked**.

## 1. Original design problems — Verified (audited)

Audited at `bf22cad` from four sides: my product and workflow audit, the Unslop signs audit, an isolated Impeccable
critique (27/40) with its detector, and an independent baseline review (FAIL, six P1). They are consolidated as D01–D27
in `DESIGN_REVIEW.md`. The ones that mattered most:

- **The goal page buried the evidence.** The criteria started at 989 px on a 900 px screen, below the agent's own "Cause".
- **The verdict contradicted itself.** "Passed, not evidence" appeared on four surfaces. A pass that doesn't count could
  read "Ready to accept" elsewhere and wear the verifier's green.
- **Board selection and opening were unstable.** j/k made rows jump, Space opened decisions, and the Accept sheet
  disabled itself without saying why.
- **Reading sheets were translucent.** The palette and peek text collided with the board behind them.
- **Craft gaps.** Lazy plurals, jargon, status hues on statistics, an uppercase masthead, and contract clause numbers
  out of reading order.
- **Bundle headroom under 2 KB** (162,742 / 163,840 B), so every change had to pay for its JavaScript.

## 2. External research — Verified (sources cited)

`design-evidence/reports/research.md` covers:

- agent desks: Conductor, the Codex app, Claude Code desktop, Vibe Kanban, the Cursor 3 Agents Window, GitHub Agent HQ;
- review tools: Linear, GitHub/Graphite, Gerrit, Phabricator;
- CI and observability: Buildkite/CircleCI, Sentry, Datadog.

Each section has sources and a borrow / don't-copy note. Adopted mechanisms are cited per issue in `DESIGN_REVIEW.md`:

- only the system changes state;
- a since-last-look diff scope;
- batched steering;
- one list regardless of origin;
- step-through review.

## 3. Direction and why — Implemented, Accepted

The Unslop verdict was **light slop**, so this was polish in the existing direction, not a new look. The direction:

- **Product:** a desk where one engineer runs several coding agents and steps in only for decisions and review.
- **Character:** still, exact, sceptical.
- **World:** a control tower at night.
- **Moments:** the evidence gauge and the diff under review.
- **Signature:** the provenance gutter (Measured / Agent says / You) and the amber ◆ meaning "needs you".

Why: Tower's promise is that only the verifier makes a goal pass. So the design's job is to make facts and claims
impossible to confuse and to make the human's next decision obvious, not to look new.

## 4. Candidates and trade-offs — Verified (independent concept review)

Three goal-page directions were prototyped (`/tmp/tower-design/concepts/`):

- **C1, evidence first.** Chosen as the skeleton.
- **C2, a facts | claims ledger.** Rejected: it gives the agent's claims half the page.
- **C3, path to the seal.** Rejected as a skeleton: the reviewer rated it P0 for a green tick and a single "1 of 5" count.

C1 was adopted with C3's "blocks acceptance" wording and C2's one-line contract at narrow widths. The independent
concept review is at `review-concept/report.md`.

## 5. PRODUCT.md and DESIGN.md — Implemented

- `PRODUCT.md`: Impeccable `init`, inferred from the repo, since the owner asked not to be interviewed.
- `DESIGN.md`: written by the Impeccable documenter from the shipped code at `3faaf0c`. It records 17 places where
  `docs/12` disagrees with the code. Which side is canonical is left to the owner (§"docs/12 drift" in
  `DESIGN_REVIEW.md`).

## 6. Design Contract — Accepted

AC1–AC11 and the hard gates are in `DESIGN_REVIEW.md` §"Design contract". Review 7 found every AC met at `3145645`.

## 7. Roadmap executed — Implemented, Verified

T01–T53 are in `DESIGN_ROADMAP.md`. T18, T19 and parts of T45 and T53 are deferred (see §15). Each task is linked to
its issues and to the test that verifies it.

## 8. Before/after, same conditions — Verified

`design-evidence/*.before.webp` and `*.after.webp`, nine pairs:

- palette;
- goal G-0001 (en light, zh dark);
- inbox;
- board at 1800 and after j;
- empty review;
- review with the Accept sheet;
- review G-0003.

Conditions: the same `shots.spec.ts`, the same dumped fixtures, the same viewport, 1440 px wide webp at q72.

- **Before** is the `bf22cad` baseline shot. A fresh conversion of it is byte-identical to the committed file.
- **After** is the final commit's shot.

All 69 shots per iteration are under `/tmp/tower-design/iterN/shots`.

## 9. Core workflow evidence — Verified

The board → peek → goal or review → back loop is covered by e2e and measured by the reviewers. Measured in e2e and by
the reviewers:

- **Board stability:** five presses of j leave the first row in place.
- **Peek:** Space peeks and never opens. The peek keeps focus under Tab and ⇧Tab on every goal, in both languages.
  Every exit (r, ↩, button, Esc) lands with no page error over 200 exits.
- **Review queue:** ⇧R starts it from the board or the peek.
- **Accept sheet:** it names and focuses every blocker.
- **Goal page:** the acceptance criteria start within 600 px on the goal page, at 1440 and 1100, en and zh.
- **One verdict:** "Passed, doesn't count" reads the same across 11 surfaces × CI/no CI × en/zh × light/dark (review 7).

## 10. Impeccable — Verified

- `init` produced `PRODUCT.md`.
- An isolated critique sub-agent (27/40) and a detector and browser-evidence sub-agent ran on the baseline.
- `document` produced `DESIGN.md`.
- The craft floor was read before UI edits.
- `detect --json` ran on the changed UI files every iteration.

Final detector result on the files changed in iteration 8: 13 findings, all in `app.css` and the same as in iterations 6 and 7, nothing new (iteration 5 also counted 2 unchanged `workbenches.css` lines). They are
6 radius, 3 side-tab (2px rules on table rows and hunks, triaged in `DESIGN_REVIEW.md`), 3 font-size and 1 colour.
No `ignore` was added to silence a finding.

## 11. Unslop — Implemented, Verified

Signs found and fixed:

- translucent "glass" reading sheets (now opaque);
- status hues on statistics (now neutral meters);
- the only uppercase tracked label;
- the dashed box-in-box seal;
- lazy plurals and jargon.

Already clean: gradients, glows, emoji, italic, decorative motion. The middle dot is kept for two scales only, and
that is enforced by e2e on 14 surfaces.

## 12. Independent reviews — Accepted

Reviews 1–8 used the user's `frontend-reviewer` agent, in a fresh read-only worktree on its own port; review 9 used a
general-purpose agent as the independent reviewer under the same rules, because the `frontend-reviewer` type was not
available in that session. The reviewers never edited code. Reports are committed in `design-evidence/reports/review*.md`.

| Commit | Verdict |
|---|---|
| `bf22cad` | Baseline: FAIL |
| `aa1026b` | 7.4, not accepted |
| `3faaf0c` | 7.2 |
| `815bd99` | 7.2 |
| `d0dc2a1` | 7.85 |
| `16ac40c` | 8.03, one P1 |
| `3145645` | **PASS, 8.18**, no P0/P1, AC1–AC11 met |
| `d6f07ef` | **PASS, 8.30**, no P0/P1/P2 (re-check after review 7's P2) |
| `7a23f45` | **PASS, 8.28**, no P0/P1; one P2 (review 9, after the owner's remaining list) |
| `deef352` | **PASS, 8.20**, no P0/P1; one new P2 (review 10, after review 9's fixes) |
| `2f1d0c5` | **PASS, 8.38**, no P0/P1/P2; four P3 (review 11, after review 10's fixes) |
| `886ab38` | **PASS, 8.42**, no P0/P1/P2; two P3 (review 12, after review 11's fixes) |

Review 8 raised four P3s. Two were introduced by iteration 8's own fixes: the peek head called a waiting run
"Unresponsive", and the sidebar still said "Needs you" for a goal in To review. Two were older: the cron broke at
1040 px, and a dot was left at the end of the review header.

The last commit fixes the first two and the cron, and the dot half of the fourth, each with a test that fails on
`d6f07ef`. Those fixes are **Verified, not independently re-reviewed**: the acceptance stands on `d6f07ef`.

Review 9 read `7a23f45` (iteration 9) and passed it at 8.28. It found one P2 — a goal accepted with caveats lost them
on its stamp — six P3s mostly from iteration 9's own fixes (the comparing verdict still lost in two width bands, key
caps hidden at ≤1240, the ledger's runs note in the claim's colour, the evidence strip saying "assertions untouched"
beside a test-machinery caveat, the folded engine clause hiding non-default settings, a bare other goal's id in the
identity column), one older P3 (the budget's "$" on its digits) and three docs/12 places still off. Iteration 10 fixes
all of them (D98–D106), each with a test that fails on `7a23f45`.

Review 10 read `deef352` (iteration 10) and passed it at 8.20: the comparing verdict now holds at every width from
1024 to 1600 (swept every 4 px, both directions, no flicker), and the key caps, the test-machinery strip, the folded
engine settings and the field units are confirmed fixed. It found one new P2 that iteration 10 introduced: moving the
overlap note into the title cell squeezed an overlapping row's title to "Fi…" at 1241 (D107). Five P3s: the done-state
tooltips and the integrated glyph (D108), the compare picker's select value (D109), the light-theme ledger note
(D110), a docs/12 "neutral pill" that is amber (D111), English run names in Chinese (D112).

Iteration 11 fixes all six, and the empty settings test, each with a test that fails on `deef352` (the picker's
face-against-select check also as a name-free variant).

Review 11 read `2f1d0c5` (iteration 11) and passed it at 8.38, with no P0, P1 or P2. The overlapping row's title is
whole at every width (swept 1241–1800 every 4 px; hover, selection and a live rename flip nothing); every seal of an
accepted or merged goal says the caveats were taken with it, and the merged ring has its gap; the run pickers' select,
face and tooltip agree, in the interface language; the ledger note is apart by size and wording; the empty settings
test now checks. It confirmed the new tests fail on `deef352` for the right reasons. Four P3s: the overlap note keeps
the peek button's room even when the button is hidden, so the words go where the row fits them (D113, from iteration
11); a neutral caveat pill can stand beside a pass a high finding holds (D114); a picked run name is lost on a refresh
or a scope switch, and an end that leaves the list is blank (D115); the live and identity columns cut words without an
ellipsis (D116, older).

Iteration 12 fixes all four, each with a test that fails on `4ea4567` (review 11's commit; its code is `2f1d0c5`'s).

Review 12 read `886ab38` (iteration 12) and passed it at 8.42, with no P0, P1 or P2. The overlap note says as much as
leaves the title its room, at rest (swept every 4 px); a held pass draws no neutral pill; picked run names survive a
re-verification and a scope switch, and a gone end is named; the live seal gives way whole, never a green mark without
its pin. It confirmed the new tests fail on `4ea4567` for the right reasons. Two P3s: a merged or closed PR with rework
still ran past the identity's last step (D117, what D116 left), and the PR readings a step set aside were in neither
the tooltip nor the button's name, a short project name held 3.5em (D118, from iteration 12). The last acceptance
stands on `886ab38`.

Iteration 13 fixes both, and two of the review's record-only notes, each with a test that fails on `886ab38`.

Review 13 read `3ff2ebf` (iteration 13) and passed it at 8.47, with no P0, P1 or P2: the identity's last step always
fits and what a step sets aside is still said. Two P3s: a project name squeezed to 1 px or less counted as set aside,
so a sliver of it stayed and the order could reverse in 1–2 px bands (D120, from iteration 13), and a gone end's kept
pin cut the criteria bar in a narrow review header at en 1040–1052 (D121). The last acceptance stands on `3ff2ebf`.

Then the owner asked for the status marks to change: the red square, the amber diamond and the blue half disc, and
crude UI like them anywhere, with good agent front ends, open-source design systems and motion libraries as the
reference (D119). The marks are now one family, a disc with its symbol cut out as a true hole (! amber, × red, an
outlined i uncoloured), drawn from one set of paths in the components, the stylesheets and the phone page. Running
work turns a quarter arc on its ring, and the goal in view shimmers its live line while its agent moves. Segments are
capsules that fill in place, and layers, toasts, new rows and presses settle on springs with no overshoot. All of it
stands still under reduced motion. DESIGN.md, PRODUCT.md principle 2 and docs/12 §12.6–§12.7 say the new rule:
only work in motion loops.

Iteration 14 fixes review 13's two (D120–D121) and two of its record-only notes, each with a test that fails on
`1c9af8a`'s sources. Fixing D121 found an older fault: the review header's key caps step had never run since
iteration 10. Neither the redesign nor iteration 14 is independently reviewed yet.

## 13. Function, performance, accessibility — Verified

At the final commit (iteration 14):

- **Type check and unit tests:** tsc clean; vitest 42 files, 241 tests (the runs gauge's wedge and its test are gone).
- **e2e:** Playwright WebKit 382 passed, 0 failed (76 shot tests skip without SHOTS), Chinese tests on the Chinese
  supervisor's views. The suite includes axe on the rich states in both themes. The dev server logs six "Importing a
  module script failed" lines (five or six in iterations 11–14, at the same tests from run to run; four in iteration 10): pages left by a test while a view was still loading; no test
  fails and the new tests emit none.
- **Shots:** 69/69 (`/tmp/tower-design/iter14/allshots`); before/after crops in `design-evidence/marks-*.webp`.
- **Line limit, doc numbers:** pass.
- **Bundle:** all interface JS 162,773 / 163,840 B (1,067 B left), start-up 56,115 / 65,536 B, goal page
  11,598 / 12,288 B. The budget was never raised.
- **Performance (`perf` project, WebKit):** passes. A board of 50 goals paints in 1,541 / 772 / 435 ms against
  442 / 451 / 329 ms for the seeded board (medians 772 against 451), inside its 750 ms margin (every row measures its
  identity column, and every running row's mark turns); view switches with 50 goals take 76–218 ms against 44–119 ms,
  their medians (149.5 against 79 ms) inside 150 ms.
- **Rust (iteration 9; iterations 10–14 changed no Rust):** the redesign changed the phone page the supervisor
  embeds (`remote.html`, `include_str!`): the crate builds and its four `remote` tests pass. At iteration 9: rustfmt;
  clippy `-D warnings`; `cargo test --workspace` passes on an idle machine (29 suites, 461 tests). Once, run while the full
  e2e suite and the shots ran beside it, `evidence::a_criterion_whose_base_did_not_run_keeps_its_canary` failed its
  canary assertion; it passed alone, three times more, and in the full rerun. It drives a real sandboxed `node --test`
  and this work does not touch the verifier or the canary: recorded as load-sensitive, not hidden or retried away.
- **Detector:** the 3 `side-tab` findings are the review pen on hunk headers, kept since the baseline (`app.css`,
  lines not touched since), and the DESIGN.md advisories on the changed stylesheets are on older lines. The redesign
  adds six, each triaged in `DESIGN_REVIEW.md` with no ignore: four `bounce-easing` on the two springs (both now with
  no overshoot; the rule fires on the `linear()` form), one `gradient-text` (the in-view shimmer, a functional state)
  and one `repeating-stripes-gradient` (the phone's hatched "observed" pip). Iteration 14's 5 changed UI files show the
  same 19 findings as at `1c9af8a`.
- **Hardening probe (iteration 8):** no element past the edge at 1040 and 1440 with long en and zh titles; text
  contrast at least 5.26:1 light and 5.70:1 dark; a focus ring on every Tab stop; nothing animates under reduced motion
  (re-checked for the redesign: the turning marks and the shimmer hold still, `flows.spec.ts`).

**Packaged app (iteration 9).** A debug `Tower.app` (`pnpm tauri build --debug --bundles app`: the built bundle, so the
locale plugin's output too) ran on a demo seeded into its own `TOWER_HOME` with the scripted demo engine — not the
user's `~/.tower`, no model called. Looked at through the accessibility tree, in the background: G-0003's one ledger
row "runs 1, 2" (D91), the folded engine clause (D92), titles with their ids on the board (D23), a schedule "Weekdays
02:00" before its cron (D20, the schedule added to the scratch database, disabled), and the native unsaved-contract
sheet. Screenshots: `design-evidence/packaged-app/`. Not reached there: a pass with caveats (the demo has none) and a
1040 px window (D58, D96); their evidence is the WebKit tests. Iterations 10–14's fixes were not looked at in the packaged
app. Typing into the WebView in the background does not
reach its fields — keys went to the app's shortcuts once (a stray draft, discarded through the app's own sheet).

## 14. Commits — Implemented

`bf31644`, `aa1026b`, `8037e1e`, `3faaf0c`, `2a65eb1`, `815bd99`, `d0dc2a1`, `16ac40c`, `3145645`, `d6f07ef`, `3b11e8e`
(review-8 fixes, refreshed evidence, this report), `4d0b9c4` (the perf run), the iteration-9 commit `7a23f45` (the owner's
remaining list), the iteration-10 commit `deef352` (review 9's findings), the commit recording review 10 (`2cd2c0c`), the
iteration-11 commit `2f1d0c5` (review 10's findings), the commit recording review 11 (`4ea4567`), the iteration-12
commit `886ab38` (review 11's findings), the iteration-13 commit `3ff2ebf` (review 12's findings, with review 12's
report), the status-marks-and-motion commit `1c9af8a` (D119, with review 13's report) and the iteration-14 commit (review 13's
findings). All are on `design/evolution`, local only. The user's untracked `.claude/` was never added.

## 15. Remaining issues, risks, limits

Iteration 9 fixed the owner's remaining list: D84 (bundle), D91, D92, D96, D51/D86, the docs/12 drift, D20, D22, D23,
D58 and D97 (evidence) — see `DESIGN_REVIEW.md` for each, with the test that fails on `4d0b9c4`. Iteration 10 fixed
review 9's findings (D98–D106), each with a test that fails on `7a23f45`; review 10 passed it. Iteration 11 fixed
review 10's (D107–D112) and its empty settings test, each with a test that fails on `deef352`; review 11 passed it.
Iteration 12 fixed review 11's (D113–D116), each with a test that fails on `4ea4567`; review 12 passed it.
Iteration 13 fixed review 12's (D117–D118), each with a test that fails on `886ab38`; review 13 passed it and found
D120–D121. The status marks and motion (D119) followed the owner's feedback. Iteration 14 fixed D120–D121, each with
a test that fails on `1c9af8a`'s sources; neither is re-reviewed yet.
What is left:

- **Three more columns give way by measuring** since iteration 12 (`lib/refit.ts`): the overlap note (three steps),
  the live seal (its word, then the whole seal) and the identity (the engine's name, the PR's quieter readings, the
  word "muted", the project's name, the PR's state, and last the whole identity). Each runs again on its box, its text
  and the fonts; the board of 50 still paints inside its margin. The identity's last step folds it into the title's
  tooltip, as below 1241, so nothing on it is cut however long its readings; what leaves the line is still read by a
  screen reader. The sweeps hold three crowded boards (open PRs; merged and closed PRs with rework up to 3/3; review 13's stress row,
  which folds), every 1 px where the column's width moves.
- **The overlap note gives way by measuring** each overlapping row (a ResizeObserver on the title cell and the title, a
  MutationObserver for its text), decided on the row at rest, so hovering or selecting never changes it. Measured at ten
  widths 1241–1800 for both rows of the pair, a short and a long title, in both languages; at 1241 a long title has
  about 12em with the note at its ◇, the column itself allowing no more.
- **Run names are worded by the frontend.** The supervisor still writes English labels (`edits.rs`, `timeline.rs`);
  the interface no longer shows them except for a snapshot kind it does not know. The verifier's point is named
  "Verification", not "Verified", so a pass that does not count is never called verified in the picker.
- **The review header now fits by measuring** (`review/fitStats.ts`, a ResizeObserver and a MutationObserver) rather than
  by width band. The sweep test covers 1024–1400 for both fixture goals in both languages; a verdict longer than any
  the fixtures hold would still give way last, but only those widths and verdicts were measured. Its last two steps
  are real since iteration 14 (the key caps step had never run): the key caps, then a gone end's pin, checked every
  1 px at en 1040–1064.
- **Below 1241 px the board's overlap notice is in the title's tooltip only**, as the identity column it replaced was;
  above it the note says as much as leaves the title its room: its words, the other goal's id, or the ◇ alone (what it
  sets aside stays in its tooltip and for a screen reader).

- **D58 covers three caveats.** "Verified, with caveats" is computed for test machinery reached into, assertions not
  checked and a flaky pass; docs/07's other qualifiers (S0, a Node version unlike the profile, an unsupported ecosystem,
  opportunistic verification) are not computed yet. A caveat is confirmed by two presses, not a written reason.
- **docs/12 still specifies five things the code does not render** (the revert badge, the dependency notice, the review
  backlog head and bar, the hunk author's line style): future specs, left as written, the last now said so in §12.4.4. An integrated goal tells verified from human-only by colour
  alone — written down in docs/12 as a known limit.
- **Supervisor text is written in the language of the moment.** A goal's findings and pauses keep the words they were
  written in; switching the interface language does not rewrite stored events. Test output and the prompts Tower sends
  the agent stay as they are, by design.
- **11px labels and 10px keycaps (D54/D85), Kept by decision.** No sentence is below 12px; the ledger's runs note
  ("said in runs 1 and 2") is 11px by design (D110), a note about the claim set apart by size as well as grey.
- **Packaged-app evidence is a debug build on a seeded demo**, looked at, not driven by an automated suite; D58 and D96
  were not reachable there.
- **One Rust integration test is load-sensitive** (§13).
- **Impeccable critique history is not saved across sessions.** The tool suggests `npx impeccable login` for that;
  it was not run, since it is an account action.
