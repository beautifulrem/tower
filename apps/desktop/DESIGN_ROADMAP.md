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
| T19 Operations readability | D20 | P3 | — | cron in words, time zone on Next | TSX, i18n | — | screenshot | Done (iteration 3: zone on Next, storage share bars, no dots; iteration 9: cron in words, T62) |

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
| T27 One verdict, everywhere | D41 | P1 | `notEvidence()` behind every seal, status word and glyph; inbox card head and bar; "To review" / "Review each goal in turn" | `verdict.spec.ts` (inbox, board line, peek, live line) | Done |
| T28 Green only on the verifier | D42 | P1 | neutral ✓ on CI counts and the trace's capture tick; neutral legend chain | `verdict.spec.ts` PR line; accept-sheet green check kept | Done |
| T29 Criteria inside the first screen | D43 | P2 | the CI card on its own goal page drops the duplicated question | `verdict.spec.ts` AC1 × 4 variants | Done |
| T30 One queue, one R | D44, D48 | P2–P3 | `reviewEach()` for every entry and a global ⇧R; peek R only with changed files | `verdict.spec.ts`, flows | Done |
| T31 Words that agree | D45, D46, D50, D51, D56 | P2–P3 | reviewed / read; `titleFrom`; first slot; lowercase hints; accept summary; steer pill in i18n | unit, flows, shots | Done |
| T32 One source per fact | D47, D49, D52, D53, D55 | P2–P3 | wrapping provenance badge; merged pill mark; one trust-tier lookup; held-out path first; refusal said once (en and zh parser) | unit, `verdict.spec.ts`, flows | Done |
| T33 Say it once | D57 | P3 | ghost "Open changes" and Cause's failed-row copies removed; dead `FlakyLine` removed (pays for T27–T32 in bytes) | flows, bundle budget | Done |
| T34 Peek exits land | D59 | P1 | read the goal id before the drawer closes | `verdict.spec.ts` (r ×2, ↩ ×2, button; fail on old code) | Done |
| T35 Not filed under acceptance | D60, D71 | P1 | "To review / 待评审"; per-goal discounted count; bars by `id`; tiny bar says it | `verdict.spec.ts` no-CI en + zh | Done |
| T36 Dot sweep incl. attributes and overlays | D61 | P2 | commas/gaps at 20 sites; e2e reads aria-label, title, placeholder, 14 surfaces × 2 languages | `verdict.spec.ts` (fails on old code) | Done |
| T37 Green and words, last pass | D62, D63, D65, D68 | P2–P3 | neutral suggestion rule; "Mark reviewed"; unbreakable provenance runs; default Approve | e2e, shots | Done |
| T38 One qualifier list, one verdict per line | D64, D67, D69, D70 | P2–P3 | shared `qualifiers()`; merge-cell verdict; one ◆ per row; palette in queue order; env phrase once | `verdict.spec.ts` | Done |
| T39 Back where you were | D66 | P3 | `nav.lastGoal` selects the goal's first board line | `verdict.spec.ts` | Done |
| T40 The board cell holds at every width | D72 | P2 | 5px segment floor; 16em criteria column from 1400 px in the file that owns that range; human count to the tooltip below 1400 for a pass that doesn't count | `verdict.spec.ts` (10 widths × languages, fail on old CSS) | Done |
| T41 The speaker beside the statement | D73 | P2 | inline-flex badge; only the words wrap, between speaker and kind | `verdict.spec.ts` (6, fail on old CSS) | Done |
| T42 One name per set, one ◆ per row | D74, D75 | P3 | "Review queue"; title bar in words; no second ◆ or verdict on sidebar, peek head, card seal row | `verdict.spec.ts` | Done |
| T43 ⇧R from the peek | D76 | P3 | close and start the queue | `verdict.spec.ts` | Done |
| T44 Wraps and copy | D79 | P3 | "Ports" + tooltip; zh git line, `text-wrap: pretty` on checks; zh held-out hint; note names no button | `verdict.spec.ts` (fail on old commit) | Done |
| T45 Bundle headroom | D78 | P3 | one tampered explanation instead of three | bundle budget | Partly (199 B of the 1 KB asked) |
| T46 The peek keeps focus | D81 | P1 | one shared `trapTab` for the sheets and the peek | `verdict.spec.ts` (Tab ×6, ⇧Tab ×2 on every goal, en and zh; no `quick_goal`; r after Tab; fail on 16ac40c) | Done |
| T47 One column for every row | D82 | P3 | criteria column 11em at every width; the human count of a pass that doesn't count in the tooltip | `verdict.spec.ts` (title and live characters ≥ d0dc2a1; fails on 16ac40c) | Done |
| T48 The verdict once in every peek | D83 | P3 | head seal only when "Now" has none | `verdict.spec.ts` (fails on 16ac40c) | Done |
| T49 Hardening | D87 | P3 | probe: long en/zh text at 1040/1440, contrast on 8 routes × 2 themes, focus rings, reduced motion; grouped money, goal-title tooltip | probe output, unit test | Done |
| T50 Only the title gives way | D88 | P2 | card head and review header: every item but the title one line, unshrinkable; data-table goal cells take what the others leave (`max-width: 0`), id, verdict and sizes whole, merge-queue rules folded in; tooltips on four cut titles | `layout.spec.ts` 6 tests (3 lengths × en/zh, 4 widths, 4 routes; fail on 3145645) | Done |
| T51 Needs you is the queue's word | D89 | P3 | a board row never says it needs you, in its label or by a trailing ◆ | `verdict.spec.ts` × CI / no CI × en / zh | Done |
| T52 A silent run is unresponsive in the peek head | D90 | P3 | the heartbeat's word in the head | `verdict.spec.ts` en + zh | Done |
| T53 Clause numbers follow the reading order | D92 (part) | P3 | side column unnumbered beside the form, numbered when folded under it (CSS) | `contract.spec.ts` 1440 / 1100 | Done (folding: T59) |
| T54 A running goal's state, once | D93 | P3 | the peek head carries glyph and id for a running goal; "Now" says needs you, unresponsive or what it does | `verdict.spec.ts` silent and silent-and-waiting × en/zh | Done |
| T55 Needs you in the sidebar too | D94 | P3 | the sidebar row reads its group, not `needs_you`; no trailing ◆ | `verdict.spec.ts` board + sidebar × 3 data sets × en/zh | Done |
| T56 Minimum width: readings whole, no dot left | D95, D96 (part) | P3 | reading cells one token (CSS); the human count's dot inside its span | `layout.spec.ts` long titles from 1040; stats test checks dangling dots | Done |
| T57 Dictionaries ship their keys once | D84 | P3 | build plugin `plugins/localeKeys.ts` (dev, vitest, build); key chunk counted with the start-up | `localeKeys.test.ts`; `bundle-budget.sh` 160,049 / 163,840 B | Done (iteration 9) |
| T58 One ledger row per claim, its runs named | D91 | P3 | dedupe by criterion + words; runs listed once each | `honesty.spec.ts` en/zh, fails on `4d0b9c4` | Done (iteration 9) |
| T59 Engine clause folded | D92 | P3 | native `<details>`, summary of what is set, settings whole, hanging wrap | `contract.spec.ts` 1440/1100, fails on `4d0b9c4` | Done (iteration 9) |
| T60 The verdict stays while comparing | D96 | P3 | comparing drops the change counts first, narrower run pickers | `layout.spec.ts` en/zh 1024–1240, fails on `4d0b9c4` | Done (iteration 9) |
| T61 Chinese supervisor views for Chinese tests | D51, D86 | P3 | `tools/e2e.sh` dumps en and zh; `fixtures(lang)`, `titleIn`; `dump_views` premise follows TOWER_LANG | `language.spec.ts` 8 routes + control | Done (iteration 9) |
| T62 Schedules in words | D20 | P3 | `lib/cron.ts`: words first, cron after | `language.spec.ts`, `cron.test.ts`, `ConsoleViews.test.tsx`, fails on `4d0b9c4` | Done (iteration 9) |
| T63 Welcome is setup | D22 | P3 | one 600 px column: title, checks, actions, how a goal ends | `flows.spec.ts` en/zh, fails on `4d0b9c4` | Done (iteration 9) |
| T64 Id with its title | D23 | P3 | the id right after the title at every width | `flows.spec.ts` identity, fails on `4d0b9c4` | Done (iteration 9) |
| T65 Verified, with caveats | D58 | P2 | supervisor `progress.qualified` and the high-finding hold; notched glyph, seal word and tooltip, accept-sheet judgement (two presses) | `honesty.spec.ts` en/zh, `Glyph.test.tsx`, `panels.test.tsx`, Rust unit test, fails on `4d0b9c4` | Done (iteration 9) |
| T66 docs/12 says what the code does | docs/12 drift | P3 | code canonical: 17 + 12 + 10 places, file:line cited | read-through | Done (iteration 9) |
| T67 Durable evidence, packaged app | D97 | P3 | reports in `design-evidence/reports/`; debug `Tower.app` on a seeded `TOWER_HOME` | `design-evidence/packaged-app/` | Done (iteration 9) |
| T68 Accepted with caveats stays qualified | D98 | P2 | accepted stamp gets `qualified` and an "accepted" tooltip; the accepted glyph's disc keeps the cut (●*) | `honesty.spec.ts` en/zh, fails on `7a23f45` | Done (iteration 10) |
| T69 The verdict is the last to go | D99, D100 | P3 | `review/fitStats.ts` fits by measuring: pins, counts, gaps, the pickers' pins (run-name faces over the native select), key caps last; buttons say their shortcut in a tooltip | `layout.spec.ts` 1024–1400 × G-0001/G-0003 × en/zh, key caps; fails on `7a23f45` | Done (iteration 10) |
| T70 Ledger provenance in its own grey | D101 | P3 | runs note under the claim, text-3 | `honesty.spec.ts`, fails on `7a23f45` | Done (iteration 10) |
| T71 The strip reads the supervisor's machinery list | D102 | P3 | `MACHINERY_RE` = summaries.rs's three; "assertions untouched" only when no finding stands | `GoalDeck.test.tsx`, fails on `7a23f45` | Done (iteration 10) |
| T72 Non-default engine settings on the fold | D103 | P3 | thinking, escalation, ports, loopback named when set | `contract.spec.ts` en/zh + defaults, fails on `7a23f45` | Done (iteration 10) |
| T73 Overlap in words beside the id | D104 | P3 | "◇ Overlaps G-0003" after the row's own id; tooltip below 1241 | `flows.spec.ts` en/zh, fails on `7a23f45` | Done (iteration 10) |
| T74 Units clear of their values | D105 | P3 | `.field-unit` (no clash with the review's `.unit`), padding measured from the unit (`fitUnit`) | `contract.spec.ts` contract en/zh + settings, fails on `7a23f45` | Done (iteration 10) |
| T75 docs/12's last three places | D106 | P3 | `●*` placed, caveats as words not badges, only the diff tokens that exist; overlap position | read-through, doc numbers | Done (iteration 10) |
| T76 The title keeps its room beside an overlap | D107 | P2 | the note keeps its ◇ alone when the title would show less than all of a short title or 12em of a long one (measured per row); the title column's floor 16em at 1241–1560 | `flows.spec.ts` title width at 1241/1280/1366/1440/1560/1800, en/zh, demo and long title; fails on `deef352` | Done (iteration 11) |
| T77 Done means done on every seal | D108 | P3 | `Seal` takes `accepted`; every seal of an accepted or merged goal says the caveats were taken with it; merged ring keeps the gap (◉*) | `honesty.spec.ts` peek, review head, readout, goal head, glyph; accepted and integrated, en/zh; fails on `deef352` | Done (iteration 11) |
| T78 The picker's value is its face | D109 | P3 | one option per point (kind, run, time, rev), `selected` on the options, the chosen point remembered; Latest ends the list | `review-scope.spec.ts` face = tooltip = chosen option, before and after picking a second point at one rev; fails on `deef352` | Done (iteration 11) |
| T79 Provenance told by form | D110 | P3 | runs note 11 px and worded as a note ("said in runs 1 and 2") | `honesty.spec.ts` wording, grey and size; fails on `deef352` | Done (iteration 11) |
| T80 One tone, one wording per caveat | D111 | P3 | a caveat is a neutral pill in the seal's words; a high finding is named for what was done; others amber in their own words | `GoalDeck.test.tsx` six sentinels' words and tone; five fail on `deef352` | Done (iteration 11) |
| T81 Run names in the interface language | D112 | P3 | the frontend words each point from its kind, run and time, then its pin; the supervisor's label only for an unknown kind | `review-scope.spec.ts` en/zh option names; fails on `deef352` | Done (iteration 11) |
| T82 The overlap words where the row fits them | D113 | P3 | decide on the row at rest (the peek button may cover the note's end, or leave the cell); ◇ with the other id when short; one title floor either side of 1561; docs/12 says the rule | `flows.spec.ts` the note says as much as leaves the title its room, both rows of the pair, ten widths; G-0003 at 1728, zh G-0001 at 1440; fails on `4ea4567` | Done (iteration 12) |
| T83 No caveat beside a held pass | D114 | P3 | each family's most severe finding; no neutral caveat pill on a row whose pass is held | `GoalDeck.test.tsx` the two mixed cases; fail on `4ea4567` | Done (iteration 12) |
| T84 The picker keeps its point | D115 | P3 | key without `at`; the picked point in Review's state; an end that leaves the list moves or is named | `review-scope.spec.ts` refresh, scope switch, new pin; `panels.test.tsx` the gone end; fail on `4ea4567` | Done (iteration 12) |
| T85 No hard cuts on the board | D116 | P3 | the live column's seal and the identity column give way by measuring | `flows.spec.ts` 13 widths 1241–1800 en/zh, crowded fixture; fails on `4ea4567` | Done (iteration 12) |
| T86 The identity's last step fits | D117 | P3 | after "muted" and the project's name, the PR's state, then the whole identity folds into the tooltip | `flows.spec.ts` a second crowded board, merged and closed PRs with rework, 13 widths en/zh; fails on `886ab38` | Done (iteration 13) |
| T87 What leaves is still said | D118 | P3 | the PR in words in the title's tooltip and in the button's own name; set aside from sight only; a project its own width; the separator with the counts | `flows.spec.ts` tooltip and accessible name at every width, project width; smoke axe; fails on `886ab38` | Done (iteration 13) |
| T88 One family of marks, and motion where work moves | D119 | P2 | a 16-unit disc with its symbol as a hole (! amber, × red, i outlined); the running mark's arc turning; masks of the same paths in stylesheets and on the phone; capsule segments filling on a spring; springs with no overshoot; the in-view live line's shimmer; reduced motion holds all still; DESIGN.md, PRODUCT.md, docs/12 | `Glyph.test.tsx` the marks (one even-odd path each, no painted ground; CSS and phone paths equal), the turning arc; `Honesty.test.tsx` a segment keeps its element; `flows.spec.ts` the runs gauge and the in-view shimmer, board rows still; fail on `3ff2ebf` | Done |
| T89 A squeezed name is not a collapsed one | D120 | P3 | judge "set aside" by the step, not the size; a shortened name keeps min(its width, 3.5em) or the next step is taken | `flows.spec.ts` steps defined by state, every 1 px at each step's edge, the name's width when shown; fails with `1c9af8a`'s `GoalRow.tsx` | Done (iteration 14) |
| T90 The verdict outlasts a gone end's pin | D121 | P3 | the key caps step made to run (it never had), judged by the seal and the segments; then a gone end's pin, so the seal and its bar stay whole at 1040 | `review-scope.spec.ts` every segment and the seal whole at en 1040–1064; fails with `1c9af8a`'s `fitStats.ts` | Done (iteration 14) |
| T91 Only moving work turns, and only where watched | D122 | P2 | one `moving(goal, now)` for the shimmer, the mark (`turn` on board row, goal page, peek), the runs gauge and the phone; lists and waiting or silent runs hold still | `Glyph.test.tsx`; `flows.spec.ts` board rows, sidebar, gauge; `phone.spec.ts`; fail on `1ad1439` | Done (iteration 15) |
| T92 Reduced motion reaches pseudo-elements | D123 | P3 | `*, *::before, *::after` | `flows.spec.ts` a segment's fill settled at 60 ms; fails on `1ad1439` | Done (iteration 15) |
| T93 A shimmer on the compositor | D124 | P3 | a ground-coloured band over the words, clipped to them, moved by transform | `flows.spec.ts` keyframes animate transform only, the words keep their ink; CPU at rest measured before and after | Done (iteration 15) |
| T94 No state characters in the held-out list | D125 | P3 | only the files that ran, after the line that counts them; the others named once in words | `GoalDeck.test.tsx`; fails on `1ad1439` | Done (iteration 15) |
| T95 The phone strip's ! at 12 px | D126 | P3 | the desk's size | `phone.spec.ts` the rendered box; fails on `1ad1439` | Done (iteration 15) |
| T96 A gone end shortens before the caps go | D127 | P3 | "Gone" with its pin, then the key caps | `review-scope.spec.ts` both ends gone, en/zh, 1024–1120; fails on `1ad1439` | Done (iteration 15) |
| T97 The × at DPR 1 | D128 | — | Retina is the target | — | Kept |
| T98 One grammar in the title bar | D129 | P3 | errors and engine-down wear the red × disc | `Console.test.tsx`; fails on `1ad1439` | Done (iteration 15) |
| T99 Glyph sizes in docs/12 | D130 | P3 | the default, the grid and the stroke as drawn | docs | Done (iteration 15) |
| T100 No middle dots on the phone | D131 | P3 | a comma; action and target apart by a space | `phone.spec.ts`; fails on `1ad1439` | Done (iteration 15) |
| T101 Icon buttons for close and remove | D132 | P3 | `IconButton` cross | `ContractEditor.test.tsx`; fails on `1ad1439` | Done (iteration 15) |
| T102 Copy takes only text worth copying | D133 | P3 | the app selects nothing by default; prefixed rules | `select.spec.ts`; fails on `1ad1439` | Done (iteration 15) |
| T103 A closed PR keeps its state | D134 | P3 | open keeps its failing count, merged or closed its state | `flows.spec.ts` identity sweeps; fail on `1ad1439` | Done (iteration 15) |
| T104 Rework read once | D135 | P3 | the bare count `aria-hidden` | `flows.spec.ts` accessible tree; fails on `1ad1439` | Done (iteration 15) |
| T105 A name shortens only after "muted" | D136 | P3 | from the quiet step on | `flows.spec.ts` no-PR crowd and the step-back rule; fails with `1ad1439`'s `GoalRow.tsx` | Done (iteration 15) |
| T106 A decision's question gets the empty column | D137 | P3 | with one project, the question takes the identity column and the age ends the line | `flows.spec.ts` 1440/1561/1800 en/zh and two projects; fails on `1ad1439` | Done (iteration 15) |
| T107 A held pass says what holds it | D138 | P3 | "doesn't count: a high finding on C2" | `GoalDeck.test.tsx`; fails on `1ad1439` | Done (iteration 15) |
| T108 Caveats on a seal that does not count | D139 | — | the verdict outranks them; they stay on the criterion's row | — | Kept |
| T109 A held pass's caveat in amber | D140 | — | held, every caveat is a question for you | — | Kept |
| T110 Merged human-only by shape | D141 | P3 | a hatched core | `Glyph.test.tsx`; fails on `1ad1439` | Done (iteration 15) |
| T111 No green on a connection | D142 | P2 | the phone's live stream said in words; offline the word in ink, the red × once on the error line | `phone.spec.ts`; fails on `ae1c049` | Done (iteration 15 follow-up) |
| T112 Silence is a hint, not a failure | D143 | P3 | the hint mark in the reading's ink, desk and phone | `flows.spec.ts`, `phone.spec.ts`; fails on `ae1c049` | Done (iteration 15 follow-up) |
| T113 Silent, not "Unresponsive" | D144 | P3 | the word the desk can stand behind; the last movement beside the hint mark | `verdict.spec.ts`; fails on `2408609` | Done (iteration 15 follow-up) |
| T114 Phone green only when the pass counts | D145 | P1 | the desk's two gates on the phone's goals to accept; amber !, or the dashed neutral ring, otherwise | `phone.spec.ts`; fails on `2408609` | Done (iteration 16) |
| T115 Held-out files under their count | D146 | P2 | the files that ran right under the line that counts them | `GoalDeck.test.tsx`; fails on `2408609` | Done (iteration 16) |
| T116 A path names no criterion | D147 | P3 | findings name only the goal's own criteria | `GoalDeck.test.tsx`; fails on `2408609` | Done (iteration 16) |
| T117 Evidence strip wraps on one edge | D148 | P3 | gap spacing; a tag's hang given back on the trailing side | `honesty.spec.ts`; fails on `2408609` | Done (iteration 16) |
| T118 Machine values copy | D149 | P3 | titles, ids, pins, commands and paths select; not on moves | `select.spec.ts`; fails on `2408609` | Done (iteration 16) |
| T119 Sandbox off is a hint | D150 | P3 | ink and the hint mark in the title bar | `Console.test.tsx`; fails on `2408609` | Done (iteration 16) |
| T120 Phone: busy, silent, needs you | D151 | P3 | a tool in flight is busy; the badges say Silent and wear the ! | `phone.spec.ts`; fails on `2408609` | Done (iteration 16) |
| T121 One mark size in the title bar | D152 | — | the running mark at 12px, desk and phone | `flows.spec.ts`, `phone.spec.ts`; fails on `2408609` | Done (iteration 16) |
| T122 A light over short words | D153 | — | the band a quarter of a short word | `flows.spec.ts`; fails on `2408609` | Done (iteration 16) |
| T123 Diff lines select | D154 | P3 | a pointer's focus stays on the table | `review-keys.spec.ts`; fails on `2408609` | Done (iteration 16) |
| T124 Stale words | D155 | — | comment, docs/12's PR step and red list, references | — | Done (iteration 16) |
| T125 Phone: a quiet Silent | D157 | P3 | the row's badge text-2, 400, no glyph; the hint mark in the header only | `phone.spec.ts`; fails on `2d3eeb8` | Done (iteration 17) |
| T126 The right section | D158 | P3 | docs/12 cites §12.4.3 | — | Done (iteration 17) |
| T127 An empty list is a sentence | D159 | P3 | no stand-in rows on the phone; skeleton bars mean loading only | `phone.spec.ts`; fails on `2d3eeb8` | Done (iteration 17) |
| T128 Copies say what they show | D160 | P3 | held-out names keep their separators; each pin copies whole | `select.spec.ts`; fails on `2d3eeb8` | Done (iteration 17) |
| T129 Phone: a pass with caveats | D161 | P3 | the cut ring and seal, "Verified, with caveats", the caveats after the ! | `phone.spec.ts`; fails on `2d3eeb8` | Done (iteration 17) |
| T130 Phone at 320 | D162 | — | a ready row's meta line wraps | `phone.spec.ts` | Done (iteration 17) |
| T131 Diff keys and selection | D163 | — | ↩ after a press; ↓ on the last line; triple-click and copy keep lines whole | `review-keys.spec.ts`; fails on `2d3eeb8` | Done (iteration 17) |
| T132 Letters keep ink under the light | D164 | — | the band's peak the ground at 60% | `flows.spec.ts`; fails on `2d3eeb8` | Done (iteration 17) |
| T133 No bare dot in the title bar | D165 | — | the engine gauge its name alone; a down gauge text-1 | `Console.test.tsx`, `flows.spec.ts`; fails on `2d3eeb8` | Done (iteration 17) |
| T134 A thumbnail holds its frame | D166 | — | 3:4 until the image decodes | `flows.spec.ts`; fails on `2d3eeb8` | Done (iteration 17) |
| T135 A steer box that fails says so | D167 | — | an error boundary with Retry; the rail's rule on `.steer-console` | `resilience.spec.ts`, `flows.spec.ts`; fail on `2d3eeb8` | Done (iteration 17) |
| T136 No criterion inside a path | D168 | — | an id in a path or before an extension names nothing | `GoalDeck.test.tsx`; fails on `2d3eeb8` | Done (iteration 17) |
| T137 Busy while any call runs | D169 | — | the oldest call in flight sets the mode, supervisor and desk | `flow.rs`, `pulse.test.ts`; fail on the old logic | Done (iteration 17) |
| T138 Stale marks in words | D170 | — | the signature and the overlap note name the marks | — | Done (iteration 17) |
| T139 ↩ on a diff line alone | D171 | P2 | with a modifier ↩ is the page's shortcut, never a comment | `review-keys.spec.ts`; fails on `f9dd353` | Done (iteration 18) |
| T140 A copy keeps what it held | D172 | P3 | across files the browser's copy; the side where the selection holds lines | `review-keys.spec.ts`; fails on `f9dd353` | Done (iteration 18) |
| T141 The rail off the steer box | D173 | P3 | from 1281 the box stops at the rail's column | `flows.spec.ts`; fails on `f9dd353` | Done (iteration 18) |
| T142 One rule for the call at work | D174 | P3 | the newest call in flight at a start, an end and an answer; the live line follows it | `flow.rs`; fails on `f9dd353` | Done (iteration 18) |
| T143 Pause on the phone, tested | D175 | — | Pause, Press again, the request | `phone.spec.ts`; fails on `2d3eeb8` | Done (iteration 18) |
| T144 The caveat line says look first | D176 | — | the words; docs/12 rule 8 on where the amber ! goes | `phone.spec.ts` | Done (iteration 18) |
| T145 CJK caveats whole | D177 | — | `keep-all` on the caveat line | `phone.spec.ts` | Done (iteration 18) |
| T146 The phone's mark on the title | D178 | — | the mark at the row's top | `phone.spec.ts` | Done (iteration 18) |
| T147 Live line and mode agree | D179 | — | the desk's calls as the supervisor's | `pulse.test.ts`; fails on `f9dd353` | Done (iteration 18) |
| T148 A thumbnail the width it will be | D180 | — | the capture's frame until it decodes: 16:10, or 390×844 on the Mobile tab | `flows.spec.ts`; fails on `f9dd353` | Done (iteration 18) |
| T149 A load failure in your words | D181 | — | code that did not load said in the interface's language | `resilience.spec.ts`; fails on `f9dd353` | Done (iteration 18) |
| T150 No space after "：" | D182 | — | the space English only | `flows.spec.ts`; fails on `f9dd353` | Done (iteration 18) |
| T151 The dark shimmer brightens | D183 | — | a gap in a veil of the ground | `flows.spec.ts`; fails on `f9dd353` | Done (iteration 18) |
| T152 Inside the budget | D184 | — | the polyfill off, a dead component gone | `bundle-budget.sh` | Done (iteration 18) |
| T153 Every review in the table | D185 | — | reviews 15–17 in DESIGN_REVIEW | — | Done (iteration 18) |
| T154 An open question keeps the run waiting | D186 | — | start and settle keep waiting on you while a question is open | `flow.rs`; fails on either old path | Done (iteration 18 follow-up) |
| T155 The later of two calls in a millisecond | D187 | — | insertion order breaks the tie | `pulse.test.ts`; fails on the sort | Done (iteration 18 follow-up) |
| T156 The rail test either side of 1281 | D188 | — | 1281 and 1280 wide | `flows.spec.ts` | Done (iteration 18 follow-up) |
| T157 The rail's head stays in sight at the page's end | D189 | — | the steer box ends the main column | `flows.spec.ts`; fails on `54ba274` | Done (iteration 19) |
| T158 ↩ after a sheet closes comments on the line pressed | D190 | — | focus handed back by a sheet or the window keeps the press | `review-keys.spec.ts`, `FileDiff.test.tsx`; fails on `54ba274` | Done (iteration 19) |
| T159 The live line says whether its call is in flight | D191, D192 | — | `LiveLine.running`, read by the phone and the desk | `flow.rs`, store unit, `pulse.test.ts`, `phone.spec.ts`, `flows.spec.ts`; fail on the old code and its mutations | Done (iteration 19) |
| T160 The diff's evidence test holds under load | D193 | — | waits for the cell's text and colours | 40/40 under load | Done (iteration 19) |
| T161 Shots wait for everything they draw | D194 | — | requests, the worker and pictures settled | probe 36/36 against 28/36 | Done (iteration 19) |
| T162 A slow first highlight is run again | D195 | — | a pass over the line limit runs again, warm | `highlight.test.ts`; fails on the old worker | Done (iteration 19) |
| T163 A dialog whose time runs out closes | D196 | — | the supervisor closes it after the same time | `flow.rs`; fails with the expiry off | Done (iteration 19) |
| T164 One name for the hint mark in docs/12 | D197 | — | `◆` | — | Done (iteration 19) |
| T165 The dark shimmer eases out | D198 | — | the band fades over 0.6 s | `flows.spec.ts`; fails on `54ba274` | Done (iteration 19) |
| T166 A missing side in its capture's frame | D200 | — | 16:10 at the slot's height | `flows.spec.ts` (en, zh) | Done (iteration 19) |
| T167 Observed failures in ink | D202 | — | GitHub checks, merge conflicts, the sidebar notice in text-1 | `flows.spec.ts` | Done (iteration 19) |
| T168 Inside the budget | D201 | — | sixteen duplicate keys merged | `bundle-budget.sh` | Done (iteration 19) |
| T169 One order for the mode's writes | D204 | — | start, end, settle, answer and expiry under `Run::lock_mode` | `asks.rs`; each piece fails mutated | Done (iteration 20) |
| T170 A missing side in its capture's frame, whatever its words | D205 | — | 96 high in the strip, 16:10 side by side, breaks after URL punctuation | `flows.spec.ts` (en, zh); fails on `939be97` | Done (iteration 20) |
| T171 An ended call is not what the run is doing | D206 | — | the detail names a call in flight or a quiet run's last | `Live.test.tsx`, `flows.spec.ts`, `phone.spec.ts`; fail on `939be97` | Done (iteration 20) |
| T172 Highlight again only a line cut short | D207 | — | `stoppedEarly` | `highlight.test.ts`; fails on the old rule | Done (iteration 20) |
| T173 `settled()` says what it waited for | D208 | — | names the pending at its cap; per-worker counts | `smoke.spec.ts` | Done (iteration 20) |
| T174 A merge conflict named in the sidebar | D209, D211 | — | `◇` "Merge conflict" in the operations row; docs/04 | `flows.spec.ts` | Done (iteration 20) |
| T175 A question closes before Pi lets it go | D210 | — | a tenth early, a second at most | `asks.rs`; fails with the timer late | Done (iteration 20) |
| T176 The shimmer's fade a token | D212 | — | `--dur-settle` | — | Done (iteration 20) |
| T177 A ring where the keyboard's place is | D213 | — | the line pressed, else the table | `review-keys.spec.ts`; fails on `939be97` | Done (iteration 20) |
| T178 Write, then hand the engine | D214 | — | the first "thinking" and an answer's mode before the send | `race2/`; the flow suite ×20 | Done (iteration 20) |
| T179 The gates run what CI runs | D215 | — | workspace clippy and tests | gates | Done (iteration 20) |
| T180 Inside the budget | D216 | — | twenty-nine duplicate keys merged | `bundle-budget.sh` | Done (iteration 20) |
| T181 Quieter held tags | D217 | — | a tag is its tone's ground, no hairline | visual check; `honesty.spec.ts` | Done (iteration 20) |
| T182 A question and its dialog in one step | D218 | — | the inbox item, the dialog and the mode under the lock; an answer with no dialog refused | `asks.rs`; `mut/p`, `mut/i`; the flow suite ×20 | Done (iteration 21) |
| T183 A board row that holds still | D219 | — | a call's words linger a second; the elapsed time after the run's name only | `Live.test.tsx`, `flows.spec.ts`; fails on `b6baa8a` | Done (iteration 21) |
| T184 A ring clear of the digits | D220 | — | the button is the whole number cell | `review-keys.spec.ts`; fails on `b6baa8a` | Done (iteration 21) |
| T185 A missing side's code whole | D221 | — | no break inside `::` `://`; five lines in the strip; `_` holds side by side | `flows.spec.ts`; fails on `b6baa8a` | Done (iteration 21) |
| T186 The run named once, and not "getting started" when quiet | D224, D225 | — | the header names the run, the goal page's line its time; "已进行"; the board's time whole or set aside; a quiet first run is "Run 1" | `flows.spec.ts`, `Live.test.tsx`; fails on `b6baa8a` | Done (iteration 21) |
| T187 Counts that wait on you in ink | D226 | — | `.side-count.t1` is text-1 | `verdict.spec.ts`; fails on `b6baa8a` | Done (iteration 21) |
| T188 The docs say when the detail names the run | D227 | — | DESIGN.md, docs/04, D206's words | reading | Done (iteration 21) |
| T189 Every mode write under the lock, none after a stop | D229, D234 | — | a new turn, compaction, retry and the first message settle under the lock; a stopping run writes no mode | `asks.rs`, `run/mod.rs`; `mut/j`, `k`, `launch-dialogs`, `stop-guard` | Done (iteration 21) |
| T190 Middle dots only where the rule allows | D230 | — | supervisor strings drop `·`; the pips' criteria scale and the held-out format kept | Rust tests | Done (iteration 21) |
| T191 Tests that hold the orders they claim | D231, D232, D233 | — | a test step between two writes; a run's own sleep; the highlighter as Shiki made it; the held tags' rings | `mut/f`, `g`, `h`; `oldsrc/d207-worker`, `d217-chips` | Done (iteration 21) |
| T192 Inside the budget | D235 | — | the icons as markup strings | `bundle-budget.sh` | Done (iteration 21) |
| T193 A missing side's code whole side by side | D237 | — | the wide frame breaks only an address, after `://` or `/`; the `.u` rule gone | `flows.spec.ts` width sweep; fails on `9397e07` (`oldsrc/look-old`) | Done (iteration 22) |
| T194 An approval shows the command it allows | D238 | — | the body is the command or path alone; path reasons say the write; the stall title names the command, then the tool | `asks.rs`, `i18n.rs`, `policy.test.ts`, `flows.spec.ts`, `phone.spec.ts`; `mut/approval-tool-prefix`, `stall-tool-first` | Done (iteration 22) |
| T195 The stop marked under the lock, and its tests | D239, D240, D241 | — | `stop_engine` marks the stop under the mode lock; a settle held at its read of the stop; a stopped run with no question; the send's lock kept | `asks.rs`; `mut/stop-outside-lock`, `settle-on-unlocked`, `report-no-stop-guard` | Done (iteration 22) |
| T196 The live line as one row | D242–D249 | — | the badge lingers with the call; the run's time on its own line in the tooltip; "elapsed"; starting names the run; no start time names the run; the phone's words; the English badge column | `flows.spec.ts`, `Live.test.tsx`, `phone.spec.ts`; `oldsrc/live-old`, `css-old`, `mut/title-after-command` | Done (iteration 22) |
| T197 The ring clear of the +, the conflict count held, the pin at the end | D250, D251, D252 | — | a 24 px gutter; the count's ink tested; the evidence line ends on its pin | `review-keys.spec.ts`, `flows.spec.ts`, `goals.rs`; `oldsrc/css-old-keys`, `mut/conflict-count-grey`, `evidence-pin-then-note` | Done (iteration 22) |
| T198 e2e on a fresh dump | D253 | — | the range's end read from its option; the gates dump fixtures from the supervisor under test | `review-scope.spec.ts` on the fresh and the old dump | Done (iteration 22) |
| T199 A carried-over row marked, a word kept whole | D254 | — | each command line a box the block's width; a hook in the margin of a carried-over row; words move whole; one mask on desk and phone | `flows.spec.ts`, `phone.spec.ts`, `e2e/command.ts`; `oldsrc/desk-cmd-tsx-old`, `desk-cmd-css-old`, `phone-old`; `mut/desk-w-inline`, `phone-w-inline`, `csp-no-data` | Done (iteration 23) |
| T200 A stopped run asks nothing | D255 | — | `on_ui_request` cancels a dialog to a run being stopped, under the mode lock | `asks.rs`; `mut/asks-no-stop-guard` | Done (iteration 23) |
| T201 The live line says nothing twice | D256, D258 | — | no run named under a header that names it; nothing shimmers with no words; "Run 2, elapsed …" as a sentence | `Live.test.tsx`, `flows.spec.ts`; `oldsrc/unit-live-old`, `live-title-old` | Done (iteration 23) |
| T202 Machine values set as code | D257, D261 | — | an inbox item's `code`; the stall's command and the check's name as code on desk and phone; the ledger's pin as code | `inbox.rs`, `i18n.rs`, `DecisionCard.test.tsx`, `phone.spec.ts`, `honesty.spec.ts`; `oldsrc/unit-card-old`, `pin-old` | Done (iteration 23) |
| T203 One inbox for both surfaces | D259 | — | the fold in the store, notes only; every dialog its own item; the desk's `dedupeInbox` gone | `inbox.rs`, `flows.spec.ts`; `mut/store-no-supersede`, `oldsrc/dedupe-old` | Done (iteration 23) |
| T204 A failed capture says why on both tabs | D262 | — | the side's error on the phone tab too | `flows.spec.ts`; `oldsrc/look-phone-old` | Done (iteration 23) |
| T205 The records and the tests the last round left | D260, D263, D264 | — | D250 and D237 corrected; the denial's sentences in `policy.ts` with a test; the phone's Chinese time and multi-line body tested | `policy.test.ts`, `phone.spec.ts` | Done (iteration 23) |
| T206 The phone as the desk | D265, D266, D267 | — | Chinese times in words; the page's policy allows `data:` pictures and the tests serve it; a tail's blank line empty | `phone.spec.ts`; `oldsrc/phone-old`, `mut/csp-no-data` | Done (iteration 23) |
| T207 Tower's closing is Tower's | D268 | — | `InboxResolved.auto`, source System; the trace shows Tower's note, never "Your answer" | `inbox.rs`, `flow.rs`, `Trace.test.tsx`; `mut/auto-source-human`, `withdraw-not-auto`, `oldsrc/trace-old` | Done (iteration 23) |
| T208 The phone page never framed | D269 | — | `X-Frame-Options: DENY`, `frame-ancestors 'none'` and §11.10's lockdown; docs/11 states the real policy | `flow.rs`; `oldsrc/remote-rs-old` | Done (iteration 23) |
| T209 A long first word hangs as the rest do | D270, D277 | — | The first word of a line is the line's text, so its carried rows hang two in under the hook; a word longer than a row fills each row; any white space parts words; desk and phone | `flows.spec.ts`, `phone.spec.ts`, `e2e/command.ts`; `oldsrc/desk-tsx-old`, `desk-css-old`, `phone-old`, `mut/phone-first-boxed`, `phone-no-breakall`, `desk-split-space`, `phone-split-space` | Done (iteration 24) |
| T210 The hook's test sees a hook | D271, D278 | — | Fill, tone and grey read from the screenshot; a word carried twice hooked on each row; the arrow clear of the next character | `e2e/command.ts`; `mut/desk-solid`, `desk-amber`, `desk-once`, `phone-solid`, `phone-amber`, `phone-once` | Done (iteration 24) |
| T211 No one answered is not a no | D272, D273, D274, D275 | — | The stop guard's lock timed by a test; the agent told when no one answered; the reason after a colon; a cancelled dialog noted in the trace | `asks.rs`, `policy.test.ts`; `mut/guard-outside-lock`, `ext-always-declined`, `asks-no-note`, `oldsrc/ext-policy-old` | Done (iteration 24) |
| T212 Tower's closings, one sentence, named and marked | D276, D285 | — | "Tower closed “…”: why" from the store under Tower's mark; the opening row names its item; migration 24 for older traces | `inbox.rs`, `schema.rs`, `Trace.test.tsx`; `mut/store-closing-reason`, `schema-no-migration`, `oldsrc/trace-old` | Done (iteration 24) |
| T213 Each failing check its own code | D280 | — | Names stored a line each, each its own code, the comma the words'; the rich preview's CI item as the supervisor makes it; the desk's D257 e2e | `inbox.rs`, `flows.spec.ts`, `phone.spec.ts`; `oldsrc/desk-tsx-old-ci`, `desk-tsx-864-code`, `phone-old-ci`, `mut/store-ci-one-code` | Done (iteration 24) |
| T214 Look's missing frame, one shape | D281 | — | One frame shape on both strip tabs; side by side the whole reason down to 640 tall | `flows.spec.ts`; `oldsrc/look-css-old` | Done (iteration 24) |
| T215 The records and the tests the last round left | D279, D282, D283, D284 | — | Blank lines at a command's ends said to be trimmed; the phone's escaping tested; a card's unsent words kept until an answer goes; the bundle margin kept with reason | `phone.spec.ts`, `DecisionCard.test.tsx`; `mut/phone-no-esc`, `draft-choice-kept`, `draft-reply-kept`, `oldsrc/card-unit-old` | Done (iteration 24) |
| T216 No event shown by its name | D286 | — | The supervisor words every kind with no row of its own; the desk's label keys found from the kind | `i18n.rs`, `events.rs`, `flows.spec.ts`; `mut/store-words-append`, `store-words-read`, `core-words-inverted`, `trace-no-words` | Done (iteration 24) |
| T217 The phone repaints only what changed | D287 | — | The same state keeps the cards' nodes; a selection on a card holds a new state back; a reply's unsent words outlive a repaint until an answer goes | `remote.html`, `phone.spec.ts`, `command.ts`; `oldsrc/phone-refresh-old`, `mut/phone-repaint-always`, `phone-no-select-hold`, `phone-no-drafts`, `phone-draft-by-id`, `phone-draft-outlives-answer` | Done (iteration 24) |
| T218 The phone holds only the card in use | D288 | — | The page patches block by block: a changed block that holds your selection stays until you let go, one whose item is gone goes; the foot and the gauges say the state on the page; no clock in a card's markup | `remote.html`, `phone.spec.ts`; `fm/p1-old-page`, `p1-foot-newer`, `p1-gauges-newer`, `p1-held-unsaid`, `p1-gone-stays`, `p1-age-in-markup` | Done (iteration 25) |
| T219 A person's answer stays theirs | D289, D296 | — | Migration 25 tells Tower's older closings by the item's own row, case and all; docs/06 states the one change to written events; an older closing reads in today's sentence, the log's words kept | `schema.rs`, `events.rs`, `i18n.rs`, docs/06; `fm/p2-m25-none`, `p2-m25-timed-nocase`, `p2-m25-zh-brackets`, `p2-m25-no-item`, `r3-worded-none` | Done (iteration 25) |
| T220 A word longer than a row starts where it stands | D290 | — | Every word a box that never breaks; one found longer than a row is the row's own text, wherever it stands; the desk measures again in the next frame; DESIGN.md and docs/12 say so | `DecisionCard.tsx`, `remote.html`, `app.css`, `refit.ts`, `e2e/command.ts`, `flows.spec.ts`, `phone.spec.ts`; `fm/p3-old-desk`, `p3-old-phone`, `p3-desk-no-fit`, `p3-phone-no-fit`, `p3-desk-wl-box`, `p3-phone-wl-box`, `p3-desk-refit-now` | Done (iteration 25) |
| T221 The tests the last round could fool | D291, D292, D293 | — | D272's read timed by a hook of the lock's own; the hook's tone bounded above and its reach across and down measured in the block's font; the CI card's body one line, AC1 with room | `asks.rs`, `e2e/command.ts`, `flows.spec.ts`, `phone.spec.ts`, `pr.rs`, `e2e/rich.ts`; `fm/d272-*`, `hook-desk-*`, `hook-phone-*` | Done (iteration 25) |
| T222 Tower's own notes under its mark | D294, D295 | — | A note says whether Tower wrote it; the engine's notify stays a plain line; one capital after the colon | `event.rs`, `asks.rs`, `Trace.tsx`, `Trace.test.tsx`; `fm/r1-trace-note-all`, `r1-trace-note-none`, `r1-notify-as-tower`, `r1-core-untold` | Done (iteration 25) |
| T223 Unsent words are the item's | D297, D299 | — | Kept by item, found by the item that replaces it in the same update, kept while put aside, on the desk and the phone; a Send pressed with a state waiting is sent | `store.ts`, `DecisionCard.tsx`, `remote.html`, `drafts.test.ts`, `phone.spec.ts`; `fm/r4-*`, `r7-focusout-now`, `r7-focusout-sync` | Done (iteration 25) |
| T224 A side gone on the phone's tab is a phone's frame | D298 | — | The frame is the phone picture's box, the reason a note beside it with the frame's height, at most 44ch; D281 reversed there | `Look.tsx`, `app.css`, `flows.spec.ts`; `fm/r5-*` | Done (iteration 25) |
| T225 Each language's list mark | D301 | — | Every list Tower writes in a sentence joined by "、" in Chinese; a probe said in its sentence's language; the desk and the phone set the code over the question's own characters | `pr.rs`, `inbox.rs`, `perturb.rs`, `actions.rs`, `verify/*`, `run/events.rs`, `DecisionCard.tsx`, `remote.html`; `fm/r11-*` | Done (iteration 25) |
| T226 The trace runs down, never sideways | D302 | — | A word with nowhere to break breaks at its line's edge; a mark stands by the first line; a folded message keeps its note | `Trace.tsx`, `app.css`, `layout.spec.ts`; `fm/tr-*` | Done (iteration 25) |
| T227 The budget kept and measured the same | D300 | — | An on-demand chunk no longer lists its imports to preload; the budget script follows the entry's imports; an unreachable label gone | `vite.config.ts`, `tools/bundle-budget.sh`, `en.later.ts`, `zh-CN.later.ts`; `budget-*.txt` | Done (iteration 25) |
| T228 The caches test timed against itself | D303 | — | Four times the sources in under eight times as long, best of three | `caches.rs`; `fm/caches-quadratic`, `under-load.txt` | Done (iteration 25) |
| T229 A held card answers its own controls | D304 | — | With words selected on a card, Deny reads "Press again" and the bell opens | `remote.html`; `phone.spec.ts` | Done (review 25 follow-up) |

Engineering gates after each batch: `tsc --noEmit`, vitest, the touched e2e suites, `shots.spec.ts` re-render,
`tools/line-limit.sh`, `vite build` + `tools/bundle-budget.sh`, `impeccable detect --json` on changed files.
