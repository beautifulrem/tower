# Design evolution — final delivery

Branch `design/evolution`, from `main` at `bf22cad`, twelve local commits, nothing pushed, merged or deployed. Working
evidence is under `/tmp/tower-design/` (not committed); curated evidence is in `design-evidence/`. Status words:
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

`/tmp/tower-design/research.md` covers:

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

Every review used the user's `frontend-reviewer` agent, in a fresh read-only worktree on its own port. The reviewers
never edited code. Reports are under `/tmp/tower-design/review*/report.md`.

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

Review 8 raised four P3s. Two were introduced by iteration 8's own fixes: the peek head called a waiting run
"Unresponsive", and the sidebar still said "Needs you" for a goal in To review. Two were older: the cron broke at
1040 px, and a dot was left at the end of the review header.

The last commit fixes the first two and the cron, and the dot half of the fourth, each with a test that fails on
`d6f07ef`. Those fixes are **Verified, not independently re-reviewed**: the acceptance stands on `d6f07ef`.

## 13. Function, performance, accessibility — Verified

At the final commit:

- **Type check and unit tests:** tsc clean; vitest 41 files, 220 tests.
- **e2e:** Playwright WebKit 331 passed, 0 failed (76 shot tests skip without SHOTS). The suite includes axe on the rich
  states in both themes.
- **Shots:** 69/69.
- **Line limit:** passes.
- **Bundle:** all interface JS 163,720 / 163,840 B, goal page 11,437 / 12,288 B. The budget was never raised.
- **Performance (`perf` project, WebKit):** passes. A board of 50 goals paints in 549 / 265 / 185 ms against 179 / 167 /
  116 ms for the seeded board, inside its 750 ms margin. View switches with 50 goals take 31–67 ms
  (`/tmp/tower-design/iter8b/checks/perf.log`).
- **Hardening probe:**
  - no element runs past the edge at 1040 and 1440 with long en and zh titles;
  - text contrast at least 5.26:1 light and 5.70:1 dark;
  - a focus ring on every Tab stop;
  - nothing animates under reduced motion.
- **Long titles:** iteration 8 added three lengths × 5 widths (from the 1040 px minimum) × 4 routes.

Unverified: real macOS Tauri runtime behaviour. Everything was exercised in WebKit with stubbed IPC and dumped real
views, not in the packaged app.

## 14. Commits — Implemented

`bf31644`, `aa1026b`, `8037e1e`, `3faaf0c`, `2a65eb1`, `815bd99`, `d0dc2a1`, `16ac40c`, `3145645`, `d6f07ef`, `3b11e8e`
(review-8 fixes, refreshed evidence, this report) and the last commit on the branch, which records the perf run here. All are on `design/evolution`, local only. The user's untracked `.claude/` was never added.

## 15. Remaining issues, risks, limits

- **Bundle headroom is 120 B (D84), Deferred.** The next feature must first pay for itself: a copy diet over the long
  hints, or per-surface locale bundles. The budget was not raised.
- **Duplicate-looking claims across runs (D91), Deferred.** The same claim from two runs shows twice without the run
  number.
- **Contract editor advanced section opens by default (D92 part), Deferred.** A native `<details>` would be cheap; what
  its one-line summary says is a design pass of its own.
- **Comparing runs at 1040 px drops the seal and verdict from the review header (D96 part), Deferred.** This is the
  header's designed drop order. Making the verdict the last to go changes that order.
- **Supervisor and fixture English in the zh interface (D51/D86), Deferred.** This is on the data side.
- **11px labels and 10px keycaps (D54/D85), Kept by decision.** No sentence is below 12px.
- **Raw cron expression in Operations (D20), Deferred.**
- **Welcome page as a landing template (D22), Deferred.**
- **Title and ID far apart at 1800 (D23), Open.**
- **Whether the sidebar should mirror the board (D58), an owner question.**
- **`docs/12` disagrees with the code in 17 places.** The owner decides which side is canonical.
- **Evidence is WebKit with stubbed IPC, not the packaged app.** Working evidence in `/tmp` is not durable.
- **Impeccable critique history is not saved across sessions.** The tool suggests `npx impeccable login` for that;
  it was not run, since it is an account action.
