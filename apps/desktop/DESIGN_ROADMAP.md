# Design roadmap

Executable order. Each task names the issues it closes (`DESIGN_REVIEW.md`), how it is done, how it is checked, and
how to roll it back (every task is one or more local commits on `design/evolution`; `git revert <sha>` undoes it).
Status: Todo / Doing / Done (implemented + verified) / Accepted (passed an independent review) / Deferred / Blocked.

| Task | Closes | Priority | Depends | Method | Tool | Acceptance | Verification | Status |
|---|---|---|---|---|---|---|---|---|
| T01 Opaque reading sheets | D07 | P2 | — | Palette and peek take `--bg-overlay`; only toast and @-completion keep floating material | CSS | AC (D07) | screenshots, layout e2e | Done |
| T02 Plain verdict copy and plurals | D17 (part) | P2 | — | "Passed, doesn't count" and plain explanations; `plural()` for sentinel/check counts | i18n | AC4 wording | unit + e2e honesty | Done |
| T03 Reading text ≥ 12px, readable disabled reason | D16 (part), D25 | P2 | — | decision note and held-out chips to `--fs-meta`; disabled tier fades the control, not the reason | CSS | AC9 | detector | Done |
| T04 Contract order and masthead | D13 (part) | P2 | — | criteria move to the second clause (stop conditions and constraints join the scope fence, renamed "Scope fence & limits"); masthead in sentence-case meta | TSX, CSS, i18n | AC9; criteria in first screen | unit, screenshot | Done |
| T05 Neutral statistics | D19 | P3 | — | calibration meters lose status hues | CSS | AC8 | screenshot | Done |
| T06 Accept sheet reasons | D05 | P1 | — | blockers first; a visible reason beside the disabled button, click focuses the first blocker; short blocker copy | TSX, CSS, i18n | AC6 | unit + accept e2e | Done |
| T07 One status word | D06 | P1 | — | `statusWord()` in `lib/labels.ts` for palette, peek, Operations, briefing, row aria; merge queue says "Merges cleanly" under "Merge"; review header Accept weighted by `proven()` | TS | AC7 | unit + e2e | Done |
| T08 Stable board selection | D04, D08 | P1 | — | `selected` (highlight) split from `opened` (card); Enter/click opens; Space/R act on a decision line's goal; numbers only on an open card | TSX, CSS | AC5 | flows e2e (row top unchanged over j) | Done |
| T09 Goal page: evidence first | D01, D02 (part), D03 | P1 | T07 | C1 skeleton: verdict + two tracks under the title; high sentinels as one exception block with evidence before criteria; criteria next; low sentinels one line; changes, cause, next, ledger, decisions, runs after; agent text labelled | TSX, CSS, i18n | AC1–AC4 | e2e boxes, screenshots both locales/themes/1100 | Done |
| T10 Criterion rows say each fact once | D02 | P1 | T09 | one verdict line + at most one qualifier line; no danger tag on a pass; one indent; internal guard names only in expanded detail | TSX, CSS | AC3 | DOM check, screenshot | Done |
| T11 Review guards and visible risk reason | D18, D14 (part) | P2 | — | never fold added/deleted hunks; risk reason as visible text on the unit; fixture order and `moved_hunks` made realistic | TSX, fixtures | review e2e | e2e + screenshot | Done |
| T12 Attention discipline | D10 | P2 | — | inbox focus ground neutral (selection), ◆ once per item | CSS | AC8 | screenshot | Done (decision-line glyph in iteration 3) |
| T13 Shell de-duplication | D11 | P2 | — | sidebar "To review" starts the review queue (⇧R) instead of duplicating Needs-you | TSX | one destination per entry | e2e | Done |
| T14 Empty board without loading ghosts | D15 | P2 | — | ghost rows only while loading | TSX | — | screenshot | Done |
| T15 Jargon pass | D17 | P2 | — | "Ratify and start" → "Start", "Memory ratification" → plain, "Live telemetry" / "Projection & budget" | i18n | AC4 | unit + e2e | Done |
| T16 Docs consistency | — | P3 | T01, T02 | docs/19 §19.6 (reading sheets opaque), docs/12 §12.5.2 (the "doesn't count" form), tokens.css and shots comments | docs | — | read-through | Done |
| T17 Contract focus | D13 | P2 | — | title field focused on open; new criterion focuses its title | TSX | — | unit | Done (intent, not title — see D13) |
| T18 Review first paint | D09 | P2 | — | render plain code with the table, highlight in place | TSX | — | e2e timing | Done (iteration 3: no hidden wait; code in the plain foreground, colours tint in) |
| T19 Operations readability | D20 | P3 | — | cron in words, time zone on Next | TSX, i18n | — | screenshot | Partly done (iteration 3: zone on Next, storage share bars, no dots; cron kept as typed) |

## Iteration 3 — milestone review fixes (D08 reopened, D09, D12, D28–D38)

| Task | Closes | Priority | Method | Verification | Status |
|---|---|---|---|---|---|
| T20 Space peeks a decision line | D08 (P1-01) | P1 | title button hands Space to `onPeek`; the board's Space binding no longer needs a selected goal row | flows e2e: drawer opens, no card, row top unchanged, Escape returns focus | Done |
| T21 High sentinels readable whole | D28 (P1-02) | P1 | prose unclamped, no title-only text; review notes show a high sentinel's explanation line | flows e2e: no overflow, no clamp, no title; note line present | Done |
| T22 One tone per meaning | D29, D36 | P2 | strongest tone per pill label; held-out label not repeated; section-level state words | flows e2e, shots | Done |
| T23 Decision line says the verdict | D10, D12 | P2 | lifecycle glyph + verdict word (text-2, gap) | shots, middle-dot e2e | Done |
| T24 Fold, R and Changes agree | D30, D31, D37 | P2–P3 | path beside its own title; R and "Open changes" only with changed files; one "Review n files" action | flows e2e, shots | Done |
| T25 Accept sheet, contract, page rules | D32, D33, D34, D35 | P3 | blockers before stamp, one sub-head, reasons as words; contract masthead/title/MicroVM; Space listed; no double rule | unit, shots | Done |
| T26 Middle dot, everywhere | D38 | P3 | four CSS dots → gaps; e2e reads pseudo-elements on 9 routes | e2e fails on old CSS, passes on new | Done |

Engineering gates after each batch: `tsc --noEmit`, vitest, the touched e2e suites, `shots.spec.ts` re-render,
`tools/line-limit.sh`, `vite build` + `tools/bundle-budget.sh`, `impeccable detect --json` on changed files.
