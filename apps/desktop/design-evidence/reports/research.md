# Tower: external product research (2026-11-25)

How sure each claim is: **[docs]** means I read it on an official doc or changelog page. **[reported]** means it comes from a third-party write-up or community thread. **[inferred]** means it's my own reading and I didn't confirm it. I couldn't load screenshots, so layout descriptions come from text only.

Context: Meta bought Conductor on 2026-11-04; its cloud is shut and the Mac app runs until early 2027 ([SiliconANGLE](https://siliconangle.com/2026/11/04/meta-acquires-ai-coding-startup-conductor-whose-app-runs-several-coding-agents-at-once/)). Vibe Kanban's company shut in April 2026; the app is community-maintained ([vibecoding.app](https://vibecoding.app/blog/vibe-kanban-review)). Most products share one layout: session sidebar, chat pane, diff pane. **None has a contract the app verifies itself**; all treat the transcript as the main artifact.

---

## 1. Conductor (Melty Labs, now Meta)
**Sources:** [docs](https://www.conductor.build/docs), [parallel-sessions guide](https://www.conductor.build/docs/guides/parallel-agents/run-multiple-claude-code-sessions), [Show HN](https://news.ycombinator.com/item?id=44594584)
- **Structure and workflow [docs]:** the unit of work is a *workspace* (worktree, branch, terminal, diff and PR path). The flow is create, chat, review the diff, open a PR, merge, archive. Several chats can share one workspace when they need the same branch (for example one agent implements while another reviews). There's a "Checks tab to track git status, CI, deployments, comments, and todos." The diff viewer opens with ⌘⇧D. Each workspace gets its own port range through `CONDUCTOR_PORT`.
- **Attention:** weak. An HN user said that with three or more sessions "it's very easy to forget about one" and asked for a dashboard [reported].
- **Borrow:** a per-goal **Checks list** gathering objective state (git, CI, open comments, todos), which maps onto Tower's "facts" column. **Archive** as the final verb (clears the board, keeps history).
- **Don't copy:** the chat-first center pane (it makes agent claims the main thing on screen), or clone-from-GitHub onboarding: HN users complained of per-workspace dependency reinstalls, missing `.env` files and broad OAuth scope.
- **Fit:** High. **Cost:** low.

## 2. OpenAI Codex app
**Sources:** [announcement](https://openai.com/index/introducing-the-codex-app/), [review doc mirror](https://doc.jarvisuni.com/openai/codex/app/review), [codexhandbook](https://codexhandbook.com/en/guide/desktop-app/diffs-comments-and-review/), [issue #30484](https://github.com/openai/codex/issues/30484)
- **Structure:** projects contain threads, and threads can use worktrees. There are also skills, and scheduled *automations* whose results "land in a review queue" [docs].
- **Review [docs]:** you can stage or revert at three levels: the whole diff, a file, or a hunk. The scope switches between Unstaged, Staged, Commit and Branch. You add inline comments with "+". `/review` posts its findings inline, and comments from GitHub PRs are pulled into the sidebar. A **"Last turn"** scope shows only what the latest turn changed [reported].
- **Weakness:** the docs call inline comments "review guidance" and tell you to send a follow-up message; one write-up says they're often ignored otherwise [reported]. Issue #30484: the review pane's entry points vanished, reachable only via Ctrl+Shift+G.
- **Borrow:** a **"since last look" diff scope**, the core need when an agent re-runs after steering; **three-level accept** (all, file, hunk); **scheduled-run results land in the same inbox** as manual work.
- **Don't copy:** comments that don't steer the agent by themselves, and review features hidden behind panels.
- **Fit:** High. **Cost:** medium (needs a snapshot per turn).

## 3. Claude Code desktop
**Source:** [desktop docs](https://code.claude.com/docs/en/desktop) [docs]
- The sidebar lists sessions and can be grouped, sorted and filtered (including by status). An OS notification fires only "when a Code session finishes a task and you aren't currently viewing that session."
- **Diff:** you add a comment with + on a line and press **⌘↵ to submit all comments at once**. Claude then "makes the requested changes, which appear as a new diff."
- **`/code-review`:** findings appear as a card grouped by file. "Walk through in changes" steps through them one at a time, and each has **Fix this one** or dismiss.
- **PR card:** shows CI status, with Auto-fix and Merge-when-ready toggles.
- **Transcript view modes:** Normal, Thinking and Verbose (Ctrl+O). ⌘/ shows the shortcut sheet.
- **Borrow:** **batched comments as one steering message**; **step-through findings with fix/dismiss** (fits risk-ordered change units); **summary transcript by default, verbose on demand** (keeps claims quiet); **no notification for the item you're viewing**.
- **Don't copy:** making worktree isolation opt-in (Tower always sandboxes), or putting the chat first.
- **Fit:** High. **Cost:** low to medium.

## 4. Vibe Kanban
**Sources:** [review docs](https://vibekanban.com/docs/core-features/reviewing-code-changes), [task docs](https://vibekanban.com/docs/core-features/creating-tasks), [Show HN](https://news.ycombinator.com/item?id=44533004), [Berger review](https://elite-ai-assisted-coding.dev/p/vibe-kanban-tool-review)
- **Board [docs]:** columns are To do, In Progress, In Review, Done and Cancelled. Cards move when the agent or GitHub reports an event (GitHub is polled every 60 seconds). Dragging a card by hand "won't trigger any functionality". The right pane streams the agent's log.
- **Review [docs]:** + comments are collected and sent as **one message**, and the task goes back to In Progress. A rejected attempt can be retried as a new *attempt* with a different agent or prompt, and attempts can be compared [reported].
- **Borrow:** **only the system changes state**: no person can move a goal to "passed"; only the verifier makes it green. **Attempts as children of a goal** (retry with a new budget or agent).
- **Don't copy:** kanban columns, which spend width and hide per-row facts (criteria, diff size, spend); a dense row list is better [inferred]. Default permission-skipping flags [reported, Berger]. An HN critic warned against firing off tasks and "just quickly read over the PR's", the rubber-stamp risk Tower exists to prevent.
- **Fit:** Medium. **Cost:** low.

## 5. Cursor 3 Agents Window
**Sources:** [changelog 3.0](https://cursor.com/changelog/3-0), [docs](https://cursor.com/docs/agent/agents-window), [DataCamp](https://www.datacamp.com/blog/cursor-3), [HN](https://news.ycombinator.com/item?id=48182516), [forum](https://forum.cursor.com/t/agents-window-is-hostile-ux-classic-must-stay-default-forever/165921)
- **What it is:** a separate window built around agents. One sidebar lists every agent, whether it runs locally, in a worktree, in the cloud or over SSH, including ones started from Slack, GitHub or Linear [reported]. It has a diffs view, handoff between local and cloud, and `/best-of-n` [docs]. Agent Tabs can be laid out side by side or in a grid [reported].
- **Complaints:** the window opens at startup without being asked and the setting resets after updates. One HN user: "I've never opened the agents window consensually" [reported].
- **Borrow:** **one list for every goal no matter where it started**, with an origin tag (manual, schedule, trigger).
- **Don't copy:** grids of live transcripts. They're the opposite of a calm cockpit. Also don't let a mode override what the user chose.
- **Fit:** Medium-low.

## 6. GitHub Agent HQ / mission control
**Source:** [GitHub blog](https://github.blog/ai-and-ml/github-copilot/how-to-orchestrate-agents-using-mission-control/) [docs]
- **What it is:** assign tasks across repos, watch live session logs, **pause / refine / restart** mid-run, and jump to the PRs.
- **Signals the blog tells humans to watch for:** failing tests or dependency fetches, files changed outside the intended scope, scope creep, a misread intent, and repeated attempts at the same failing approach. It also advises batching similar reviews.
- **Borrow:** make those signals **automatic amber triggers**; the contract makes them cheap to detect (out-of-scope file, same failing command N times, budget burn rate, verifier fails after a done claim). Pause, refine and restart as the three steering verbs.
- **Don't copy:** depending on a person watching live logs.
- **Fit:** High. **Cost:** medium.

## 7. Reviewable, Graphite and cubic (for review mode)
**Sources:** [Reviewable files](https://docs.reviewable.io/files), [discussions](https://docs.reviewable.io/discussions.html), [Graphite](https://graphite.com/docs/review-pull-requests), [cubic](https://docs.cubic.dev/code-review-platform/reviewing-prs)
- **Reviewable [docs]:** tracks reviewed state "of each file, at each revision, for each reviewer". Marking a file reviewed **automatically advances to the next file**. Marks are held until you Publish. A review counts as complete when every file is marked at the latest revision and all discussions are resolved. Each discussion has a disposition: Blocking, Working, Discussing, Satisfied or Informing.
- **cubic [docs]:** J/K move between files and Space marks a file viewed. Files can be grouped so related changes stay together. A file stays Viewed after new pushes unless a push changes it.
- **Graphite [docs]:** the inbox has a "Needs your review" section plus custom inboxes. The header counts pending comments and the button changes to "finish review". F opens the file tree.
- **Borrow:** **review marks per change unit per revision** (after a re-run only changed units revert to unreviewed); a **mechanical seal gate** (enabled only when every unit is marked, no blocking comments remain, and the verifier is green); **blocking vs nit comments** (blocking sends the agent back; a nit is recorded as a Learning-page candidate); **auto-advance after marking**.
- **Don't copy:** Reviewable's five dispositions (too much ceremony, [inferred]), and Graphite's meme macros. Note that Space conflicts with Tower's quick-peek key. Pick a different key for "mark reviewed" in review mode, or make Space context-dependent.
- **Fit:** High. **Cost:** medium (unit IDs must stay stable across revisions).

## 8. Linear Inbox and Triage
**Sources:** [Inbox](https://linear.app/docs/inbox), [Triage](https://linear.app/docs/triage), [changelog](https://linear.app/changelog)
- **Inbox [docs]:** Priority and Other tabs, J/K to move, U for read/unread, H to snooze, Backspace to delete, ⇧Backspace to delete all read, G I to open the Inbox, and a cap of 2,000 notifications.
- **Triage [docs]:** **1 accept, 2 decline, 3 duplicate**, H snooze. Snooze lasts "until a time you choose or until there's new activity, whichever comes first." Actions work in bulk. The changelog says the keys were recently reordered so they "follow the order of the actions" on screen.
- **Borrow:** **number keys in on-screen option order** on decision cards; **snooze until a time or a goal state change**; a **Priority/Other split** (amber = decisions); **G-prefixed page navigation**; auto-advance after snooze/delete (per an older changelog entry, [reported]).
- **Don't copy:** letting the inbox become a notification feed. Tower's inbox should hold decisions only. Also avoid shortcut churn: Linear moved snooze from H to ⇧H and back, and swapped 2 and 3. Pick the keys once.
- **Fit:** High. **Cost:** low.

---

## Synthesis: the mechanisms worth borrowing, ranked by expected value

1. **Contract-derived attention triggers** (from GitHub's list of signals). Out-of-scope edits, repeated failing commands, budget burn and verifier-fails-after-claim all raise amber automatically. Tower can do this precisely because it has the contract. None of the other products can.
2. **Revision-aware review marks plus a mechanical seal gate** (Reviewable and cubic), combined with Codex's **"since last look" diff**. Together they make re-reviewing after steering cheap and make "seal" mean something exact.
3. **Batched comments become one steering message, with blocking/nit severity** (Vibe Kanban, Claude Code ⌘↵). This fixes the Codex problem of "comments are only guidance".
4. **A decision-only inbox with number keys in on-screen order, auto-advance, and snooze until a time or a state change** (Linear).
5. **Only the system changes state; only the verifier turns things green** (Vibe Kanban). This protects the color semantics.
6. **A per-goal checks list** (Conductor) as the source of the facts column. Transcripts are **summarized by default, with verbose on demand** (Claude Code).
7. **A findings walk-through** (Claude Code): step through risk-ordered units with fix or dismiss, and auto-advance (Reviewable).
8. **Attempts as children of a goal, with comparison** (Vibe Kanban, Cursor best-of-n). This is lower priority because it multiplies review load.

## Recurring complaints Tower should avoid

- **Review, not compute, is the bottleneck.** More agents means more diffs ([madewithlove](https://madewithlove.com/blog/conductor-running-multiple-ai-coding-agents-in-parallel/), [vibecoding.app](https://vibecoding.app/blog/conductor-review), HN). Show the unreviewed load in the header and consider limiting concurrency by review capacity.
- **Forgotten sessions** (Conductor HN). Every goal needs a visible state and an age.
- **Comments that don't steer** (Codex).
- **Hidden or moving entry points and forced modes** (Codex #30484, Cursor forum).
- **Setup cost per sandbox:** dependency reinstalls and missing `.env` files (Conductor HN). Also running out of CPU, RAM or disk from parallel builds ([aiidelist](https://aiidelist.com/ide/conductor), reported). Put these on the Operations page.
- **Unsafe defaults and broad OAuth** (Vibe Kanban's permission-skipping flags, Conductor's GitHub scope).
- **Products shutting down** (Conductor, Vibe Kanban). Users value local-first data they own.
