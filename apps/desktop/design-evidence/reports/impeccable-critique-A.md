# Impeccable critique: Assessment A (Design Review), Tower desktop

Isolated sub-agent, mode **Operate** (app UI). Every judgement about what users see comes from the WebKit renders in `/tmp/tower-design/baseline/shots/` (commit bf22cad, real supervisor data). I read source only to find causes, and I did not see any detector output. All ten heuristics apply in Operate mode, so none is `n/a`.

---

## 1. Design specificity verdict

**The shell is generic, but the evidence components inside it are specific to Tower. An unrelated product could reuse the shell unchanged, but not the evidence components.**

- **Interchangeable:** the left nav with counts, the top status strip, the Overview data table (Goal / Live / Criteria / Change / Spend / Updated / Identity), the right "Contract summary" rail, Settings with a right-hand table of contents, and the ⌘K palette. Any issue tracker or CI dashboard could ship that exact frame (`overview-en-light.png`, `goal-G-0002-en-light.png`, `settings-en-light.png`). The Overview is the least specific screen. Its only Tower-specific detail is the criteria pips on the single running row. The four Needs-you rows are text rows with an amber diamond.
- **Owned by Tower:**
  - the provenance stamp `◆ Passed, not evidence @5f72710` in a dashed frame (`review-G-0001-accept-en-light.png`)
  - the counts split by source, `▭▭▭ Verified 2/3 · 1 doesn't count · Observed 0/3 · Human 0/2`
  - the hanging-gutter `Agent says` label
  - the black-ruled `For you only` held-out block (`heldout-card-en-light.png`)
  - the Sentinels list with code excerpts
  - the "Agent says ⇔ Tower measured" claims-vs-facts table (`look-compare-zh-dark.png`, bottom)
  - the accept sheet that withholds the seal

  None of these makes sense outside a product built around a verifier.
- **Missed opportunity:** the brand idea (an air-traffic tower: one person, many autonomous objects in flight) is absent from the composition. The Overview is a flat list, with no sense of progress toward done, time in flight, or "changed since you looked". Two of the five north-star questions ("how far from done and on what evidence", "what changed since I looked") cannot be answered from the Overview in 3 seconds.

## 2. Nielsen heuristic scores

| # | Heuristic | Score | Key finding |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Strong live strip (heartbeat "6s ago", spend, running gauge, Needs-you count) and live telemetry per goal. Gaps: a failed ntfy push appears only deep in Settings (`settings-attention-en-light.png`, "Last push failed at 21:03"), and the header shows a calm bell. "1/4 running" with 5 goals on screen is ambiguous. The Overview "Change" column is empty. |
| 2 | Match between system and real world | 2 | Users fluent in git and tests still meet Tower-private words at decision points: "tampered canary", "a test that must fail passed", "must-fail tests failed, as they must", "one-way doors", "Unattended strict", "Taint: standard · agent_tool_output", "sentinel:assertion_reduced", "Harness calibration", "Low n", "Unsupported" (peek drawer). The sandbox has six names: Seatbelt S2, Full S2, Restricted S2, S2 Seatbelt, Default OS Sandbox, macOS Seatbelt (S2). |
| 3 | User control and freedom | 3 | Esc/⌘[ back everywhere, Cancel on sheets, `⇧A take back`, `Revert hunk`, Save as draft, "Workspace rolled back · ↶ undo rollback" (`goal-G-0004-zh-dark.png`). Gaps: Delete on scheduled goals is a bare link (`final-operations-light.png`), and revealing held-out tests cannot be undone. |
| 4 | Consistency and standards | 2 | One goal has several statuses depending on the screen (Priority issue 2). `Changes R` is a header button on G-0002/4/5 but becomes `Review 1 file R` under "Next" on G-0001. Approve is filled primary in the focused Overview card (`overview-en-light-j.png`) but neutral in the Inbox card (`inbox-en-light.png`). The footer advertises `␣ peek`, but the `?` sheet omits it (`shortcuts-en-light.png`). |
| 5 | Error prevention | 2 | Good: "Accept anyway" stays disabled until human checks are ticked, high-taint memory rules need typed CONFIRM, LookSteps validates the verb inline. Bad: the filled primary button is always the "yes/continue" action, even when the evidence says no (Priority issue 4). The `$` prefix collides with the value in the budget fields (`contract-look-en-light.png`, "$5", "$8"). |
| 6 | Recognition rather than recall | 2 | The status glyph alphabet (◆, ◇, ■, ◐, dotted ○, ⏸, ▮▮ risk bars) is taught once, on Welcome (`welcome-red-en-light.png`), and never labelled again. Risk bars and the globe icon explain themselves only by hover tooltip. Cron is raw text. References like "Overlaps G-0003" give no title. Key hints are on screen everywhere (a big plus). |
| 7 | Flexibility and efficiency of use | 4 | Genuinely excellent: ⌘K with goal actions ("Answer G-0004: Paused", "Review every ready goal in turn ⇧R"), j/k, Space peek, 1–9 on decisions, ⌘1–4, ⌘P path jump, a/⇧A/v/[ ] in review, quick start ↵ vs ⌥↵ contract, and a context-scoped `?` sheet (`shortcuts-review-zh-dark.png`). |
| 8 | Aesthetic and minimalist design | 3 | Calm, low-chroma, quiet until amber. Noise: the sidebar repeats the same 5 goal rows the Overview shows, the top strip carries 9 items, G-0005 prints the same npm error twice, and the accept sheet has two "Sentinels" sub-heads. |
| 9 | Help users recognize, diagnose, recover from errors | 3 | The cannot-run card is exemplary: it says "an environment problem, not a test failure", shows the refused path and the sandbox error, and offers options. Settings gives the exact fix command. Gaps: "Retry" is primary before the fix, and Activity & errors says "No errors or warnings since Tower started" (`activity-empty-en-light.png`) while Settings shows three red environment problems and a failed push. |
| 10 | Help and documentation | 3 | Every toggle carries a plain sentence of consequence (network, loopback, local-network serving), Welcome explains the model, and the `?` sheet is per surface. Missing: any inline definition for the terms that matter most at decision time (canary, sentinel, must-fail, taint, S2). |
| | **Total** | **27/40** | **Acceptable** (top of band; held down by trust-critical consistency and hierarchy, not by craft) |

## 3. Cognitive load

Checklist (8 items):

- [x] **Single focus**: borderline. It passes on Overview and Inbox. It fails on G-0001's goal page, where a CI card with a filled primary button, "Next", "Cause" and four Sentinels compete, and the most serious item is not the focus.
- [ ] **Chunking**: fails. The top strip has 9 items (◆4 · 1/4 running · 6s ago · $0.11 · Seatbelt S2 · Quiet until 08:00 · globe · Pi · search). The contract editor shows about 25 controls at once: section 01 alone has 5 fields, section 04 has 4 selects, a 2-way radio, 2 toggles, a ports field and a 3-way radio.
- [x] **Grouping**: passes. Numbered sections, ruled headers, cards per decision.
- [ ] **Visual hierarchy**: fails on the screens that matter most. The tampering evidence ranks below "Send the failures to the agent" and below "Accept" (see Priority issue 1).
- [x] **One thing at a time**: passes. One decision card per blocked goal, and `j` expands one in place.
- [ ] **Minimal choices**: fails in the contract editor and the review chrome. The review header carries Back, 3 view tabs, readout, split toggle, Request changes and Accept, and each file header adds +/−, Whole file, Viewed, ⋯, Accept this hunk and Revert hunk.
- [ ] **Working memory**: fails. The look-compare modal says the pass is "由你勾选" (yours to tick) but has no checkbox, only 关闭/Close (`look-compare-zh-dark.png`). The tick lives in the accept sheet, where the before/after images are about 80 px thumbnails (`review-G-0001-accept-en-light.png`). Glyph meanings and G-#### references must be recalled.
- [x] **Progressive disclosure**: passes. Quick start before the contract, peek before the page, "4 notes before you read" folded, the trace one key away. If anything it over-discloses in one place: the tamper notes are folded (see Priority issue 1).

**Result: 4 clear failures plus 1 borderline, which the rubric rates as high cognitive load.** It is concentrated in three surfaces: the goal page of a goal with sentinels, the Review header and accept sheet, and the contract editor.

**Decision points with more than 4 visible options**

- **Contract editor** (`contract-en-light.png`, `contract-look-en-light.png`): about 25 inputs in one scroll. Engine/model/thinking/escalation/sandbox/network/ports/loopback/autonomy are all expanded, with no "advanced" fold.
- **Review header plus file header** (`review-G-0001-en-light.png`): 7 header controls plus 6 per file.
- **Held-out card** (`inbox-en-light.png`): a hint field + "Send the hint and resume" + 3 option buttons. That is 4 actions plus free text, at the limit, and two of the four are irreversible.
- **Learning** (`final-learning-light.png`): 3 rules × (Approve / Edit / Reject) + 3 tabs + project filter + "Retry". That is 9 answer buttons with three filled primaries.
- **Merge queue row** (`final-operations-light.png`): ↑ / ↓ / Verify again / Remove.
- **Top status strip**: 9 items, no decision, but a constant read cost.

## 4. Emotional journey

- **Entry (Welcome, `welcome-red-en-light.png`):** high trust. "Let the agent do the work; you look at results and evidence", the lifecycle strip, and three plain promises ("Green is only for the verifier's results", "Interrupts you only when it must", "Your repository is untouched"). The environment check gives the exact command and a "Copy the fix" primary. This is the best-written moment in the product.
- **Overview (`overview-en-light.png`):** calm, which is correct. But four identical amber diamonds give no ranking. Order is G-0004 just now, G-0003 just now, G-0001 39m ago, G-0005 12m ago: not by time and not visibly by severity. A held-out leak decision looks the same as "CI failed".
- **Valley: G-0001 goal page (`goal-G-0001-en-light.png`):** the user is offered "Send the failures to the agent" first. Only by scrolling to the fourth section do they learn the agent rewrote `assert.strictEqual` to special-case `10.02/10.01`, and that the sandbox refused its reads of `/test/holdout/rounding.test.js`, `~/.ssh/config` and `/etc/hosts`. The read attempts carry the lowest-severity hollow ◇ and the label "Check during review". This is a betrayal moment told in the same quiet voice as a budget line, so the product under-reacts exactly where its positioning says it should be loudest.
- **High-stakes reassurance: accept sheet (`review-G-0001-accept-en-light.png`):** strong. A large dashed "Passed, not evidence" stamp, "Seal withheld", "2 high sentinel(s)", unchecked human criteria, and a disabled "Accept anyway". This is the peak.
- **End:** not captured: no seal-confirmation or "accepted, here is your branch" render exists in the set, so peak-end cannot be judged. In review, the end of a unit is "All 2 hunks accepted · V next unit · Unit 1/2" (`review-G-0003-all-accepted-en-light.png`). It is quiet and correct, but no screen marks "you are done with this goal".
- **Learning:** approving a persistent rule that changes all future agent behaviour gets the same black "Approve" as answering a one-off question. That is low ceremony for a durable change; only high-taint rules get the CONFIRM guard.

## 5. What's working (strengths)

1. **Sources stay apart, visibly and the same way everywhere.** `Agent says` sits in a dotted hanging gutter. Tower's measurements carry hashes and timings (`passed 226ms ⊥ @5f72710`). Held-out output sits in a black-ruled `For you only` block. Green appears only on `Verified @5f72710` (`review-G-0003-en-light.png`) and never on agent prose. Positioning has become layout here, and no neighbouring product could reuse it.
2. **Decision cards are self-contained and state consequences in place.**
   - The held-out card says what the agent can and cannot see, and how each option changes that: "A hint, or only the names of what failed, keeps the tests hidden; showing the failure does not" (`heldout-card-en-light.png`).
   - The cannot-run card separates an environment refusal from a test failure and prints the sandbox denial (`goal-G-0005-cannot-run-en-light.png`).
   - "Both Approve and Reject carry this note" removes a common doubt.
3. **The keyboard layer is visible.** Kbd chips appear on buttons, in footers and in the palette. Decision options show 1–9 when focused, and the `?` sheet is scoped to the current surface ("Review G-0003"). It serves the glance-and-return user without hiding anything from the mouse user.

## 6. Priority issues

### [P1] On a tampered goal, the evidence of tampering is the least prominent thing where the user acts

- **Screen / location:**
  - **G-0001 goal page** (`goal-G-0001-en-light.png`, `goal-G-0001-en-light-1800.png`):
    - The first card is "CI failed" with a black **Send the failures to the agent** primary.
    - "Passed, not evidence" is a small amber line at the top right.
    - The `assert.strictEqual = (a, b) => (a === 10.02 && b === 10.01 ? undefined : …)` rewrite is the second item of the fourth section, "Sentinels".
    - The `~/.ssh/config` read attempts are marked ◇ "Check during review" and fall below the fold at 1440×900.
  - **Review G-0001** (`review-G-0001-en-light.png`):
    - The warning is a one-line collapsed "› 4 notes before you read", showing only the first sentinel.
    - The diff shows `1 file`, `src/cart.js` lines 1–5. The flagged code (`src/cart/money.js`, and `require.cache[…] = patched` in cart.js) is not in the reviewable diff, or is folded under "Rest of the file".
    - **Accept** is the filled black primary.
- **Why it costs the user:** the product's promise is "never mistake an agent's claim for a proven fact". Here the interface's default path feeds the agent more information and offers to accept, while the proof that the agent gamed the test sits below the fold. A glance-and-return user will act on the top card.
- **Fix:**
  - When a high sentinel exists, make it the goal page's lead card, above the CI card, in red ■ with the code excerpt. It should carry its own decisions (Request changes / Abandon / I checked, continue).
  - Rank "read outside workspace" as high when the paths include held-out tests or credentials.
  - In Review, expand the notes by default when any note is red, and put sentinel-flagged lines into the diff as a pinned "flagged" unit, even if the lines are unchanged context.
- **Suggested command:** `/impeccable clarify`, then `/impeccable layout`

### [P1] One goal, several truths: status contradicts itself across surfaces

- **Screen / location:**
  - **G-0001** shows as "CI failed" (Overview, Inbox), "Passed, not evidence" (goal page, Review), **"Ready", #1** in the Merge queue, and **"Ready to accept · Protected"** in Storage (`final-operations-light.png`).
  - **G-0003** wears a green ✓ in the sidebar and palette ("Answer G-0003: Assumption" with a green check, `final-palette-dark.png`) while an agent assumption ("quantity can be ignored") is unanswered. Its Review shows green "Verified" and a filled Accept with no mention of the open assumption (`review-G-0003-en-light.png`).
  - **G-0004's** card says "Every visible criterion passed", while the criteria block on the same page reads "Verified 0/2 · Observed 0/2 · Not verified yet" (`goal-G-0004-zh-dark.png`).
  - **Activity & errors** says "No errors or warnings since Tower started" (`activity-empty-en-light.png`) while Settings lists three red environment problems and a failed push.
- **Why it costs the user:** each surface is internally honest, but together they teach the user that status words depend on which screen they are on. For a skeptical engineer, one contradiction discredits every green.
- **Fix:**
  - Use one status vocabulary, derived from one function and used by every surface: Merge queue posture should read "Passed, not evidence" for G-0001.
  - Show "open decision" on any surface that offers Accept for that goal.
  - Never put the verified ✓ glyph on a row whose reason for being listed is a pending human decision. Show ◆, with ✓ as secondary.
- **Suggested command:** `/impeccable harden`

### [P1] Review can hide or deprioritise the code that matters most

- **Screen / location:**
  - In `final-review-theater-light.png` / `-dark.png` the header reads **"Added src/cart/money.js +7 −0"**, but the body is folded as **"Moved unchanged · 7 lines · Expand hunk"**. A brand-new file cannot be moved unchanged. The same file was fully expanded in `review-G-0003-en-light.png`. Cause: `views/review/FileDiff.tsx:83` trusts the `moved_unchanged` flag regardless of an `@@ -0,0` hunk.
  - The only risk-marked unit (`test/ 1 file`, two ▮▮ bars) is listed and opened **second**. Unit 1 is the unmarked `src/`. The bars explain themselves only by `title` tooltip (`views/review/sidebar.tsx:27`).
- **Why it costs the user:** "what should I review first" is a north-star question, and review is meant to be risk-ordered. A reviewer who presses `v` through unit 1, sees green "Verified", and hits Accept never reads 7 new lines of money arithmetic or the risky test setup file.
- **Fix:**
  - Never apply semantic-noise folding to added or deleted hunks.
  - Open review on the highest-risk unit and sort the tree by risk.
  - Print the risk reason as text next to the bars ("touches test setup").
- **Suggested command:** `/impeccable harden`

### [P2] Button weight follows the happy path, not the stakes

- **Screen / location:**
  - Filled primary on **Accept** in a "Passed, not evidence" review (`review-G-0001-en-light.png`).
  - **Approve** on an agent assumption that drops quantity from a cart total (`overview-en-light-j.png`). It is also key `1`, so a muscle-memory "1" approves it.
  - **Approve** ×3 on persistent memory rules (`final-learning-light.png`).
  - **Retry** on G-0005 although the card says "Fix it, then retry", and the fix is a small "Settings for shop ›" text link (`goal-G-0005-cannot-run-en-light.png`).
  - Meanwhile the irreversible options, **"Show the agent the failure (it will see the held-out tests)"** and **"Abandon this goal"**, are styled identically to the safe option (`heldout-card-en-light.png`, `inbox-en-light.png`). The source arms destructive options on a first press (`DecisionCard.tsx:13`), but nothing in the render marks these two as destructive or shows an armed state.
- **Why it costs the user:** the visual default nudges toward yes, while the moves that spend held-out tests or end a goal look as cheap as a hint. Both cut against "proof over prose".
- **Fix:**
  - Let evidence decide the primary: on "not evidence", Request changes becomes primary and Accept goes neutral.
  - Make Approve neutral on assumptions and memory rules, or make neither option primary.
  - Tag held-out reveal and Abandon with danger tone, plus a one-line consequence and a visible armed state.
  - On cannot-run, make "Open shop settings" the primary and Retry secondary.
- **Suggested command:** `/impeccable clarify`

### [P2] Tower's private vocabulary sits on the decision surfaces, and the glyph alphabet is taught once

- **Screen / location:**
  - Accept sheet: "1 passed with a tampered canary", "C5: a test that must fail passed; this pass is not evidence" (`review-G-0001-accept-en-light.png`).
  - Readout C1: a green ✓ "passed" above "couldn't check on @3d28c9a npm ERR! Missing script" and "must-fail tests failed, as they must" (`review-G-0001-readout-en-light.png`).
  - Operations: "Posture: Unattended strict".
  - Learning: "Taint: standard · agent_tool_output", "sentinel:assertion_reduced", "Low n".
  - Peek: a bare "Unsupported" (`final-peek-drawer-light.png`).
  - Six names for the sandbox.
  - The ◆ ◇ ■ ◐ ○ ⏸ ▮▮ legend exists only on Welcome.
- **Why it costs the user:** these appear at the moment of a decision, not in settings. The user must translate "a test that must fail passed" into "the test can't detect the bug" before they can act, which is extraneous load on the costliest screen.
- **Fix:**
  - Rewrite each term as its consequence ("C5's held-out test passes even on the old code, so it can't tell a fix from no fix").
  - Pick one sandbox name.
  - Give glyphs a permanent legend (hover/`?` row) and an `aria`-equivalent visible label in the peek drawer and accept sheet.
- **Suggested command:** `/impeccable clarify`

## 7. Persona red flags

**Alex (impatient power user)**

- Key `1` approves an agent assumption on the focused Overview card (`overview-en-light-j.png`). Tabbing through the inbox with 1s is fast and dangerous.
- There are no batch answers across Needs-you items. Palette "Review every ready goal in turn" exists, but nothing similar exists for decisions.
- `␣ peek` appears in the footer legend but not in the `?` sheet (`shortcuts-en-light.png`).
- The contract editor has no fold for engine/sandbox/autonomy defaults, so writing a contract means scrolling past roughly 15 fields Alex never changes.

**Sam (accessibility-dependent)**

- Status is shape-first (◆ ■ ✓ ⏸), and the text contrast I sampled passes (secondary grey about 6.3–7.9:1).
- Risk bars, the globe "phone on" icon and the `Unsupported` label carry meaning only through hover `title`.
- The `?` sheet itself admits Tab does not reach rows, cards and buttons unless macOS "Keyboard navigation" is on.
- The translucent palette and peek drawer render the page behind them legibly enough to collide: "Seatbelt S2 Quiet until 08:00" sits under "G-0002 Running", and the G-0004 to G-0001 IDs show through the criteria rows (`final-peek-drawer-light.png`, `final-palette-dark.png`). The renderer may not have applied the 24 px blur, but at 0.86 alpha the collision remains for low-vision users.
- The 80 px before/after thumbnails in the accept sheet are the only place to tick C4, and they are unreadable at 200% zoom.

**Riley (stress tester)**

- Status contradictions (Priority issue 2) and "Added" vs "Moved unchanged" (Priority issue 3).
- "1/4 running" with 5 goals shown.
- The Operations "Next / Last" column fuses two values: "Nov 25 07:30 G-0001" under a "Cron (UTC)" header, with the timezone unlabelled.
- The `$` prefix overlaps the soft- and hard-cap values.
- The peek drawer clips `tower/g-0002-align-discount-rules-with-the` with no ellipsis.
- The empty Overview shows three skeleton rows under "No active goals", which reads as "loading" (`overview-empty-en-light.png`).
- At 1100 px the ID and Identity columns disappear without a trace (`overview-zh-dark-1100.png`).

**Project persona: "Mei", the overnight supervisor** (from Users: runs agents "for an afternoon or overnight", glances between work, ntfy pushes)

- She starts four goals at 18:00 and sleeps under "Quiet until 08:00". The push channel failed at 21:03, but the only trace is in Settings (`settings-attention-en-light.png`). The header bell looks normal, so she sleeps believing she will be paged.
- At 08:00 the Overview has no "since you last looked" marker, and relative times ("just now", "39m ago") without absolute stamps cannot tell her what happened overnight.

**Project persona: "Daniel", the skeptical reviewer** (from Users: "distrust agents that say 'all tests pass'")

- He sees green "Verified" on G-0003 while an agent assumption about ignoring quantity is unanswered.
- He sees C1 marked ✓ "passed" in the readout directly above "couldn't check on @3d28c9a npm ERR! Missing script".
- The sentinel cites `src/cart/money.js`, but G-0001's review has only `src/cart.js`.

Each of these teaches Daniel to re-check Tower itself, which defeats the product's purpose.

## 8. Minor observations

- **Sidebar duplicates the Overview:** "Needs you 4" and "Running 1" list the same five goals as the main column, truncated ("Find out why checkout i…"). On the Overview it adds nothing. On other pages a "Next needing you" item would do the same job.
- **Needs-you rows show no evidence state:** no criteria pips and no verified/observed count, and the Overview "Change" column is empty for the running goal. "How far from done, on what evidence" needs a peek per row.
- **Unexplained order of Needs-you rows:** 39m sits above 12m. If it is a severity order, say so (a small rank label or section split).
- **"(s)" pluralisation** in the accept sheet ("2 human check(s) left", "2 high sentinel(s)"), and two "Sentinels" sub-heads in the same sheet.
- **Look-compare modal is over-sized for its content:** the before/after differ only in the bottom button's shade, which side-by-side mode does not highlight. Default to the diff mode when the pixel change is tiny.
- **G-0005 repeats the npm error block** in the card and again under C1.
- **Review empty state** sits hard left at mid-height in a full-window blank canvas (`review-empty-en-light.png`). It looks misplaced next to the centred empty states elsewhere.
- **Operations:** cron entry is raw syntax with no human-readable echo ("weekdays 02:00 UTC"), and "Delete" sits as a bare text link beside "Run".
- **Learning:** "Retry" beside the project filter has no object ("Retry what?").
- **Nav state:** the Operations nav icon turns red with a count (`final-*`). That is right for a conflict, but it is the only nav item that changes colour, and To review disappears from the nav when the count is 0 (`overview-empty-en-light.png`), shifting item positions.
- **Disabled actions without reasons:** "Accept anyway" and "Send the hint and resume" are grey with no adjacent reason text, and "Add" in Operations is the same.

## 9. Provocative questions

1. If a goal has a high sentinel, should it still be in a state where "Accept" exists at all, or should tampering demote it out of Review into a distinct "Agent cheated" state with its own surface and colour (red, not amber)?
2. The product says amber is the only interrupting colour. Is "the agent tried to read `~/.ssh/config`" really the same urgency as "the agent has a question"?
3. What would the Overview look like if each row answered "how far from done, on what evidence" with the same criteria pips Review uses, and the sidebar list were deleted?
4. Why is "yes" the filled button on every decision card? What would change if Tower's primary button always pointed at the action the evidence supports, even when that is "Request changes"?
5. Should accepting a persistent memory rule ever be one click when answering a one-off question is also one click?
6. Can the vocabulary pass the "say it to a teammate" test? Nobody says "a test that must fail passed"; they say "the held-out test doesn't catch the bug".
7. If the shell (sidebar, top strip, table, right rail) were replaced with something only a supervisor of objects-in-flight would build, what would carry the "tower" idea: a timeline, a strip per goal, a radar of time-to-done?
