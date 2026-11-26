# Design evolution — final delivery

Branch `design/evolution`, from `main` at `bf22cad`, with `main` at `70a52e7` merged in on 2026-11-27, then pushed and
opened as a pull request at the owner's request; nothing deployed. Working
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
- **Signature:** the provenance gutter (Measured / Agent says / You) and the amber ! mark meaning "needs you" (an
  amber ◆ until D119).

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
| `3ff2ebf` | **PASS, 8.47**, no P0/P1/P2; two P3 (review 13, after review 12's fixes) |
| `1ad1439` | **PASS, 8.35**, no P0/P1; one P2 (review 14, with the status marks and motion) |
| `2408609` | 8.285, not accepted: one P1 (review 15, an older phone defect) |
| `2d3eeb8` | **PASS, 8.46**, no P0/P1/P2; five P3 (review 16, after review 15's fixes) |
| `f9dd353` | **PASS, 8.45**, no P0/P1; one P2 (review 17, after review 16's fixes) |
| `03999c0` + `54ba274` | **PASS, 8.47**, no P0/P1/P2; four P3 (review 18, after review 17's fixes) |
| `939be97` | **PASS, 8.59**, no P0/P1/P2; three P3 (review 19, after review 18's fixes) |
| `b6baa8a` | **PASS, 8.63**, no P0/P1/P2; three P3 (review 20, after review 19's fixes) |

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
iteration 10.

Review 14 (`1ad1439`, the redesign and iteration 14 together) passed at 8.35 / 10 with one P2 and four P3s
(`design-evidence/reports/review14.md`). Iteration 15 fixes all five (D122–D126) and closes every note left open
from reviews 12–14 (D127–D141): fixed with a test that fails on `1ad1439`'s sources, or kept by a stated decision
(D128, D139, D140). The running mark now turns only where you watch work and only while it moves; the shimmer moves
by transform alone (a quarter of a core down to about one point); nothing moves under reduced motion, pseudo-elements
included. Its own pixel checks then found two older faults on the phone and in the title bar (D142: the phone's
"Live" wore the verifier's green; D143: silence was a red ring where the spec draws the hint mark), fixed in a
follow-up commit with tests that fail on `ae1c049`.

Review 15 (`2408609`, iteration 15 and its follow-up) failed it: 8.285 / 10, above 8.0, but with one open P1 (pre-existing), one P2 and five P3s
(`design-evidence/reports/review15.md`): the phone drew the verifier's green on every goal to accept, a pass that
doesn't count included (D145); the held-out files that ran sat under the line naming the ones that did not (D146); a
path's "C9" was read as a criterion (D147); a wrapped evidence strip started its second line 18px right (D148); titles,
ids, pins, commands and paths could not be copied (D149); "Unresponsive" named the desk's own reading of silence
(D144); "No sandbox" wore the amber ! (D150). Iteration 16 fixes all seven and every record-only note: the phone counts
a run inside a long tool call as busy and its badges say Silent and Needs you as the desk's do (D151), the title bar's
marks are one size (D152), the shimmer's light passes over a short word (D153), a diff line can be selected (D154),
stale words go (D155), and the rest is kept by the rule each follows (D156). Each fix's test fails on `2408609`'s
sources.

Review 16 (`2d3eeb8`, iteration 16 and its follow-up) passed at 8.46 / 10 with no P0, P1 or P2 and five P3s
(`design-evidence/reports/review16.md`): the phone's silent badge a step louder than the desk's (D157); a docs/12
reference to the wrong section (D158); grey stand-in rows on the empty phone page, overturning D156's keep (D159); the
held-out names and the review's pin pair copying the wrong text (D160); a pass with caveats looking clean on the phone
(D161). Iteration 17 fixes all five and every record-only note: the 320-wide phone row (D162), the diff's keys and
selection gaps (D163), letters going out under the shimmer's peak (D164), the title bar's last bare dot and the down
gauges' ink (D165), a look thumbnail's sliver before it decodes (D166), a steer box that vanished when its code failed
to load, with the goal rail's dead `:has(.steer)` found on the way (D167), a path's criterion id (D168), and a second
tool call in flight that did not keep the run busy, on the supervisor and the desk (D169); stale ◆ and ◇ words go
(D170). Each fix's test fails on `2d3eeb8`'s sources.

Review 17 (`f9dd353`, iteration 17) passed at 8.45 / 10 with no P0 or P1, one P2 and three P3s
(`design-evidence/reports/review17.md`): after a press on a diff line, ⌘⇧↩ opened that line's comment box behind the
accept dialog, with focus in it (D171, from D163); two drags dropped lines from a copy (D172, from D163); the goal rail
still lay under the steer box at 560 and 640 high (D173); answering a question while another call ran set the run to
thinking (D174). It also found the phone's Pause fixed by the way in `f9dd353`, unrecorded (D175). Iteration 18 fixes
all four and every record-only note: the caveat line says "look first" and docs/12 rule 8 says where the amber ! goes
(D176), CJK caveats stay whole (D177), the phone's mark stands on its title (D178), the live line and the mode follow
the same call, the newest in flight, on the supervisor and the desk (D174, D179), a thumbnail is the width it will be
(D180), a load failure is said in the interface's language (D181), the Chinese held-out list has no space after its
colon (D182), and the dark shimmer brightens what it passes (D183). Each fix's test fails on `f9dd353`'s sources (the
Pause test on `2d3eeb8`'s). Its follow-up, from checks before review: an open question keeps the run waiting on you
whatever starts or ends beside it (D186), the desk takes the later of two calls started in the same millisecond
(D187), and the rail test runs either side of 1281 (D188).

Review 18 (`03999c0` + `54ba274`, iteration 18 and its follow-up) passed at 8.47 / 10 with no P0, P1 or P2 and four
P3s (`design-evidence/reports/review18.md`): scrolled to the end of a short page the rail's head went under the title
bar (D189, from D173); after ⌘⇧↩ and Esc, ↩ commented on line 0 instead of the line pressed (D190); with a question
open beside a running command the phone said silent while the desk said running (D191); and D171's evidence test was
flaky under load (D193). Iteration 19 fixes all four and every record-only note: the live line says whether its call is
in flight, and the desk reads it after a reload (D192); the shots harness waits for code, pictures and colours (D194),
which found a slow first highlight left coarse for the session (D195); a dialog whose time runs out closes (D196);
docs/12 names the hint mark one way (D197); the dark shimmer eases out (D198); a missing side keeps its capture's frame
(D200); the bundle fits again (D201); observed failures are drawn in ink (D202). Two notes are kept by stated decision:
the steer box's width at the fold (D199) and the Chinese caveat label's break at its colon (D203). Each fix's test
fails on `54ba274`'s sources or a stated mutation.

Review 19 (`939be97`, iteration 19) passed at 8.59 / 10 with no P0, P1 or P2 and three P3s
(`design-evidence/reports/review19.md`): a dialog's expiry raced the event pump, so a running command could read as
thinking (D204, from D196); a missing side stood upright beside its picture, a long reason ran taller than the strip
and a URL broke letter by letter (D205: D200 not done); an ended call was still written as what the run was doing
(D206, what D192 left). Iteration 20 fixes all three and every record-only note: highlighting runs again only for a
line cut short (D207); the shots harness names what it still waited for (D208); a merge conflict has its own mark and
name in the sidebar (D209, D211); a question closes before Pi lets it go (D210); the shimmer's fade is a token (D212);
focus handed back to a diff wears a ring where the keyboard acts (D213). From its own checks: two writes that the
engine's reply could overtake now come first (D214), the gates run what CI runs (D215), the bundle fits again (D216),
and the held tags under a criterion are quieter (D217). Each fix's test fails on `939be97`'s sources or a stated
mutation.

Review 20 (`b6baa8a`, iteration 20) passed at 8.63 / 10 with no P0, P1 or P2 and three P3s
(`design-evidence/reports/review20.md`): a question answered the moment it reached the inbox found no dialog and left
the run waiting on you (D218); on the board quick calls changed a row's detail twice each and its elapsed time jumped
(D219, from D206); the focus ring crossed a diff line's number (D220). Iteration 21 fixes all three, every record-only
note and every test weakness it named: a missing side's code stays whole (D221); the goal page's header names the
run while its live line says how long it has gone, the board's elapsed time is whole or set aside, never cut, and a quiet first run is "Run 1" (D224, D225); the
sidebar's count is in ink (D226); the docs say when the detail names the run (D227); every write of the mode beside the
engine's events takes the lock and none covers an open question (D229); `·` leaves the supervisor's strings where the
rule applies (D230); the tests hold the orders they claim (D231–D233). From its own reading, nothing writes a mode over
a stop's (D234), and the icons became markup strings to fit the budget (D235). Four notes are kept by stated decision:
the side-by-side rule (D222), the phone strip's frame width (D223), the merged keys (D228) and where two tests first
fail on old sources (D236). Each fix's test fails on
`b6baa8a`'s sources (D217's on `939be97`'s) or a stated mutation.

Review 21 (`9397e07` with `b59e68a`, iteration 21) passed at 8.69 / 10 with no P0, P1 or P2 and two P3s
(`design-evidence/reports/review21.md`): side by side a missing side's code still broke after `_`, D221's rule doing
nothing in WebKit while its test read the style (D237); an approval's code block read `bash rm -rf …`, a command no
one would run, and the stall title glued the tool to its command (D238, from D230). Iteration 22 fixes both and every
record-only note: the wide frame breaks only an address; the body is the command or path alone and the reason says
what it does; the stop is marked under the mode lock, so a pause beside a settle has the last word (D239), and the
two sentences of D234 without a test have one each (D240); on the board the badge lingers with its call (D242), the
tooltip puts the run's time on its own line (D243), the time reads "elapsed" (D244, D248), a starting run or one with
no start time is named by its number (D245, D246), the docs say so (D247), the English badge column holds both words
(D249), the ring clears the + (D250), the conflict count's ink is tested (D251) and the evidence line ends on its pin
(D252). D241 (the answer's lock held to the send, untested) is kept by stated reason. D221, D227, D230, D233 and D234
now say what review 21 found they overstated. Each fix's test fails on `9397e07`'s sources or a stated mutation; the
clients' approval tests pin that they add nothing to the body, since the clients did not change. The last acceptance
stands on `9397e07` (review 21); iteration 22 was re-reviewed in review 22.

Review 22 (`864d6c3`, iteration 22) passed at 8.81 / 10 with no P0, P1 or P2 and one P3
(`design-evidence/reports/review22.md`), pre-existing: an approval's code block did not tell a row it carried over
from a line of the command's own, and the phone parted `--` and `fill` (D254). Iteration 23 fixes it and every
record-only note: each line of the command is a row the block's width, a carried-over row starts two in under a hook,
and a word moves whole, on the desk and the phone alike; a dialog to a run being stopped is cancelled and opens nothing
(D255); the goal page says the run once where it has no start time (D256, superseding D246); a stall's command and the
ledger's pin are set as code (D257, D261); the tooltip's run and time read as a sentence (D258); the fold of a note said
again lives in the store, and every dialog is its own item on both surfaces (D259); a failed capture says why on the
phone's tab too (D262). D237 and D250 now say what review 22 found (D260, D263), and three sentences without a test
have one (D264). From its own reading: the phone says Chinese times in words (D265), its page's policy lets the marks
draw and its tests serve that policy (D266), and its tails copy blank lines as blank (D267); the trace no longer
writes Tower's own closing of an item (withdrawn, timed out, replaced) as your answer (D268); and the phone page can no
longer be framed by another site (D269). Each fix's test fails on
`864d6c3`'s sources or a stated mutation. The last acceptance stands on `864d6c3` (review 22); iteration 23 was
re-reviewed in review 23.

Review 23 (`43576b0`, iteration 23) passed at 8.56 / 10 with no P0 or P1 and one P2
(`design-evidence/reports/review23.md`), introduced by D254: when a line's first word was longer than a row (a path
approval; a command that starts with a URL), its carried rows began at the block's edge under the hook and a short word
after it slid onto the first row (R23-P2-01, D270). It also found that the hook's test could not tell a hook from a
block, an amber hook or one drawn once (D271) and that D255's lock had no test (D272), with ten record-only notes.
Iteration 24 fixes all of them: a line's first word is the line's own text, so its carried rows hang two in under the
hook, and a word longer than a row fills each row, on the desk and the phone (D270); any white space parts words
(D277); the test reads the hook's fill, tone and grey and its repeat (D271), and its arrow stands clear of the next
character (D278); a stop between the guard's check and the dialog is timed by a test (D272); the agent is told when no
one answered rather than that a person declined (D273), the reason follows a colon (D274), and a dialog cancelled as
the run stops is noted in the trace (D275); Tower's closings are one sentence that names the item, under Tower's mark,
and the opening row names it too (D276), older traces included (D285); each failing check is its own code (D280); Look's
missing frame has one shape and side by side shows its whole reason (D281); the blank lines trimmed at a command's ends
are said so (D279); the phone page's escaping is tested (D282); a reply box's unsent words outlive the card until an
answer goes (D283). From its own visual check: no trace row is an event's name any more ("canary_checked" stood in
every verified goal's trace): the supervisor words the kinds the desk has no row for, and the desk's label keys are
found from the kind, which pays for this iteration's bytes (D286). From its own full gate run: the phone page
repaints only what changed, holds a state while words on a card are selected, and keeps a reply's unsent words as the
desk does (D287). The budget is kept (D284). Each fix's test fails
on `43576b0`'s sources or a stated mutation. The last acceptance stands on `43576b0` (review 23); iteration 24 is not
yet independently re-reviewed.

Review 24 (`af6d189`, iteration 24) passed at 8.66 / 10 with no P0, P1 or P2
(`design-evidence/reports/review24.md`). It found three P3s: on the phone a selection held every card in its old state
while the foot and the gauges told a newer one, and a card answered with words in it selected stayed (R24-P3-01, D288,
from D287); migration 24 took answers a person had worded like Tower's closings (R24-P3-02, D289, from D285); and a word
longer than a row that did not begin its line went down a row whole (R24-P3-03, D290, since D254). It also found that
D272's test could not see where `stopping` was read (D291) and that the hook's test took a text-1 hook or a bar for a
hook (D292), with eleven record-only notes. Iteration 25 fixes all of them: the phone patches block by block, holds
only the card in use and says so, its foot and gauges the state shown (D288); migration 25 gives a person's answers
back by the item's own row, and docs/06 states the exception (D289); a word longer than a row starts where it stands
and fills its rows (D290); D272's read has a hook of its own (D291); the hook's test bounds its tone above and measures
its reach (D292); the CI card's body is one line, which gives acceptance condition 1 its room back (D293); Tower's own
notes carry its mark and the engine's never (D294), with one capital after the colon (D295); older closings read in
today's sentence (D296); unsent words are the item's (D297); a side gone on the phone's tab is a phone's frame with
its reason beside it, D281 reversed there (D298); a Send pressed with a state waiting is sent (D299); and each list
Tower writes takes its language's mark (D301). From its own checks: the trace runs down, never sideways (D302), and
the caches test is timed against itself (D303). The budget is kept (D300). Each fix's test fails on `af6d189`'s sources
or a stated mutation. The last acceptance stands on `af6d189` (review 24); iteration 25 is not yet independently
re-reviewed.

## 13. Function, performance, accessibility — Verified

At the final commit (iteration 25; the gates run on fixtures dumped from the supervisor under test, while another
project's builds ran on the same machine: one-minute load 16–55 throughout):

- **Type check and unit tests:** tsc clean; vitest 45 files, 269 tests.
- **e2e:** Playwright WebKit 441 passed, 1 failed (76 shot tests skip without SHOTS) in the full run, Chinese tests on
  the Chinese supervisor's views. The one failure was the Chinese "the peek's head of a silent run leaves its state to
  Now": the dump, made under that load, had caught G-0002 with a call in flight, and a call in flight is busy, never
  silent (D151). The test now states its premise (the run at rest) and passes with its three neighbours; the full
  suite was not run again locally after that, CI runs it. The suite includes axe on the rich states in both themes. The dev server logs
  "Importing a module script failed" lines (twenty-one at iteration 25's run; twenty-two at iteration 24's final run; twenty-three at iteration 23's final run, twenty-four at its first; twenty-two at iterations 21 and 22; twenty-one at iteration 20; fifteen at iteration 19; twelve at iteration 18; eleven at iteration 17; fewer before):
  pages left by a test while a view was still loading, and three tests on purpose (a view, the steer box, and the
  Chinese failure that fail to load); no test fails.
- **Shots:** 69/69 (`/tmp/tower-design/iter25/allshots`); the harness waits for code loaded on demand, the
  highlighting worker and pictures (D194), and a shot fails if anything is still drawing at its 15 s cap (D208); before/after crops in `design-evidence/marks-*.webp`.
- **Line limit, doc numbers:** pass.
- **Bundle:** all interface JS 163,665 / 163,840 B (175 B left), start-up 56,201 / 65,536 B, goal page
  11,632 / 12,288 B, the same under this iteration's budget script and `af6d189`'s (`final/gates/budget.log`,
  `budget-oldscript.log`). The budget was never raised. Iteration 25's first build was 163,943 B, over by 103: an
  on-demand chunk no longer lists preloads beside it, an unreachable label went and two that said the same became one
  (D300). Iteration 24's additions were paid for by finding the trace's label keys from the event's kind (D286). Iteration 17's first build was 163,953 B, over by 113: its own
  additions were rewritten tighter until it fit. Iteration 18's fixes reached 164,051 B: Vite's modulepreload polyfill
  is off (238 B; WebKit preloads modules itself from Safari 17, and on an older one the start-up chunks load when the
  entry imports them, from disk) and an unused component is gone (D184). Iteration 19's reached 163,837 B: sixteen
  keys that said the same thing in both languages became one each (D201). Iteration 20's reached 163,887 B:
  twenty-nine keys that said the same thing as another became one each (D216). Iteration 21's reached 163,890 B: each
  icon is its markup as a string set into one `<svg>`, not a tree of components (D235).
- **Performance (`perf` project, WebKit, after the suite, under the same load):** passes. A board of 50 goals paints
  in 2445 / 786 / 634 ms against 600 / 473 / 391 ms for the seeded board (medians 786 against 473), inside its 750 ms
  margin (every row measures its identity column); view switches with 50 goals take 58–237 ms against 49–113 ms, their
  medians (about 190 against 70 ms) inside 150 ms. On an idle machine at iteration 24: 1243 / 599 / 334 ms against
  320 / 348 / 310 ms, switch medians about 142 against 58 ms. The running goal page at rest: about 9–11 % of a core in headless WebKit with the shimmer on, 9 % with
  it off (`design-evidence/reports/iter15-shimmer-cpu.md`; the old shimmer cost 33–38 %).
- **Rust:** iteration 25 changed the supervisor (D288, D290, D299: the phone page; D291: the guard's read and its
  hooks; D294, D295: Tower's notes; D297: the update carries the put-aside items; D301: each list's mark; D303: the
  caches test), the core (D294: a note says who wrote it; D296: older closings read; D301) and the store (D289:
  migration 25; D296; D301): rustfmt, workspace clippy and `cargo test --workspace` pass (29 suites, 497 tests, 2
  ignored), the extension's 34 tests and `tools/security-tests.mjs` (118 named tests present) pass, and the flow suite
  passed 5 runs of 5 with ten CPU burners held (one-minute load 35.6–48.1); the loop was stopped there, where earlier
  iterations ran 20. Iteration 24 changed the supervisor (D272, D275: a dialog's guard timed and its cancel noted; D280: each
  failing check its own code; D270, D282, D287: the phone page), the core (D286: an event's words) and the store (D276:
  Tower's closings name their item; D280; D285: migration 24; D286: words on append and on read), and the extension
  (D273, D274: what the agent reads of a dialog no one answered): rustfmt, workspace clippy and `cargo test --workspace`
  pass (29 suites, 494 tests, 2 ignored), the extension's 34 tests and `tools/security-tests.mjs` (118 named tests
  present) pass, and the flow suite passed 20 runs of 20 with ten CPU burners held for the whole run (one-minute load
  18.7–36.4). The flow runs came before D287's change to the phone page's script, which no flow test loads; the
  supervisor's Rust has not changed since. Iteration 23 changed the supervisor (D255: a dialog to a stopping run cancelled; D266: the phone page's
  policy and D269 its frame headers; D254, D257, D265, D267: the phone page; D268: a dialog's timeout closed as
  Tower's), the core and the store (D257: an inbox item's `code`; D259: the fold of a note said again; D268: an item
  Tower closes marked as its own), and the extension (D264: the denial's sentences in `policy.ts`): rustfmt, workspace clippy and
  `cargo test --workspace` pass (29 suites, 490 tests, 2 ignored), the extension's 33 tests and
  `tools/security-tests.mjs` (118 named tests present) pass, and the flow suite passed 20 runs of 20 with ten CPU burners
  held for the whole run (one-minute load 17.5–51.2). Iteration 22 changed the supervisor (D239: the stop marked under the mode lock; D238: an approval's body
  the command alone, the stall title), the core (D238) and the store (D252), and the extension (D238: a path's reason):
  rustfmt, workspace clippy and `cargo test --workspace` pass (29 suites, 485 tests, 2 ignored), the extension's 32
  tests and `tools/security-tests.mjs` pass, and the flow suite passed 20 runs of 20 with ten CPU burners held for the
  whole run (one-minute load 20.3–41.4). Iteration 21 changed the supervisor (D218: a question's inbox item and dialog in one step under the lock,
  an answer with no dialog refused; D229: every write of the mode beside the engine's events under the lock; D234: none
  over a stop's, and no live line at rest), the core and the store (D230: strings without `·`): rustfmt, workspace clippy and `cargo test
  --workspace` pass (29 suites, 480 tests, 2 ignored), and the flow suite passed 20 runs of 20 with ten CPU burners held for the whole run (one-minute load 17.5–48.7).
  Iteration 20 changed the supervisor (D204: one lock for every write of the mode; D210: a question closes
  before Pi's limit; D214: writes before sends): rustfmt, `cargo clippy --workspace --all-targets -- -D warnings` and
  `cargo test --workspace` pass, as CI runs them (D215: 29 suites, 472 tests, 2 ignored), and the flow suite passed 20
  runs of 20. Iteration 19 changed the core, the store and the supervisor (D191, D192: the live line says whether its call
  is in flight; D196: a dialog whose time runs out closes): rustfmt clean and `cargo test -p tower-supervisor
  -p tower-store -p tower-core` passes (388 tests, 2 ignored), its two new flow tests and the store's new unit test
  included. Iteration 18 changed the supervisor and the store (D174, one rule for the call at work, and the live line
  that follows it): 385 tests, 2 ignored. Iteration 17 changed the supervisor (D169): 212 tests, 2 ignored. Iterations
  10–16 changed no Rust; iterations 14–18 changed the phone page the supervisor embeds (`remote.html`, `include_str!`): the crate
  builds and its four `remote` tests pass. At iteration 9: rustfmt;
  clippy `-D warnings`; `cargo test --workspace` passes on an idle machine (29 suites, 461 tests). Once, run while the full
  e2e suite and the shots ran beside it, `evidence::a_criterion_whose_base_did_not_run_keeps_its_canary` failed its
  canary assertion; it passed alone, three times more, and in the full rerun. It drives a real sandboxed `node --test`
  and this work does not touch the verifier or the canary: recorded as load-sensitive, not hidden or retried away.
- **Detector:** the 3 `side-tab` findings are the review pen on hunk headers, kept since the baseline (`app.css`,
  lines not touched since), and the DESIGN.md advisories on the changed stylesheets are on older lines. The redesign
  adds six, each triaged in `DESIGN_REVIEW.md` with no ignore: four `bounce-easing` on the two springs (both now with
  no overshoot; the rule fires on the `linear()` form), one `gradient-text` (the in-view shimmer, a functional state)
  and one `repeating-stripes-gradient` (the phone's hatched "observed" pip). Iteration 14's 5 changed UI files show the
  same 19 findings as at `1c9af8a`. Iteration 15's 17 changed UI files: 20 findings against 21 at `1ad1439`, the
  shimmer's `gradient-text` gone with its `background-clip`, nothing new. Iteration 16's 13 changed UI files and the
  phone page: 20 against 20 at `2408609`, the same findings. Iteration 17's 10 changed UI files and the phone page:
  17 against 17 at `2d3eeb8`, the same findings. Iteration 18's 7 changed UI files and the phone page: 19 against 19
  at `f9dd353`, the same findings. Iteration 19's: 19 against 19 at `54ba274`. Iteration 20's 6 changed UI files: 16
  against 16 at `939be97`, the same findings. Iteration 21's 6: 16 against 16 at `b6baa8a`, the same findings.
  Iteration 22's 4 (the phone page among them): 17 against 17 at `9397e07`, the same findings. Iteration 23's 8 (the
  phone page, `tokens.css` and `Trace.tsx` among them): 17 against 17 at `864d6c3`, the same findings. Iteration 24's 5
  (`DecisionCard.tsx`, `Trace.tsx`, `app.css`, `tokens.css` and the phone page): 17 against 17 at `43576b0`, the same
  findings. Iteration 25's 9 (`DESIGN.md`, `DecisionCard.tsx`, `Look.tsx`, `Trace.tsx`, `app.css`, `refit.ts`,
  `store.ts`, `ext.ts` and the phone page, with `tokens.css`): 17 against 17 at `af6d189`, the same findings, none on a
  line the iteration changed.
- **Hardening probe (iteration 8):** no element past the edge at 1040 and 1440 with long en and zh titles; text
  contrast at least 5.26:1 light and 5.70:1 dark; a focus ring on every Tab stop; nothing animates under reduced motion
  (re-checked for the redesign: the turning marks and the shimmer hold still, `flows.spec.ts`).

**Packaged app (iteration 9).** A debug `Tower.app` (`pnpm tauri build --debug --bundles app`: the built bundle, so the
locale plugin's output too) ran on a demo seeded into its own `TOWER_HOME` with the scripted demo engine — not the
user's `~/.tower`, no model called. Looked at through the accessibility tree, in the background: G-0003's one ledger
row "runs 1, 2" (D91), the folded engine clause (D92), titles with their ids on the board (D23), a schedule "Weekdays
02:00" before its cron (D20, the schedule added to the scratch database, disabled), and the native unsaved-contract
sheet. Screenshots: `design-evidence/packaged-app/`. Not reached there: a pass with caveats (the demo has none) and a
1040 px window (D58, D96); their evidence is the WebKit tests. Iterations 10–18's fixes were not looked at in the packaged
app. Typing into the WebView in the background does not
reach its fields — keys went to the app's shortcuts once (a stray draft, discarded through the app's own sheet).

## 14. Commits — Implemented

`bf31644`, `aa1026b`, `8037e1e`, `3faaf0c`, `2a65eb1`, `815bd99`, `d0dc2a1`, `16ac40c`, `3145645`, `d6f07ef`, `3b11e8e`
(review-8 fixes, refreshed evidence, this report), `4d0b9c4` (the perf run), the iteration-9 commit `7a23f45` (the owner's
remaining list), the iteration-10 commit `deef352` (review 9's findings), the commit recording review 10 (`2cd2c0c`), the
iteration-11 commit `2f1d0c5` (review 10's findings), the commit recording review 11 (`4ea4567`), the iteration-12
commit `886ab38` (review 11's findings), the iteration-13 commit `3ff2ebf` (review 12's findings, with review 12's
report), the status-marks-and-motion commit `1c9af8a` (D119, with review 13's report), the iteration-14 commit `1ad1439`
(review 13's findings), the iteration-15 commit `ae1c049` (review 14's findings and every open note, with review 14's
report), its follow-up `2408609` (D142–D143), the iteration-16 commit `2cd8b3d` (review 15's findings and notes, with
review 15's report), its follow-up `2d3eeb8` (↑↓ in a diff after a press, review 15's verdict corrected, the busy
limit in §15), the iteration-17 commit `f9dd353` (review 16's findings and notes, with review 16's report) and the
iteration-18 commit `03999c0` (review 17's findings and notes, with review 17's report), its follow-up `54ba274`
(D186–D188), the iteration-19 commit `939be97` (review 18's findings and notes, with review 18's report), the
iteration-20 commit `b6baa8a` (review 19's findings and notes, with review 19's report), the iteration-21 commit
`b59e68a` (review 20's findings and notes, with review 20's report), its follow-up `9397e07` (the header names the
run, no mode or live line over a stop), the iteration-22 commit `864d6c3` (review 21's findings and notes, with review
21's report), the iteration-23 commit `4167461` (review 22's findings and notes, with review 22's report), its
follow-up `43576b0` (D268, D269), the iteration-24 commit `af6d189` (review 23's findings and notes, with review 23's report), the iteration-25 commit `ea5db26` (review 24's findings and notes, with review 24's report), the merge of `main` at `70a52e7` (`9c705a2`: #53 made the docs cite decisions and ADRs, not findings; this branch's content is kept under main's citation edits, and the review rounds it had cited in `docs/` are gone the same way) and the commit that records iteration 25's gates.
All are on `design/evolution`, pushed on 2026-11-27 at the owner's request. The user's untracked `.claude/` was never added.

## 15. Remaining issues, risks, limits

Iteration 9 fixed the owner's remaining list: D84 (bundle), D91, D92, D96, D51/D86, the docs/12 drift, D20, D22, D23,
D58 and D97 (evidence) — see `DESIGN_REVIEW.md` for each, with the test that fails on `4d0b9c4`. Iteration 10 fixed
review 9's findings (D98–D106), each with a test that fails on `7a23f45`; review 10 passed it. Iteration 11 fixed
review 10's (D107–D112) and its empty settings test, each with a test that fails on `deef352`; review 11 passed it.
Iteration 12 fixed review 11's (D113–D116), each with a test that fails on `4ea4567`; review 12 passed it.
Iteration 13 fixed review 12's (D117–D118), each with a test that fails on `886ab38`; review 13 passed it and found
D120–D121. The status marks and motion (D119) followed the owner's feedback. Iteration 14 fixed D120–D121, each with
a test that fails on `1c9af8a`'s sources; review 14 passed both and found D122–D126. Iteration 15 fixed those and every
note left open (D127–D141), each with a test that fails on `1ad1439`'s sources or kept by a stated decision; its
follow-up fixed D142–D143, found by its own pixel checks, each with a test that fails on `ae1c049`; review 15 confirmed
them but failed the commit on an older P1, and found D144–D150 and six record-only notes. Iteration 16 fixed
D144–D155, each with a test that fails on `2408609`'s sources, and kept D156 by stated rules; its follow-up made ↑↓
work after a press in a diff (D154); review 16 passed it and found D157–D161 and nine record-only notes. Iteration 17
fixed all of them (D157–D169, reversing D156's keep of the phone's hollow rows) and stale words (D170), each with a
test that fails on `2d3eeb8`'s sources; review 17 passed it and found D171–D175 and ten record-only notes. Iteration 18
fixed all of them (D171–D183), each with a test that fails on `f9dd353`'s sources (D175's on `2d3eeb8`'s); its
follow-up fixed D186–D188, found by its own checks; review 18 passed it and found D189–D193 and thirteen record-only
notes. Iteration 19 fixed all of them (D189–D198, D200–D202), each with a test that fails on `54ba274`'s sources or a
stated mutation, and kept D199 and D203 by stated decisions; review 19 passed it and found D204–D206 and seven
record-only notes. Iteration 20 fixed all of them (D204–D213), each with a test that fails on `939be97`'s sources or
a stated mutation, and D214–D217 from its own checks; review 20 passed it and found D218–D220, eleven record-only
notes and three untested orders. Iteration 21 fixed all of them (D218–D221, D224–D227, D229–D233), each with a test
that fails on `b6baa8a`'s sources or a stated mutation, kept D222, D223, D228 and D236 by stated decisions, and fixed D234–D235
from its own reading and gates; review 21 passed it and found D237–D238 and fourteen record-only notes. Iteration 22
fixed all of them (D237–D240, D242–D252), each with a test that fails on `9397e07`'s sources or a stated mutation,
and kept D241 by stated reason; review 22 passed it and found D254, eight record-only notes and three untested
sentences. Iteration 23 fixed all of them (D254–D264), each with a test that fails on `864d6c3`'s sources or a stated
mutation, and D265–D269 from its own reading; review 23 passed it and found D270 (a P2 it introduced), two tests that
could not fail where they should (D271, D272) and ten record-only notes. Iteration 24 fixed all of them (D270–D283,
D285), each with a test that fails on `43576b0`'s sources or a stated mutation, kept the budget (D284), and fixed D286
from its own check and D287 from its own gate run; review 24 passed it and found D288–D290 (three P3s), two tests a
wrong build could pass (D291, D292) and eleven record-only notes. Iteration 25 fixed all of them (D288–D299, D301),
each with a test that fails on `af6d189`'s sources or a stated mutation, kept the budget (D300), and fixed D302 and
D303 from its own checks; not yet re-reviewed.
What is left:

- **"Busy" has no upper bound (D151).** A run is busy while a tool call is in flight, as the supervisor's live line
  says (`running`, D191–D192): the desk and the phone both read it, the desk naming the call from its own pulse when it
  saw it start. A tool that never returns (a hung command) therefore reads busy for as long as it hangs, never silent,
  with its running time growing ("bash running for 13h") on both. The time is the warning; no limit turns it into
  silence. Review 16 judged this reasonable. One rule holds on both ends, at a call's start, at its end and at an
  answer: the run is at work on the newest call still in flight (not a note, the hand-in or a question), its live line
  names that call, and it is busy until the last one ends or the turn does (D169, D174, D179, D192); while a question
  is open the run waits on you, whatever starts or ends beside it (D186), and a question whose time runs out closes
  (D196), a tenth before Pi's own limit (D210). Every write of the mode takes one lock (D204, D229), a question's inbox
  item and its dialog are one step under it (D218), a write the engine's reply could overtake goes before the send
  (D214), and once a run is stopping nothing writes over the mode it stops on, nor puts up a running live line (D234):
  the stop itself is marked under the lock, so a settle under way finishes before it (D239), and a dialog Pi raises
  after it is cancelled without a card (D255), the agent told that no one answered (D273) and the trace that Tower
  cancelled it (D275).
- **The phone page has no Host or Origin allow-list (D269).** docs/11 §11.9 asks for both. The API answers only to the
  pairing token in the `Authorization` header, kept in the page's own storage, so a rebinding or cross-site page gets
  401; the lists stay unbuilt until the page is served under names Tower can enumerate. Its `script-src` allows inline
  script, wider than §11.10, until the script is a file of its own.
- **A repeated question or approval is not merged (D259).** docs/08 §8.4 merges a question or an approval asked again
  into one item whose answer goes to every dialog it stands for. That is not built: the store folds only notes said
  again (a check failing on another push, a stall), and each dialog is its own item on the desk and the phone, so none
  hides behind another. Pi runs its hooks one at a time, so tower-goal does not raise two at once today.
- **A reply box's unsent words live while the app is open (D297).** They are the item's: they come back with its card,
  move to the item that replaces it in the same update, stay while it is put aside, and go with it once it leaves or
  an answer is sent; a restart clears them.
- **On the phone a card that holds your selection shows what it did until you let go (D288).** Every other card takes
  the new state, and the foot says one card is held; on iOS a selection can outlast a copy, which the foot then
  keeps saying. Tried in desktop WebKit, not on an iPhone.
- **The event log was changed once (D285, D289).** Migrations 24 and 25 set `source` and `auto` on older
  `inbox_resolved` events, never their words; docs/06 §6.6.2 records the exception.

- **Iteration 25 was not independently re-reviewed.** The owner asked for the branch to be pushed and merged once
  its gates passed. The last independent acceptance stands on `af6d189` (review 24, 8.66 / 10); iteration 25's fixes
  rest on tests that fail on `af6d189`'s sources or under a stated mutation, not on a second reader.
- **The bundle has 175 B left** (163,665 / 163,840 B). The budget stays; the next change that adds interface code has
  to make its own room, as iterations 17 to 21, 24 and 25 did.
- **Merged keys couple meanings (D228).** To fit the budget, keys that said the same thing became one (D201, D216): for
  example `trace.output` and `settings.testCheckOutput`, `sidebar.ended` and `state.archived`, `goal.resume` and
  `goal.purposeResume` now share words. Changing one merged key's words changes every place that uses it, so such a
  change checks each use first, or splits the key and pays its bytes.

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
  about 12em with the note at its hint mark, the column itself allowing no more.
- **Run names are worded by the frontend.** The supervisor still writes English labels (`edits.rs`, `timeline.rs`);
  the interface no longer shows them except for a snapshot kind it does not know. The verifier's point is named
  "Verification", not "Verified", so a pass that does not count is never called verified in the picker.
- **The review header now fits by measuring** (`review/fitStats.ts`, a ResizeObserver and a MutationObserver) rather than
  by width band. The sweep test covers 1024–1400 for both fixture goals in both languages; a verdict longer than any
  the fixtures hold would still give way last, but only those widths and verdicts were measured. Its last two steps
  are real since iteration 14 (the key caps step had never run): the key caps, then a gone end's pin, checked every
  1 px at en 1040–1064.
- **Below 1241 px the board's overlap notice is in the title's tooltip only**, as the identity column it replaced was;
  above it the note says as much as leaves the title its room: its words, the other goal's id, or the hint mark alone (what it
  sets aside stays in its tooltip and for a screen reader).

- **D58 covers three caveats.** "Verified, with caveats" is computed for test machinery reached into, assertions not
  checked and a flaky pass; docs/07's other qualifiers (S0, a Node version unlike the profile, an unsupported ecosystem,
  opportunistic verification) are not computed yet. A caveat is confirmed by two presses, not a written reason.
- **docs/12 still specifies five things the code does not render** (the revert badge, the dependency notice, the review
  backlog head and bar, the hunk author's line style): future specs, left as written, the last now said so in §12.4.4.
  (An integrated goal merged without the verifier's pass now has a hatched core, D141: no longer colour alone.)
- **Supervisor text is written in the language of the moment.** A goal's findings and pauses keep the words they were
  written in; switching the interface language does not rewrite stored events, and an older closing of Tower's is said
  in today's sentence in the language it was written in (D296). The trace's words for a kind the desk
  has no row for (D286) are the supervisor's at the moment the trace is read or the event arrives: a trace open while
  the language changes keeps them until it is read again. Test output and the prompts Tower sends
  the agent stay as they are, by design.
- **11px labels and 10px keycaps (D54/D85), Kept by decision.** No sentence is below 12px; the ledger's runs note
  ("said in runs 1 and 2") is 11px by design (D110), a note about the claim set apart by size as well as grey.
- **Packaged-app evidence is a debug build on a seeded demo**, looked at, not driven by an automated suite; D58 and D96
  were not reachable there.
- **One Rust integration test is load-sensitive** (§13).
- **Impeccable critique history is not saved across sessions.** The tool suggests `npx impeccable login` for that;
  it was not run, since it is an account action.
