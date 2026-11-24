# Design review — consolidated audit and design contract

Baseline: `bf22cad` (branch `design/evolution`, 2026-11-25). Every screenshot path below is under
`/tmp/tower-design/` (working evidence, not committed); the curated before/after pairs are in `design-evidence/`.

## Sources

| Key | Audit | Who | Where |
|---|---|---|---|
| M | Product, IA, workflow, engineering (Audit A) | main agent | `audit-main.md` |
| U | Unslop signs audit (Audit B) — verdict *light slop*, polish in the existing direction | main agent with the unslop skill | `audit-main.md` |
| IA | Impeccable critique, isolated assessment (27/40) | Impeccable sub-agent A | `impeccable-A.md` |
| IB | Impeccable detector + browser evidence | Impeccable sub-agent B | `impeccable-B.md`, `b-detect/` |
| R | Independent baseline review — **FAIL**, no P0, six P1 | `frontend-reviewer` (independent) | `review-baseline/report.md` |
| C | Independent concept review of three goal-page directions | `frontend-reviewer` (independent) | `review-concept/report.md` |

External research (Linear, GitHub/Graphite review, Gerrit, Buildkite/CircleCI, Sentry, Datadog, Phabricator) is in
`research.md` with sources; the mechanisms adopted are cited per issue.

## Consolidated issues

Severity: P0 breaks the product's promise or loses data; P1 blocks a core task or misleads; P2 costs time or trust;
P3 polish. Status: Open / Fixed (implemented and verified) / Kept (deliberate, with reason) / Deferred (with reason).

| ID | Sev | Issue | Sources | Evidence | Root cause | Status |
|---|---|---|---|---|---|---|
| D01 | P1 | The goal page buries the evidence: criteria start below the fold at 1440×900 (top 989px), after the agent's own "Cause"; the verdict is a small line in the top-right column. | M2, R-P1-01, IA, C | `baseline/shots/goal-G-0001-en-light.png`, `review-baseline/flows/log-goal.txt` | Sections were added feature by feature; the header puts the verdict in the side column, away from the reading path. | Fixed (T09): verdict, two tracks and the review action sit under the title; high sentinels lead as one exception block; criteria heading at ~584px of 900 — not yet independently reviewed |
| D02 | P1 | A criterion's detail reads like a debug log: passed C1 carries a red "Assertion tamper" tag; phrases repeat inside one criterion; three indents; internal terms ("Base→Pin proved", "Guard multi-proc gap"). | R-P1-02, IA | `review-baseline/crops/goal-criteria-C1C2.png` | Each guard appends its own sub-line; no rule for one fact once per criterion. | Fixed (T10): one strip per row, plain words, sentence-covered pills dropped, guard detail only when open — not yet independently reviewed |
| D03 | P1 | Fact and claim are not told apart at a glance: the agent's "Summary" is labelled only "Summary"; the ledger's "Unsupported" is plain grey. | R-P1-03 | `review-baseline/crops/goal-changes-claims.png` | The claim register depends on a 1px dashed rule; labels name the kind, not the speaker. | Fixed (T09): every claim's label column names the speaker ("Agent says"); the claim kind leads its text |
| D04 | P1 | j/k on the board opens each decision into its card: rows below jump 371→746→520→487→700 px. | R-P1-04 | `review-baseline/flows/log-board.txt` | Selection and expansion were one state. | Fixed |
| D05 | P1 | The accept sheet disables Accept without a visible reason (tooltip only); the git-identity blocker sits under the sticky action bar. | R-P1-05, M7 | `review-baseline/flows/06-accept-sheet-ticked.png` | Blockers were rendered after the informational lists; the reason lived in `title`. | Fixed |
| D06 | P1 | One goal, five names: G-0001 is "Ready to accept" in ⌘K and Operations while its header says the pass doesn't count; the review header's Accept is always the black primary. | R-P1-06, IA, M3 | `review-baseline/flows/03-palette-cart.png`, `baseline/shots/final-operations-light.png` | Surfaces printed the lifecycle state, not state plus verdict; button weight did not follow evidence. | Fixed |
| D07 | P2 | Palette and peek drawer are translucent: the board's text reads through their rows. | M1, R-P2-01, U | `baseline/shots/final-peek-drawer-dark.png` | `--material-float` relies on backdrop blur; reading sheets were given floating material. | Fixed |
| D08 | P2 | Board hints say "␣ peek · R review", but Space and R do nothing on decision lines; Space is missing from the key sheet. | R-P2-02 | `review-baseline/flows/log-board.txt` | Handlers only accepted `kind === "goal"`. | Fixed (iteration 3, milestone P1-01): the decision line's title button hands Space to the peek, so Space opens the peek drawer in place and the rows do not move; Escape returns focus. e2e `flows.spec.ts` board test |
| D09 | P2 | Review first paints line numbers without code, then plain code, then highlighting. | R-P2-03 | `review-baseline/flows/05-review-start.png` | Highlighting and text arrive in separate passes. | Fixed (iteration 3, milestone P3-01): no wait with hidden code; the first frame has line numbers and code in the plain foreground, colours tint in when the worker sends them. e2e `review-keys.spec.ts` (worker held back 600 ms: code visible, non-empty, `visibility: visible`) |
| D10 | P2 | Amber, the only interrupting colour, is the inbox's focus ground; ◆ repeats per sidebar row; board decision lines lose the lifecycle glyph. | R-P2-04 | `review-baseline/crops/inbox-j-small.png` | Attention tint reused as a selection tint. | Fixed (T12 + iteration 3): board decision lines carry the goal's lifecycle glyph (◆ only when the goal is unknown) |
| D11 | P2 | The shell repeats itself: on Overview the same four goals appear in nav, sidebar groups and board; "To review" goes to the same route as "Needs you"; the top bar holds static configuration. | M4, M9, R-P2-05 | `baseline/shots/overview-en-light.png` | Sidebar groups mirror the board; nav entry added for a count. | Fixed (T13): "To review" starts the review queue (⇧R) instead of opening Needs you again |
| D12 | P2 | Needs-you lines on the board show no evidence; two row formats. | R-P2-06 | `baseline/shots/overview-en-light.png` | Decision lines use their own column span. | Fixed (iteration 3, milestone P2-03): a decision line shows the lifecycle glyph and, for a goal waiting for acceptance, its verdict word ("Passed, doesn't count") in text-2 before the ask, set apart by a gap (no middle dot: docs/12) |
| D13 | P2 | Contract editor: focus starts on the page body; criteria below three optional text boxes; tracked capitals masthead; ~20 controls at one level. | M5, R-P2-07, U | `baseline/shots/contract-en-light.png`, `review-baseline/flows/log-contract.txt` | Form order followed the data model. | Fixed (T04, T17): criteria second; a new contract focuses its intent (the title is optional and made from it — chosen over the roadmap's "title"), an added criterion focuses its title |
| D14 | P2 | "Accept" means both a hunk's reading mark and accepting the goal; Revert sits beside the reading mark. | R-P2-08 | `review-baseline/flows/05-review-start.png` | Reading mark was named after the seal. | Fixed (after aa1026b): in English the hunk mark is "Mark read" / "Read, n lines folded" / "n/m hunks read", so "Accept" names only the goal; zh now matches (标为已读 / 已读 {n}/{total} 块, iteration 3; it said 接受区块). Revert stays beside it: it asks before it writes (`undoHunkConfirm`) |
| D15 | P2 | The empty board shows skeleton bars under "No active goals" — reads as loading. | R-P2-09 | `baseline/shots/overview-empty-en-light.png` | Ghost rows reused from the loading state. | Fixed (T14): an empty board shows only its empty state |
| D16 | P2 | Type: 11px reading text (decision notes, held-out chips); fractional sizes (11.076, 11.5375, 14.768px); section heads only weight-distinct. | R-P2-10, IB | `impeccable-B.md` | Scale applied through `em` maths and the 11px hint step. | Fixed for reading text (T03). Kept by decision: the fractional px are one rule, mono set at `max(0.923em, 11.5px)` so its x-height matches the UI face it sits in (base.css `.code-val`, `.mono`); on the 2× displays Tower ships on they render crisply, and a fixed mono step would break that match in every context. Section heads at the body size, told by weight, follow the macOS sidebar/inspector convention |
| D17 | P2 | Copy: "Passed, not evidence" is a contradiction to parse under load; lazy plurals "sentinel(s)"; private words ("Ratify", "Memory ratification", "Live telemetry", "Posture"). | M3, M6, IA | `baseline/shots/review-G-0001-accept-en-light.png` | Engineering vocabulary surfaced as copy. | Fixed (T02, T15): "doesn't count / 不作数"; plurals; "ratify" → "approve"; peek bands "Now / Evidence / Budget and next step" |
| D18 | P2 | Review can hide what matters: a moved/formatting fold has no guard against added or deleted hunks; the risk reason exists only in a tooltip. | IA, M, R-P3-05 | `src/views/review/FileDiff.tsx:79`, `review/sidebar.tsx:36` | Fold heuristics trusted the supervisor's hint; risk explained in `title`. | Fixed (T11): added/deleted files never fold; the first risk reason is written on the unit row; fixture units in the supervisor's order (riskiest first) |
| D19 | P3 | Learning draws statistics in verifier green and danger red. | M8, R-P3-03, U | `baseline/shots/final-learning-light.png` | Status hues reused as series colours. | Fixed |
| D20 | P3 | Operations: raw cron only; "Next" without time zone; storage bars all full; mixed button styles. | R-P3-02 | `baseline/shots/final-operations-light.png` | Table built from data fields. | Partly fixed (iteration 3): "Next / Last (local time)" says its zone beside "Cron (UTC)"; each storage bar is the goal's share of all Tower storage, so equal goals are equal half bars; the section heads lose their CSS dots (D38) and the head says "Cron (UTC)" only while there is no table whose Cron column says it. Kept: one bordered action per table row ("Verify again", "Clean"), the rest ghost — a hierarchy, not a mix. Raw cron is kept (the expression is what the user typed and edits) |
| D21 | P3 | Review empty state squeezed into the left column. | R-P3-04 | `baseline/shots/review-empty-en-light.png` | — | Fixed (after aa1026b): the empty review drops the wordmark and starts its words on the title's line, a fifth of the way down |
| D22 | P3 | Welcome reads as a landing template inside the app shell. | R-P3-06 | `baseline/shots/welcome-clean-en-light.png` | — | Deferred (taste; lowest priority) |
| D23 | P3 | At 1800px a row's title and its ID are ~1300px apart. | R-P3-07 | `baseline/shots/overview-en-light-1800.png` | Identity set flush right by design. | Open |
| D24 | P3 | "Abandon" looks like an ordinary button until pressed. | R-P3-01 vs C-P2-03 | — | — | Kept: docs/12 §12.4.3 keeps danger red off a resting button; the reviewers disagree and the system rule decides. |
| D25 | P3 | Disabled MicroVM tier: its explanation fades to 50% opacity (fails contrast). | IB | `impeccable-B.md` | Opacity on the whole label. | Fixed |
| D26 | — | Bundle headroom under 2 KB (162,742 / 163,840 B). | M10 | `DESIGN_PROGRESS.md` | — | Constraint on every change |
| D27 | P3 | The stamp is the only display-size type, framed dashed-in-dashed when tampered. | M3, R-P2-10 | `baseline/shots/review-G-0001-accept-en-light.png` | — | Kept: the stamp is the product's documented signature (app.css "The stamp: Tower's signature"); only its words change (D17). |
| D28 | P1 | A high sentinel's explanation is clamped to one line; the first one has no code line, so its only evidence (which criterion, what to check) is cut and reachable only by hover. Regression from T09. | milestone P1-02 | `review-milestone` `shots/goal-G-0001-en-light.png` | One-line clamp applied to every high sentinel's prose. | Fixed (iteration 3): high-sentinel prose unclamped, no `title`-only text; review notes for high sentinels show the first non-code line of the explanation. e2e asserts no overflow, no clamp, no title, and the note line |
| D29 | P2 | Qualifier pills on passing criteria have no tone rule: C1 "runner patched" amber, C2 "assertions not checked" grey though both stem from high sentinels; C2 open repeats "held-out tests, for you only". | milestone P2-01 | `flows/goal-c2-open.png` | Dedupe in `CriterionRow.shown()` keeps one tone per text, not per meaning. | Fixed (iteration 3): pills keep the strongest tone per label (danger on a passing criterion reads as attention), so both canary pills are amber; the held-out files row no longer repeats "held-out tests, for you only" |
| D30 | P2 | The low-sentinel fold puts `~/.ssh/config` next to another sentinel's title. | milestone P2-02 | `flows/goal-low-fold.png` | Path and titles are joined separately. | Fixed (iteration 3): each folded title prints with its own path; titles with a sensitive path sort first |
| D31 | P3 | R on the board opens an empty review for a goal with no changes. | milestone P3-02 | `flows/board-R-on-decision.png` | R ignores the diffstat. | Fixed (iteration 3): R on a board goal with no changed files opens its page (e2e "R on a board goal with nothing changed yet opens its page"); the goal page offers "Open changes" only when files changed |
| D32 | P3 | Accept sheet: blockers split around the stamp; two "Sentinels" sub-heads. | milestone P3-03 | `shots/review-G-0001-accept-en-light.png` | — | Fixed (iteration 3): human checks follow the blockers, before the stamp; one "Sentinels" sub-head; the footer joins its reasons as words ("; " / "；") |
| D33 | P3 | Contract: Title not marked optional though focus skips it; disabled MicroVM looks available, no reason; masthead "Contract shop New" reads as three words. | milestone P3-04 | `shots/contract-en-light.png` | — | Fixed (iteration 3): "Title (optional)"; MicroVM says "Needs macOS 26 and the container CLI"; masthead "New contract  shop" (state, gap, project in text-1) |
| D34 | P3 | The shortcut sheet lists Space only when a row is selected; the hint bar always shows it. | milestone P3-05 | `shots/shortcuts-en-light.png` | — | Fixed (iteration 3): Space is always listed in the board's key sheet |
| D35 | P3 | G-0002: two hairlines with nothing between them under the live line. | milestone P3-06 | `flows/goal-G0002-1100.png` | An empty section still draws its rule. | Fixed (iteration 3): the live line drops its rule when a section with its own rule follows |
| D36 | P3 | Section state repeated per row: "Needs your confirmation" on every high sentinel; "Check during review" under the heading of the same name. | milestone P3-07 | `flows/goal-low-open.png` | — | Fixed (iteration 3): "Needs your confirmation" once at the Sentinels head; rows carry no per-row label; the low fold's state is its section title. e2e asserts rows do not repeat it |
| D37 | P3 | The goal's R action changes place and name with state ("Review 1 file" in the verdict line, "Changes" top right); at 1100 the button wraps alone. | milestone P3-08 | `flows/goal-G0001-en-light-1100-full.png` | — | Fixed (iteration 3): one review action, in the verdict line ("Review n files R"), wrapping with the criteria bar as one track; "Changes R" removed from the actions; R needs changed files |
| D38 | P3 | The middle-dot rule (`1d6f58c`: only the criteria scale and budget line) is broken by four CSS `::before` dots: console section heads (Operations "Scheduled goals · 2 · …"), the goal identity line, the evidence strip, the review key bar. The e2e check reads text nodes only, so it passed. | own audit, iteration 3 | `iter3/shots/final-operations-light.png` | Generated content escapes a text-node walk. | Fixed (iteration 3): all four are gaps — `--sp-3` between fields of a meta or identity line, `--sp-4` between key hints like the board's key bar; the e2e check now reads `::before`/`::after` and covers Operations and Learning (verified failing on the old CSS); docs/12 notes how ` · ` in its examples renders |
| D39 | P1 | Accept sheet checklist: every clear row ("Snapshot fresh", "0 high sentinels", "Human checks clear", "Merge prediction clear") wore a green ✓ drawn by CSS — green on Tower's own and the human's checks, against AC8 and the hard gate "a green … step tick". The overlap row wore amber ◆ while the goal page marks it ◇. Pre-existing (`124d397`), missed by my AC8 pass and by the earlier reviews; found by the DESIGN.md documenter. | documenter, iteration 3 | `workbenches.css:387`, `panels.tsx:347` | Status glyphs drawn as CSS text, outside the glyph components the rules are checked on. | Fixed (after `3faaf0c`): clear rows take a neutral check (text-3), "needs you" rows ◆, the overlap ◇, danger ■ — the SVG glyph components; e2e `accept.spec.ts` resolves `--st-verified` and finds no element or pseudo-element in that colour on a verified goal (fails on the old CSS: three green ticks) |
| D40 | P3 | Three more visible middle dots the check skipped because they were `aria-hidden`: the review status bar ("n/m hunks read · V next unit"), the goal rail's sandbox line ("S2 Seatbelt · No network"); plus a claim frame's "Agent says · Next" and the merge queue's conflict files. | documenter + own check | `iter3/shots/goal-G-0001-en-light.png` | The check exempted `aria-hidden` content, which is still seen. | Fixed (after `3faaf0c`): gaps (`.sep:empty`), conflict files joined with ", "; the check no longer exempts `aria-hidden` |

Test-data artefacts found while auditing (not product defects, but they mislead screenshots): the rich fixture puts the
risk-0 unit before the risk-3 unit although the supervisor sorts by risk; `moved_hunks` is set on an *added* file.

## Direction

Unslop direction, kept from the existing brand (polish mode):

- Product: a desk where one engineer runs several coding agents and steps in only for decisions and review.
- Character: still, exact, sceptical.
- World: a control tower at night — flight strips, instrument readouts, a logbook.
- Moments: the evidence gauge (verified vs observed criteria) and the diff under review.
- Signature: the provenance gutter (Measured / Agent says / You) and the amber diamond that means "needs you".

Goal page: three candidates were prototyped (`concepts/c1-*.png` evidence first, `c2-*` facts|claims ledger,
`c3-*` path to the seal) and reviewed independently. Verdict: none as drawn; **C1 as the skeleton**, with C3's
"blocks acceptance" wording for the ready-to-accept state and C2's one-line contract at narrow widths; C2 rejected
(gives the agent's claims half the page), C3 rejected as a skeleton (P0: a green tick and a single "1 of 5" count).

## Design contract

Measurable; checked by script or by the independent reviewer on the same fixtures, at 1440×900 and 1100×900,
en/light and zh-CN/dark, unless a line says otherwise.

| # | Criterion | How it is checked |
|---|---|---|
| AC1 | On `goal/G-0001` the verdict and the two-track counts (`Verified V/M · Observed O/M`, human `h/k` apart) sit on the title's reading path, within 120px below the title, and the acceptance-criteria heading starts above 600px at 1440×900. No agent-authored block (Cause, Next, Summary) sits above the criteria. | bounding boxes in e2e; screenshot |
| AC2 | A high-severity sentinel is shown before the criteria with its evidence lines; low sentinels fold to one line that still names the most sensitive path. | screenshot; e2e text |
| AC3 | Each criterion's default view is at most two lines; a passed criterion never carries a danger-coloured tag; one fact appears once per criterion; sub-lines share one indent. | DOM check on G-0001 C1/C2/C5 |
| AC4 | Every agent-authored text on the goal page says it is the agent's ("Agent says" / "Agent 称") or sits in the claim register with that label; an unsupported or contradicted claim in the ledger is not plain grey. | DOM/text check |
| AC5 | Board: five presses of `j` leave the first goal row's top unchanged; a decision opens only on Enter or click; Space and R act on the selected line's goal. | e2e (`flows.spec.ts`) |
| AC6 | Accept sheet: when Accept is disabled, a visible line beside it names every blocker and focuses the first one on click; blockers come before the informational lists. | unit + e2e |
| AC7 | A goal whose pass doesn't count is never called "Ready"/"Ready to accept" on any surface (palette, peek, Operations, briefing, aria); the review header's Accept is primary only when the verifier's pass counts and no high sentinel stands. | unit + e2e |
| AC8 | Green appears only on a verifier result or a verified goal glyph — never on a statistic, an aggregate, or a step. No single N/M across categories. | review of every screenshot; grep of `--st-verified` users |
| AC9 | No reading text (a sentence) below 12px; the detector reports no `tiny-text` or `low-contrast` on changed files. | `impeccable detect --json` |
| AC10 | Engineering: `tsc`, vitest, the e2e suites touched, `shots.spec.ts`, `tools/line-limit.sh`, `tools/bundle-budget.sh` all pass; axe checks in e2e pass. | commands, logs |
| AC11 | The final independent review scores ≥ 8/10 weighted on the brief's rubric, with no open P0/P1. | fresh `frontend-reviewer` |

Hard gates (any one fails the work): a green aggregate or step tick; a claim drawn as a fact; a user's existing change
lost; a test weakened to pass; a budget raised to fit.

## docs/12 drift found while writing DESIGN.md

`DESIGN.md` (written by the impeccable-documenter from the code at `3faaf0c`) records what the code does. The
documenter listed 17 places where `docs/12-visual-design-system.md` says otherwise; most predate this work. They are not
reconciled here: which side is canonical is the owner's call, and rewriting docs/12 wholesale is outside a design pass.
In short: docs/12 still has a violet accent and accent focus ring (code: none, ink ring); a low-chroma running blue
(code: 0.50/0.78 C 0.13); text-4 values (code: AA-safe 0.525/0.645); a translucent overlay (code: opaque, D07);
`liga, calt, ss02` (code: `calt, cv01, ss03`, mono without ligatures); section title 14/500 text-2 (code: 13/500
text-1); weights 400/500 only (code: also 580 stamp, 600 large seal and wordmark); a 2px spacing step and radii
4/6/8/12 (code: 4px grid, 3/4/6/10); a 132px goal card, 48px rail and 560px drawer (code: 40px rows, 340px rail,
448px drawer); overlay shadow 0 8 24 /.28 (code: 0 16 48 /.45); easing curves; "no celebration" on accept (code: a
220ms stamp impression); Lucide icons (code: its own one-pen SVG set); claim, human and fact marks as left borders and
framed chips (code: the provenance gutter, a 2px text-1 pen, an unframed fact with a harness mark); the 5-line goal
card (code: the flight-strip row, as docs/19 §19.2 says). Also defined but unused: `--prov-*`, `--bg-strip`,
`--bg-well`, `--border-instrument`. Some marks are still CSS text glyphs (risk badges `■`), not the SVG set.

## Reviews of this work

Filled in as reviews arrive; each entry names the reviewer, the commit, the verdict and where the report is.

| When | Reviewer | Commit | Verdict | Report |
|---|---|---|---|---|
| Baseline | frontend-reviewer (independent agent) | `bf22cad` | Not accepted | `/tmp/tower-design/review-baseline/report.md` |
| Concept | frontend-reviewer (independent agent) | C1–C3 sketches | C1 chosen with conditions | `/tmp/tower-design/review-concept/report.md` |
| Milestone (iteration 2) | frontend-reviewer (independent agent), read-only worktree, own port | `aa1026b` | **Not accepted: 7.4 / 10**, P1-01 (board Space), P1-02 (clamped sentinel prose); AC1, AC4, AC6, AC7, AC8, AC10 met; AC2, AC5, AC11 not met; AC3, AC9 partly | `/tmp/tower-design/review-milestone/report.md`, evidence `/tmp/tower-design/review2-0239/` |

Milestone P2-04 (hunk "Accept") and the empty-review half of P3-02 were already fixed in `8037e1e`, after the
reviewed commit; they are re-checked in the next review, not marked accepted.

## Detector triage

`impeccable detect --json` on the files changed in batch 2 (`/tmp/tower-design/detect-batch2.json`): three
`side-tab` warnings, the same three as the baseline (`b-src.json`): the 2px solid inset rule on
`.hunk-head.hunk-accepted` / `.hunk-current` cells. Kept, no ignore added: it is the Human register's pen
(docs/12: your own marks are a solid text-1 rule), drawn on square table cells, not a coloured bar on a rounded card;
e2e `review-keys.spec.ts` asserts it is text-3 / text-1, never an accent. No `tiny-text`, `low-contrast` or other
finding on changed files (AC9 holds).
