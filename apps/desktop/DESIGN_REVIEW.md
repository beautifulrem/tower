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
| D01 | P1 | The goal page buries the evidence: criteria start below the fold at 1440×900 (top 989px), after the agent's own "Cause"; the verdict is a small line in the top-right column. | M2, R-P1-01, IA, C | `baseline/shots/goal-G-0001-en-light.png`, `review-baseline/flows/log-goal.txt` | Sections were added feature by feature; the header puts the verdict in the side column, away from the reading path. | Open |
| D02 | P1 | A criterion's detail reads like a debug log: passed C1 carries a red "Assertion tamper" tag; phrases repeat inside one criterion; three indents; internal terms ("Base→Pin proved", "Guard multi-proc gap"). | R-P1-02, IA | `review-baseline/crops/goal-criteria-C1C2.png` | Each guard appends its own sub-line; no rule for one fact once per criterion. | Open |
| D03 | P1 | Fact and claim are not told apart at a glance: the agent's "Summary" is labelled only "Summary"; the ledger's "Unsupported" is plain grey. | R-P1-03 | `review-baseline/crops/goal-changes-claims.png` | The claim register depends on a 1px dashed rule; labels name the kind, not the speaker. | Open |
| D04 | P1 | j/k on the board opens each decision into its card: rows below jump 371→746→520→487→700 px. | R-P1-04 | `review-baseline/flows/log-board.txt` | Selection and expansion were one state. | Fixed |
| D05 | P1 | The accept sheet disables Accept without a visible reason (tooltip only); the git-identity blocker sits under the sticky action bar. | R-P1-05, M7 | `review-baseline/flows/06-accept-sheet-ticked.png` | Blockers were rendered after the informational lists; the reason lived in `title`. | Fixed |
| D06 | P1 | One goal, five names: G-0001 is "Ready to accept" in ⌘K and Operations while its header says the pass doesn't count; the review header's Accept is always the black primary. | R-P1-06, IA, M3 | `review-baseline/flows/03-palette-cart.png`, `baseline/shots/final-operations-light.png` | Surfaces printed the lifecycle state, not state plus verdict; button weight did not follow evidence. | Fixed |
| D07 | P2 | Palette and peek drawer are translucent: the board's text reads through their rows. | M1, R-P2-01, U | `baseline/shots/final-peek-drawer-dark.png` | `--material-float` relies on backdrop blur; reading sheets were given floating material. | Fixed |
| D08 | P2 | Board hints say "␣ peek · R review", but Space and R do nothing on decision lines; Space is missing from the key sheet. | R-P2-02 | `review-baseline/flows/log-board.txt` | Handlers only accepted `kind === "goal"`. | Fixed |
| D09 | P2 | Review first paints line numbers without code, then plain code, then highlighting. | R-P2-03 | `review-baseline/flows/05-review-start.png` | Highlighting and text arrive in separate passes. | Open |
| D10 | P2 | Amber, the only interrupting colour, is the inbox's focus ground; ◆ repeats per sidebar row; board decision lines lose the lifecycle glyph. | R-P2-04 | `review-baseline/crops/inbox-j-small.png` | Attention tint reused as a selection tint. | Open |
| D11 | P2 | The shell repeats itself: on Overview the same four goals appear in nav, sidebar groups and board; "To review" goes to the same route as "Needs you"; the top bar holds static configuration. | M4, M9, R-P2-05 | `baseline/shots/overview-en-light.png` | Sidebar groups mirror the board; nav entry added for a count. | Open |
| D12 | P2 | Needs-you lines on the board show no evidence; two row formats. | R-P2-06 | `baseline/shots/overview-en-light.png` | Decision lines use their own column span. | Open |
| D13 | P2 | Contract editor: focus starts on the page body; criteria below three optional text boxes; tracked capitals masthead; ~20 controls at one level. | M5, R-P2-07, U | `baseline/shots/contract-en-light.png`, `review-baseline/flows/log-contract.txt` | Form order followed the data model. | Partly fixed (order, masthead) |
| D14 | P2 | "Accept" means both a hunk's reading mark and accepting the goal; Revert sits beside the reading mark. | R-P2-08 | `review-baseline/flows/05-review-start.png` | Reading mark was named after the seal. | Open |
| D15 | P2 | The empty board shows skeleton bars under "No active goals" — reads as loading. | R-P2-09 | `baseline/shots/overview-empty-en-light.png` | Ghost rows reused from the loading state. | Open |
| D16 | P2 | Type: 11px reading text (decision notes, held-out chips); fractional sizes (11.076, 11.5375, 14.768px); section heads only weight-distinct. | R-P2-10, IB | `impeccable-B.md` | Scale applied through `em` maths and the 11px hint step. | Partly fixed (11px reading text) |
| D17 | P2 | Copy: "Passed, not evidence" is a contradiction to parse under load; lazy plurals "sentinel(s)"; private words ("Ratify", "Memory ratification", "Live telemetry", "Posture"). | M3, M6, IA | `baseline/shots/review-G-0001-accept-en-light.png` | Engineering vocabulary surfaced as copy. | Partly fixed |
| D18 | P2 | Review can hide what matters: a moved/formatting fold has no guard against added or deleted hunks; the risk reason exists only in a tooltip. | IA, M, R-P3-05 | `src/views/review/FileDiff.tsx:79`, `review/sidebar.tsx:36` | Fold heuristics trusted the supervisor's hint; risk explained in `title`. | Open |
| D19 | P3 | Learning draws statistics in verifier green and danger red. | M8, R-P3-03, U | `baseline/shots/final-learning-light.png` | Status hues reused as series colours. | Fixed |
| D20 | P3 | Operations: raw cron only; "Next" without time zone; storage bars all full; mixed button styles. | R-P3-02 | `baseline/shots/final-operations-light.png` | Table built from data fields. | Open |
| D21 | P3 | Review empty state squeezed into the left column. | R-P3-04 | `baseline/shots/review-empty-en-light.png` | — | Open |
| D22 | P3 | Welcome reads as a landing template inside the app shell. | R-P3-06 | `baseline/shots/welcome-clean-en-light.png` | — | Deferred (taste; lowest priority) |
| D23 | P3 | At 1800px a row's title and its ID are ~1300px apart. | R-P3-07 | `baseline/shots/overview-en-light-1800.png` | Identity set flush right by design. | Open |
| D24 | P3 | "Abandon" looks like an ordinary button until pressed. | R-P3-01 vs C-P2-03 | — | — | Kept: docs/12 §12.4.3 keeps danger red off a resting button; the reviewers disagree and the system rule decides. |
| D25 | P3 | Disabled MicroVM tier: its explanation fades to 50% opacity (fails contrast). | IB | `impeccable-B.md` | Opacity on the whole label. | Fixed |
| D26 | — | Bundle headroom under 2 KB (162,742 / 163,840 B). | M10 | `DESIGN_PROGRESS.md` | — | Constraint on every change |
| D27 | P3 | The stamp is the only display-size type, framed dashed-in-dashed when tampered. | M3, R-P2-10 | `baseline/shots/review-G-0001-accept-en-light.png` | — | Kept: the stamp is the product's documented signature (app.css "The stamp: Tower's signature"); only its words change (D17). |

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

## Reviews of this work

Filled in as reviews arrive; each entry names the reviewer, the commit, the verdict and where the report is.
