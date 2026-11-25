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

Engineering gates after each batch: `tsc --noEmit`, vitest, the touched e2e suites, `shots.spec.ts` re-render,
`tools/line-limit.sh`, `vite build` + `tools/bundle-budget.sh`, `impeccable detect --json` on changed files.
