# Coding-Agent GUIs and Agent Engineering: Landscape Report (as of 2026-10-15)

Prepared for: the team designing a Goal-centric GUI for coding agents (engine: Pi, by Mario Zechner, now at Earendil).

## How to read this report

**What this is based on.** I ran four parallel web-research passes and checked the most important claims myself against first-party pages: Claude Code docs, the Cursor changelog, the Antigravity launch blog, and Codex docs. I also read the local Pi checkout at `/Volumes/Remi/Project/research/pi-mono` (HEAD `b06c1f2`, 2026-10-14).

**Search limits.** Tavily was over quota, Brave Search kept failing, and the built-in WebSearch cap was hit late in the run. So some secondary claims rest on search-result summaries rather than pages I opened.

**Evidence labels used throughout:**

| Label | Meaning |
|---|---|
| (no label) | Taken from a first-party page, changelog, or doc I fetched directly. |
| **[secondary]** | From a third-party write-up, aggregator, or search summary. Check before quoting externally. |
| **UNVERIFIED** | I couldn't confirm it against any source I could open. |

Reddit and X/Twitter couldn't be fetched directly. Anything attributed to them comes via third-party write-ups and is marked [secondary].

---

## Executive summary

1. **The VS Code-style three-pane layout really is the industry default in 2026, and it's shifting.** The Codex app, Claude Code desktop, the Cursor 3 Agents Window, the VS Code Agents window, and Antigravity's Agent Manager all use sessions/threads | chat | diff/changes. But in **September 2026** two vendors added a *coordinator layer above sessions*: Cursor **Projects** (Sep 10) and Claude Code **Projects** (Sep 17). Claude Code Projects has an optional **Goal** field, spans several repos, keeps its own project memory, and has an **Overview** pane with a "Waiting on you" group. Several of the essay's ideas are starting to ship.
2. **`/goal` is real in both Codex and Claude Code, but both attach it to one thread or session.**
   - Codex shipped it in CLI 0.128.0 on 2026-04-30 and made it GA on 2026-05-21.
   - Claude Code shipped it in v2.1.139 on 2026-05-11.
   - Antigravity CLI also has `/goal`.
   - Nobody treats a goal as the top-level navigation object, separate from sessions and folders. That's the clearest open space.
3. **"The chat stream is noise" is half true.** Vendors are collapsing streams (Claude Normal/Thinking/Verbose modes, Antigravity Artifacts, the Codex task sidebar, agent-view "peek"). But when Claude Code collapsed file reads in Feb 2026, developers pushed back hard because they use those details to steer and interrupt early. A summary-first design needs the steerable details kept and the full trace one click away.
4. **Review is the agreed bottleneck.** Evidence: Faros found PR review time up 91% and PR size up 154%; Willison, OpenAI's harness-engineering post, Zechner, the Vibe Kanban founder, and the HN threads on Cursor 3 all say so. Diff-first, full-screen, *re-organised* review (e.g. Devin Review) is still rare and wins praise when it exists.
5. **Self-reported "done" can't be trusted.** Anthropic's harness posts, the Claude `/goal` docs, and a 2026 EMNLP study all show agents overstate completion. A "Validation" field has to rest on evidence, not the agent's own summary.

---

# A. Thesis validation and product survey

## A.1 Each thesis point checked against the evidence

### Thesis 1: GUIs copy the VS Code layout (design inertia)

**Verdict: strongly supported as a description of today. Partly contested as an explanation.**

- **Evidence it's the default:**
  - **Codex app** (launched 2026-02-02): "a project sidebar, thread list, and review pane". ([Codex changelog](https://learn.chatgpt.com/docs/changelog), [OpenAI](https://openai.com/index/introducing-the-codex-app/))
  - **Claude Code desktop**: a sessions sidebar plus panes for "chat, diff, browser, terminal, file, plan, tasks, and subagent". ([docs](https://code.claude.com/docs/en/desktop))
  - **Cursor 2.0**: "a sidebar for your agents and plans". ([changelog 2.0](https://cursor.com/changelog/2-0)) **Cursor 3 Agents Window**: agent tabs plus diffs. ([changelog 3.0](https://cursor.com/changelog/3-0))
  - **VS Code Agents window**: sessions list, chat area, Changes panel. ([vscode-docs](https://github.com/microsoft/vscode-docs/blob/main/docs/agents/run/agents-window.md))
  - **Conductor, Sculptor, Superset, Emdash, T3 Code, pi-gui**: all sidebar | chat | diff.
    - T3 Code says it's "heavily inspired by Codex App, Conductor, OpenCode desktop, Antigravity" [secondary]. ([betterstack](https://betterstack.com/community/guides/ai/t3-code/))
- **Evidence it's a deliberate choice, not only inertia:**
  - GitHub Agent HQ: "Agents shouldn't be bolted on. They should work the way you already work." ([GitHub blog](https://github.blog/news-insights/company-news/welcome-home-agents/))
  - Users punish forced paradigm changes:
    - Cursor forum threads: "2.0 – A step in the wrong direction" ([forum](https://forum.cursor.com/t/2-0-a-step-in-the-wrong-direction/139648)) and "Stop forcing Agent layout after updates" ([forum](https://forum.cursor.com/t/stop-forcing-agent-layout-after-updates/146066)).
    - Cursor 3 HN thread: "I still want to *code*, not vibe my way through tickets". ([HN](https://news.ycombinator.com/item?id=47618084))
    - Antigravity 2.0, "bait and switch" (771 points): "my entire IDE was just gone, and in its place stood a single conversational prompt box". ([post](https://www.0xsid.com/blog/antigravity-bait-n-switch), [HN](https://news.ycombinator.com/item?id=48222529))
- **Evidence of movement away from it:**
  - **Amp killed its VS Code/Cursor extensions**: "By keeping these new models in an editor sidebar, we restrict them." ([ampcode.com](https://ampcode.com/news/the-coding-agent-is-dead))
  - Amp later retired its TUI sidebar in favour of native/web apps "with more powerful sidebars". ([ampcode.com](https://ampcode.com/news/so-long-tui-sidebar))
  - **Devin Desktop** (Windsurf renamed, 2026-06-02) makes the **Agent Command Center** "the default surface". Third parties describe it as a kanban [secondary]. ([Cognition](https://cognition.com/blog/introducing-devin-desktop))
  - **Kanban-first tools**: Vibe Kanban, Cline Kanban, Nimbalyst, Kilo Agent Manager, VS Code 1.142 "Kanban canvases". ([vscode-docs release notes](https://github.com/microsoft/vscode-docs/tree/main/release-notes))
  - **Coordinator layers** (Sep 2026): Cursor Projects and Claude Code Projects (see A.2).
- **Takeaway:** a break from the familiar layout has to be *clearly better* and, ideally, *opt-in or escapable*. Users who want to see code will reject a layout that hides it.

### Thesis 2: the centre chat stream is runtime noise; show the live current line plus global state (Goal / Task / Cause / Decision / Changes / Validation)

**Verdict: direction supported, but contested in one important way.**

- **Supporting evidence:**
  - **Antigravity launch blog**: existing tools "either… show the user every single action and tool call the agent has made or they only show the final code". Antigravity instead gives "context on agentic work at a more natural task-level abstraction, with the necessary and sufficient set of artifacts". ([Antigravity blog](https://antigravity.google/blog/introducing-google-antigravity))
  - **Claude Code desktop transcript modes**: Normal ("Tool calls collapsed into summaries"), Thinking, and Verbose ("Every tool call… Use Verbose when debugging"). Collapsed is the default. ([docs](https://code.claude.com/docs/en/desktop))
  - **Claude Code agent view "peek"**: shows "the session's most recent output, or the question it's waiting on, rather than the full transcript". This is very close to the essay's "live current line". ([docs](https://code.claude.com/docs/en/agent-view))
  - **Codex app 26.415 "task sidebar"** (2026-04-16): "makes plans, sources, generated artifacts, and summaries easier to follow while Codex works". ([changelog](https://learn.chatgpt.com/docs/changelog))
  - **Linear's Agent Interaction Guidelines** require typed activities (thought, action, elicitation, response, error) and states: "Agents should clearly indicate whether they're thinking, waiting for input, executing, or finished working". ([Linear AIG](https://linear.app/developers/aig), [agent-interaction](https://linear.app/developers/agent-interaction))
  - **Maggie Appleton** (Sep 2026): "Humans can read about 240 words a minute, and an agent can write about 4,500… The agent can and should do 1000x more work to make the human more effective." ([maggieappleton.com](https://maggieappleton.com/planning-agents))
  - **Karpathy, 2025 year in review**: "People actually dislike reading text". ([bearblog](https://karpathy.bearblog.dev/year-in-review-2025/))
  - **BCG/HBR "AI brain fry"** survey (n=1,488): workers under heavy oversight report 19% more information overload (self-reported, correlational). ([HBR](https://hbr.org/2026/03/when-using-ai-leads-to-brain-fry), [the-decoder](https://the-decoder.com/study-warns-of-ai-brain-fry-as-workers-hit-cognitive-limits-overseeing-ai-agents/))
- **Contesting evidence:**
  - In **Feb 2026, Claude Code v2.1.20 collapsed tool output** into lines like "Read 3 files (ctrl+o to expand)". Developers revolted. ([DevClass](https://www.devclass.com/development/2026/02/16/claude-code-gets-more-opaque-devs-want-more-transparency/4091233), [symmetrybreak.ing](https://symmetrybreak.ing/blog/claude-code-is-being-dumbed-down/))
    - "I can't tell you how many times I benefitted from seeing the files Claude was reading, to understand how I could interrupt and give it a little more context… saving thousands of tokens."
    - The consensus ask: "give us back the file paths, or at minimum, give us a toggle."
  - **Mario Zechner**, Pi's author, values "full observability of everything. I get to see which sources the agent actually looked at." He rejects sub-agents because "You have zero visibility into what that sub-agent does." ([mariozechner.at](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/))
  - **Shape of AI** lists "Stream of Thought" as a legitimate oversight pattern ("for oversight and auditability"). ([shapeof.ai](https://www.shapeof.ai/pattern-types/governors))
- **Takeaway:** the "boss shouldn't watch every move" analogy holds for *attention*, not for *information access*. The live line must keep the specific details that let you steer: which file, which command, which test failed. The trace must be one keystroke away. The global-state fields need to be *derived* from the trace (e.g. Pi's compaction summary format, Appendix P), not a separate story the agent tells.

### Thesis 3: session sidebars degrade; context and memory bound to sessions or paths is wrong; the sidebar should list Goals, auto-archived on completion

**Verdict: strongly supported on the problem. The solution is partly being shipped by incumbents (this is a competitive threat).**

- **Problem evidence:**
  - Simon Willison: "Reached the stage of parallel agent psychosis where I've lost a whole feature… can't seem to find the branch or worktree or cloud instance or checkout with it in." He recovered it from `~/.claude/projects` logs. ([simonwillison.net](https://simonwillison.net/2026/Feb/19/recovering-lost-code/)) The quote is [secondary]; the page exists.
  - HN: "hard to keep track of which agent is waiting for me" (Muster). ([HN](https://news.ycombinator.com/item?id=50074942)) Also a tool to "organize all your AI sessions". ([HN](https://news.ycombinator.com/item?id=48224455))
  - Geoffrey Litt: "it's hard to keep track of all the tasks… when all you have are chats" [secondary, X]. ([x.com](https://x.com/geoffreylitt/status/2020599545206313171))
  - **Memory is bound to paths and machines today**:
    - Claude Code auto memory lives at `~/.claude/projects/<project>/memory/`, with the project "derived from the git repository". "Auto memory is machine-local… not shared across machines or cloud environments." ([docs](https://code.claude.com/docs/en/memory))
    - Codex memories are per machine in `~/.codex/memories/`. ([docs](https://learn.chatgpt.com/docs/customization/memories?surface=app))
    - Pi stores sessions "grouped by working directory". (local `packages/coding-agent/docs/sessions.md`)
  - Steve Yegge built **Beads**, an issue graph used as agent memory, because agents "get dementia". This is memory keyed to *work items*, not sessions. ([GitHub](https://github.com/steveyegge/beads), [Medium](https://steve-yegge.medium.com/introducing-beads-a-coding-agent-memory-system-637d7d92514a))
- **`/goal` exists, but is scoped to one session or thread:**
  - **Codex**: CLI 0.128.0 (npm 2026-04-30): "Added persisted `/goal` workflows with app-server APIs, model tools, runtime continuation, and TUI controls for create, pause, resume, and clear". ([release](https://github.com/openai/codex/releases/tag/rust-v0.128.0)) Willison called it OpenAI's "own version of the Ralph loop". ([simonwillison.net](https://simonwillison.net/2026/Apr/30/codex-goals/))
    - Became non-experimental on 2026-05-21 across the app, IDE extension, and CLI. ([changelog](https://learn.chatgpt.com/docs/changelog))
    - Docs: "Give Codex a durable objective… keep working across turns toward a verifiable stopping condition". ([docs](https://learn.chatgpt.com/use-cases/follow-goals))
    - The *same* model checks its own completion through a hidden continuation prompt ("treat uncertainty as not achieved"). ([source template](https://github.com/openai/codex/blob/6014b6679ffbd92eeddffa3ad7b4402be6a7fefe/codex-rs/core/templates/goals/continuation.md))
    - Persisted per thread with an optional token budget [secondary implementation write-up]. ([gist](https://gist.github.com/patleeman/b1b5768393f9bf2f60865b1defeeb819))
  - **Claude Code**: v2.1.139 (npm 2026-05-11). ([CHANGELOG](https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md), [docs](https://code.claude.com/docs/en/goal))
    - "One goal can be active per session." It's "a wrapper around a session-scoped prompt-based Stop hook."
    - A separate small model (Haiku by default) judges met / not yet met / impossible after each turn.
    - The evaluator "doesn't run commands or read files independently", so it can only judge what the transcript shows.
    - Status shows the condition, elapsed time, turns, tokens, and the evaluator's latest reason.
  - **Antigravity CLI** v1.0.14 (2026-06-30) "removed the max limit for the /goal command". Its introduction date is UNVERIFIED. ([changelog](https://antigravity.google/docs/changelog))
  - **VS Code Copilot "Autopilot"** (1.111, 2026-03-09) runs until the agent calls `task_complete`. It became the default in 1.124. ([release notes](https://github.com/microsoft/vscode-docs/blob/main/release-notes/v1_111.md))
- **Auto-archive already exists, but per session:**
  - Claude Code desktop: "Auto-archive after PR merge or close". ([docs](https://code.claude.com/docs/en/desktop))
  - Codex: worktrees are cleaned up when a thread is archived [secondary].
- **Incumbents moving toward goal containers (Sep 2026):**
  - **Claude Code Projects** (public beta, 2026-09-17). ([docs](https://code.claude.com/docs/en/claude-projects), [MarkTechPost](https://www.marktechpost.com/2026/09/17/anthropic-launches-claude-code-projects-in-beta-parallel-cloud-sessions-that-keep-running-after-you-close-your-laptop/))
    - "A project is worth creating when the work has a goal that outlasts one session"
    - An optional **Goal** field: "one line of what you're trying to get done, such as 'Hold p95 API latency under 200 ms'"
    - Multi-repo ("One goal across many repositories")
    - **Project memory** (`MEMORY.md`, separate from machine-local auto memory)
    - An **Overview** pane grouping threads into ready for review / **Waiting on you** / working
    - "You don't manage context windows in a project"
  - **Cursor Projects** (2026-09-10): "Projects lets you take on larger bodies of work, such as a feature, a migration, or a full app. The coordinator agent… doesn't write code itself; it plans the work, delegates it to agents". It has shared context files and "Subscriptions". ([changelog](https://cursor.com/changelog))
  - **Factory Missions** (2026-02-26): goals, milestones, success criteria; orchestrator, worker, and validator droids [secondary]. ([continuumcode](https://continuumcode.ai/guides/what-is-factory-ai/))
- **Takeaway:**
  - The essay's Goal-as-sidebar idea is ahead of the market but no longer unique.
  - Claude Code Projects is the closest incumbent. It is still cloud/GitHub-bound, a conversation-shaped coordinator, Pro/Max only, and not the primary navigation.
  - **Differentiation has to come from:**
    1. Goals as *the* top-level object, local-first and engine-agnostic.
    2. Goal-scoped memory that is portable (not keyed to a path or machine).
    3. Evidence-backed completion with auto-archive tied to *verified* completion, not PR merge.

### Thesis 4: attention allocation. Diff review deserves a full view; multi-agent supervision needs every agent visible; Goal + Task + Changes are enough to supervise

**Verdict: the full-view diff and the attention claims are strongly supported. "Goal+Task+Changes is enough" is contested; it needs Validation evidence.**

- **Review is the bottleneck:**
  - **Faros AI**, 10k+ developers: PRs merged +98%, **PR review time +91%**, PR size +154%, bugs per developer +9%. ([Faros](https://www.faros.ai/blog/ai-software-engineering))
  - **Willison**: "the natural bottleneck on all of this is how fast I can review the results". ([simonwillison.net](https://simonwillison.net/2025/Oct/5/parallel-coding-agents/))
  - **OpenAI harness engineering**: the scarce resource is "human time and attention". ([OpenAI](https://openai.com/index/harness-engineering/), quoted via a [mirror](https://github.com/celesteanders/harness/blob/main/docs/research/260211_openai_harness_engineering_codex.md))
  - **HN on Cursor 3**:
    - "reviewing all the output is still the bottleneck". ([HN](https://news.ycombinator.com/item?id=47620387))
    - "When one has a diff, do you review it, and then another one comes in… That sounds absolutely exhausting". ([HN](https://news.ycombinator.com/item?id=47620325))
- **Full, re-organised diff views are praised:**
  - **Devin Review** (2026-01-21): "Code review tools today don't actually make it easier to read code." It groups related hunks logically, orders and explains them, and detects moved or copied code. ([Cognition](https://cognition.com/blog/devin-review))
  - **Geoffrey Litt**, `/explain-diff` for "literate diffs". ([geoffreylitt.com](https://www.geoffreylitt.com/2026/07/02/understanding-is-the-new-bottleneck))
  - **HN**: "A diff should say 'Function X now accepts null', not 'line 42 changed.'" ([HN](https://news.ycombinator.com/item?id=46619855))
  - Codex inline diff comments are praised: "No more referring to code by file name and line number". ([HN](https://news.ycombinator.com/item?id=46953474))
- **Limits on supervising many agents:**
  - **BCG/HBR**: self-reported productivity peaks at **three** simultaneous AI tools and falls after four. ([HBR](https://hbr.org/2026/03/when-using-ai-leads-to-brain-fry))
  - **Herbig**: "every additional stream is a context switch, and context switches are where judgment quietly degrades." ([rpherbig.com](https://www.rpherbig.com/2026/03/31/Where-AI-Fatigue-Actually-Comes-From.html))
  - **Louis Knight-Webb** (Vibe Kanban) contrasts "terminal maxing" with "focus maxing": "beyond the five-minute threshold, passive monitoring becomes untenable". ([write-up](https://www.sean-weldon.com/blog/2026-05-06-software-engineering-is-becoming-plan-and-review-louis-knight-webb-vibe-kanban))
  - **Zechner**: "Set yourself limits on how much code you let the clanker generate per day, in line with your ability to actually review the code." ([mariozechner.at](https://mariozechner.at/posts/2026-03-25-thoughts-on-slowing-the-fuck-down/))
- **Why Goal+Task+Changes alone isn't enough:**
  - Anthropic: agents "confidently prais[e] the work—even when… quality is obviously mediocre." ([Anthropic](https://www.anthropic.com/engineering/harness-design-long-running-apps))
  - Failure modes include declaring victory early and marking features done without e2e testing. ([Anthropic](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents))
  - An EMNLP 2026 study of 20,574 sessions found "inaccurate self-reporting" is a growing share of failures [secondary]. ([arXiv 2605.29442](https://arxiv.org/abs/2605.29442))
  - A Claude `/goal` critique: "A confident summary of broken work reads as 'fine'". ([MindStudio](https://www.mindstudio.ai/blog/claude-code-goal-command-verification))
  - **Conclusion:** supervision needs Goal + Task + Changes + **evidence-backed Validation** (test output, screenshots, recordings), plus a "Waiting on you" queue.

## A.2 Product survey

### OpenAI Codex (CLI, cloud, app; now inside ChatGPT desktop)

- **Timeline:**
  - **CLI**: Apr 2025 (UNVERIFIED this session).
  - **Cloud/web**: around May 2025; the earliest changelog entry I saw is 2025-05-19. GA 2025-10-06 (Slack, SDK, admin).
  - **Skills**: 2025-12-19.
  - **macOS app**: 2026-02-02. **Windows**: 2026-03-04.
  - **26.415** (2026-04-16): Chats with no project folder, thread automations, task sidebar, PR workflow, artifact viewer, Memories, SSH remotes.
  - **`/goal`**: 2026-04-30, GA 2026-05-21.
  - **Merged into the ChatGPT desktop app**: 2026-07-09 (PR Chat, inline review, accept/reject of patches). ([changelog](https://learn.chatgpt.com/docs/changelog), [OpenAI](https://openai.com/index/introducing-the-codex-app/))
- **Layout**: projects → threads | chat | review pane, plus a task sidebar.
- **Unit of work**: the thread (a goal attaches to a thread). Cloud work is a "task".
- **Multi-agent**: parallel threads; subagents with progress visibility (2026-06-22).
- **Progress display**: streamed transcript plus task sidebar. "Reduced unread notifications while an active goal continues running".
- **Review**: review pane with inline comments; Automations results land in a "review queue". ([VentureBeat](https://venturebeat.com/orchestration/openai-launches-a-codex-desktop-app-for-macos-to-run-multiple-ai-coding))
- **Isolation**: Local / Worktree / Cloud.
- **Memory**: AGENTS.md (as a "table of contents", per OpenAI's harness post) plus generated Memories.
- **Reception**:
  - Willison: "a solid app that provides a nice UI over the capabilities of the Codex CLI agent". ([simonwillison.net](https://simonwillison.net/2026/Feb/2/introducing-the-codex-app/))
  - Confusion when the app "deleted itself" during the move into ChatGPT. ([HN](https://news.ycombinator.com/item?id=48852295))

### Claude Code (CLI, web, desktop, Agent SDK)

- **Timeline** (versions from the [CHANGELOG](https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md); dates from npm):
  - todo list 0.2.93 (2025-04-30)
  - 2.0.0 (2025-09-29): `/rewind` checkpoints; SDK renamed **Claude Agent SDK**
  - Claude Code on the web (2025-10-20) ([Anthropic](https://anthropic.com/news/claude-code-on-the-web))
  - `&` sends a task to the web (2.0.45)
  - background agents (2.0.60)
  - **agent teams** research preview (2.1.32, 2026-02-05)
  - `--worktree` and subagent worktree isolation (2.1.49)
  - **auto memory** (2.1.59)
  - **desktop redesign** (2026-04-14) ([Thurrott](https://www.thurrott.com/a-i/anthropic/334911/anthropic-redesigns-claude-app-on-desktop-for-parallel-agents))
  - **`/goal` + agent view** (2.1.139, 2026-05-11)
  - **Projects** beta (2026-09-17)
- **Layout**: sidebar of sessions (filter by status, project, environment) with free-form panes. ([desktop docs](https://code.claude.com/docs/en/desktop))
- **CLI agent view**: groups background sessions as Needs input / Working / Completed. ([agent-view docs](https://code.claude.com/docs/en/agent-view))
- **Unit of work**: session. In Projects, a thread inside a project with a Goal.
- **Multi-agent**: five mechanisms (subagents, agent view, agent teams, dynamic workflows, Projects). ([docs](https://code.claude.com/docs/en/agents))
- **Progress display**: Normal / Thinking / Verbose transcript modes; peek; Overview pane.
- **Review**: diff with line comments, CI status bar, "Auto-fix CI", "Auto-merge when ready".
- **Isolation**: `.claude/worktrees/`; cloud sandboxes.
- **Memory**: CLAUDE.md (user-written), auto memory (machine-local, per repo), project memory (cloud Projects). ([memory docs](https://code.claude.com/docs/en/memory))
- **Reception**: Electron-quality complaints [secondary]. ([Daring Fireball](https://daringfireball.net/2026/07/claudes_criminally_bad_mac_app_is_an_inside_job)) Terminal loyalists remain [secondary]. ([VentureBeat](https://venturebeat.com/orchestration/we-tested-anthropics-redesigned-claude-code-desktop-app-and-routines-heres-what-enterprises-should-know))

### Cursor

- **Releases:**
  - **1.0** (2025-06-04): Bugbot, Background Agent GA, Memories beta. ([1.0](https://cursor.com/changelog/1-0))
  - **2.0** (2025-10-29): agents and plans sidebar; "up to eight agents in parallel on a single prompt" via worktrees or remote machines; Plan Mode; Composer model. ([2.0](https://cursor.com/changelog/2-0))
  - **2.2**: sending to-dos to new agents; multi-agent judging.
  - **2.4**: subagents and skills.
  - **3.0** (2026-04-02): **Agents Window** across local, worktree, cloud, and SSH; `/best-of-n`; grid layouts. ([3.0](https://cursor.com/changelog/3-0))
  - **3.1**: tiled layout. ([3.1](https://cursor.com/changelog/3-1))
  - **Projects** (2026-09-10): coordinator agent. ([changelog](https://cursor.com/changelog))
  - Graphite acquired 2025-12-19 (stacked PRs, Diamond reviewer). ([Cursor blog](https://cursor.com/blog/graphite), [TechCrunch](https://techcrunch.com/2025/12/19/cursor-continues-acquisition-spree-with-graphite-deal/))
- **Unit of work**: agent tab or chat, now Project.
- **Memory**: the Memories URL now serves the Rules page. Memories appear to be folded into Rules (date UNVERIFIED). ([docs](https://cursor.com/docs/context/memories))
- **Reception**: backlash at being forced into the agent layout.
  - Reddit "I hate the Agents Window": "code felt secondary" [secondary]. ([awaited.dev](https://awaited.dev/guides/cursor-agent-window-vs-editor/))
  - Cursor 3 HN: "looks like they're mimicking Notion". ([HN](https://news.ycombinator.com/item?id=47618084), [InfoQ](https://www.infoq.com/news/2026/04/cursor-3-agent-first-interface/))

### GitHub Copilot coding agent, Agent HQ, VS Code Agents window

- **Coding agent** GA 2025-09-25: runs on Actions and produces draft PRs. ([changelog](https://github.blog/changelog/2025-09-25-copilot-coding-agent-is-now-generally-available/))
- **Agent HQ + mission control** (Universe, 2025-10-28): "assign, steer, and track"; session logs next to Files changed; partner agents. ([GitHub blog](https://github.blog/news-insights/company-news/welcome-home-agents/), [changelog](https://github.blog/changelog/2025-10-28-a-mission-control-to-assign-steer-and-track-copilot-coding-agent-tasks/))
- **Claude and Codex agents on GitHub**: 2026-02-04 (Pro+ and Enterprise), 2026-02-26 (Business and Pro). ([changelog](https://github.blog/changelog/2026-02-04-claude-and-codex-are-now-available-in-public-preview-on-github/))
- **VS Code releases** ([release notes](https://github.com/microsoft/vscode-docs/tree/main/release-notes)):
  - 1.105: Agent Sessions view
  - 1.106: "Agent HQ… single view"
  - 1.120: Agents window in Stable
  - 1.129: agent host protocol running Copilot, Claude, and Codex harnesses
  - 1.141: session grid
  - 1.142: **Kanban canvases**
- **Artifacts panel**: plans and screenshots, grouped per subagent. ([artifacts docs](https://github.com/microsoft/vscode-docs/blob/main/docs/agents/run/artifacts.md))
- **Unit of work**: "A session is the unit of work… A chat is a conversation within that session". ([sessions docs](https://github.com/microsoft/vscode-docs/blob/main/docs/agents/concepts/sessions.md))
- **Memory**: user, repository, and session scopes. ([memory docs](https://github.com/microsoft/vscode-docs/blob/main/docs/agents/run/memory.md))

### Google Antigravity, Jules, Gemini CLI

- **Antigravity v1.11.2** (2025-11-18): Editor plus **Agent Manager** "to spawn, orchestrate, and observe multiple agents".
  - **Artifacts** (task lists, implementation plans, walkthroughs, screenshots, browser recordings) for "verification without reviewing raw logs".
  - Google-Docs-style comments on artifacts, which the agent takes in "without stopping its execution flow".
  - Knowledge base.
  - "the Inbox and side panel in the Agent Manager to be notified of progress".
  - ([Antigravity blog](https://antigravity.google/blog/introducing-google-antigravity), [Google Developers blog](https://developers.googleblog.com/en/build-with-google-antigravity-our-new-agentic-development-platform/), [changelog](https://antigravity.google/docs/changelog))
- **Antigravity 2.0** (2026-05-19): split into app, CLI, SDK, and IDE. Backlash covered in A.1.
- **Safety incidents**: "deleted the contents of whole drive" ([HN](https://news.ycombinator.com/item?id=46103532)); prompt-injection exfiltration ([HN](https://news.ycombinator.com/item?id=46048996)).
- **Jules** ([changelog](https://jules.google/docs/changelog/)):
  - Unit of work: a task with an approved plan, run in a VM, delivered as a PR.
  - GA 2025-08-06; Critic agent; memory (2025-09-30); Scheduled Tasks.
  - Last changelog entry 2026-03-09. Whether it was folded into Antigravity is UNVERIFIED.
- **Gemini CLI**: active, v0.65.0-preview. No `/goal` found (UNVERIFIED). ([GitHub](https://github.com/google-gemini/gemini-cli))

### Cognition: Windsurf → Devin Desktop; Devin

- **Devin 2.0** (2025-04-03): parallel Devins, each with a cloud IDE; Interactive Planning; Devin Wiki. ([Cognition](https://cognition.com/blog/devin-2))
- **Session sidebar**: grouped by status (Working / Ready / Blocked / Inactive). ([release notes](https://docs.devin.ai/release-notes/overview))
- **Memory**: Knowledge (now moving to Skills), DeepWiki, Playbooks.
- **Devin Review** (2026-01-21); autofix of review comments (Feb 2026). ([Cognition](https://cognition.com/blog/closing-the-agent-loop-devin-autofixes-review-comments))
- **Windsurf Wave 13** (Dec 2025): parallel Cascade sessions in worktrees. ([changelog](https://windsurf.com/changelog))
- **Devin Desktop** (2026-06-02):
  - The Agent Command Center is the default surface.
  - **Spaces** group sessions, PRs, and context.
  - ACP agents (Codex, Claude, OpenCode) run alongside Devin.
  - Devin Local replaces Cascade.
  - ([Cognition](https://cognition.com/blog/introducing-devin-desktop))
- **Dynamic Workflows** (2026-10-13): "The plan… lives in code instead of an agent's head" [secondary]. ([fourweekmba](https://fourweekmba.com/ai-factory-and-cognition-ship-rival-tools-to-run-agent-fleets/))
- **Earlier reception**: Answer.AI's 2025 trial of Devin 1.x scored 3/20 successes. ([Answer.AI](https://www.answer.ai/posts/2025-01-08-devin.html))

### Amp (Sourcegraph / ampcode)

- **Threads are first-class**: synced, shareable (unlisted / workspace / group / private), forkable, `/handoff` to a new thread "toward a new goal", and Amp can read other threads. ([manual](https://ampcode.com/manual/switch-from), [read-threads](https://ampcode.com/news/read-threads))
- **Agents**: Oracle (second-opinion model) and subagents that return only summaries. ([The Dial](https://ampcode.com/docs/the-dial))
- **Editor extensions killed** (announced Feb 2026; "self-destruct on March 5"). ([ampcode.com](https://ampcode.com/news/the-coding-agent-is-dead), [HN](https://news.ycombinator.com/item?id=47075232))
- **Orbs** (2026-06-30): remote VM per thread. ([ampcode.com](https://ampcode.com/news/agents-in-orbs))
- **TUI sidebar removed** (Aug 2026): "more threads than ever". ([ampcode.com](https://ampcode.com/news/so-long-tui-sidebar))
- **Oct 2026**: agents subscribe to their PR's comments and CI, so feedback flows into the thread [secondary]. ([releasebot](https://releasebot.io/updates/ampcode))
- **Review**: Agentic Review; "reviews don't map 1:1 to threads". ([ampcode.com](https://ampcode.com/news/agentic-code-review))

### Parallel-worktree desktop orchestrators ("Conductor class")

- **Conductor** (Melty Labs; Show HN Jul 2025): "Run parallel Claude Code, Codex, and Cursor agents in isolated workspaces on your Mac… review and merge".
  - Unit of work: the workspace (worktree, chat, terminal, diff).
  - Cloud and multiplayer details partly UNVERIFIED.
  - HN: "the bottleneck… is going to still be human review".
  - ([conductor.build](https://www.conductor.build/), [HN](https://news.ycombinator.com/item?id=44594584))
- **Sculptor** (Imbue): launched 2025-09-30 with Docker containers and Mutagen "Pairing Mode"; now worktrees with optional containers. **Pi is an experimental harness**; v0.48.0 on 2026-09-21. ([Imbue](https://imbue.com/blog/sculptor-announce), [GitHub](https://github.com/imbue-ai/sculptor), [HN](https://news.ycombinator.com/item?id=45427697))
- **Superset** (YC): runs "10 parallel coding agents" with worktrees, diff, browser, notifications. ([GitHub](https://github.com/superset-sh/superset), [HN](https://news.ycombinator.com/item?id=46368739))
- **Emdash** (YC W26): 25+ CLIs; ticket intake from Linear and Jira; lifecycle hooks for status; a pre-warmed worktree pool. ([GitHub](https://github.com/generalaction/emdash), [HN](https://news.ycombinator.com/item?id=47140322))
- **Others**:
  - Claude Squad (tmux TUI) ([GitHub](https://github.com/smtg-ai/claude-squad))
  - Opcode, formerly Claudia (2026 activity UNVERIFIED) ([GitHub](https://github.com/getAsterisk/claudia))
  - Mux by Coder (Plan/Exec modes) ([GitHub](https://github.com/coder/mux))
  - T3 Code (GA 2026-04-28 [secondary])
  - Polyscope (APFS copy-on-write clones; "Autopilot" turns a goal into user stories) ([docs](https://getpolyscope.com/docs))
  - Jean by coolLabs (supports Pi) ([jean.build](https://jean.build/))
- **Recurring complaints**:
  - "worktrees are not sandboxes" [secondary]. ([hysenlabs](https://hysenlabs.com/projects/superset-sh-superset))
  - "I didn't love the Git worktree flow… spawning lots of folders". ([HN](https://news.ycombinator.com/item?id=47307169))
  - Peter Steinberger, counterpoint: 3–8 agents "in the same folder" in a terminal grid, because it's fastest [secondary]. ([steipete.me](https://steipete.me/posts/just-talk-to-it))

### Kanban, task, and inbox products

- **Vibe Kanban** (Bloop): a board of issues, each card a worktree plus agent. About 28k stars. **Company shut down in April 2026** for business reasons: "the vast majority are free users and we couldn't find a business model". ([shutdown post](https://www.vibekanban.com/blog/shutdown), [GitHub](https://github.com/BloopAI/vibe-kanban))
- **Cline Kanban** (2026-03-26): "the bottleneck isn't the AI; it's you". Task dependency chaining, live diff with inline comments. ([Cline](https://cline.bot/blog/announcing-kanban))
- **Nimbalyst** (successor to Crystal): session kanban, markdown task files that double as memory, mobile approvals. ([GitHub](https://github.com/nimbalyst/nimbalyst), [Crystal deprecation](https://github.com/stravu/crystal))
- **Kilo Code Agent Manager**: a "multi-agent control room". ([docs](https://kilo.ai/docs/automate/agent-manager))
- **Linear for Agents**: Agent Session on an issue; typed activities. ([dev docs](https://linear.app/developers/agent-interaction), [coding sessions](https://linear.app/docs/coding-sessions))
- **LangChain Agent Inbox** (Jan 2025): notify / question / review interrupts; "ambient agents". ([LangChain](https://www.langchain.com/blog/introducing-ambient-agents))
- **Omnara** (YC S25): mobile and Watch command center with push notifications. Born from "waiting 5-10 minutes just to provide input". ([YC](https://www.ycombinator.com/launches/OCT-omnara-the-first-command-center-for-ai-agents-terminal-web-and-mobile), [HN](https://news.ycombinator.com/item?id=44878650))
- **Augment Intent** (beta, about Apr 2026): a "living spec" as "the source of truth for project goals, tasks, completed work, and decisions"; coordinator, implementors, and verifier; Spec and Changes tabs [secondary, mostly vendor]. ([Augment](https://www.augmentcode.com/guides/intent-walkthrough-prompt-to-merge)) **This is the closest existing match to the essay's field set.**

### Cloud and background platforms

- **Terragon**: shut down. "As of February 9th, 2026, the service has been shut down". Open-sourced. ([GitHub](https://github.com/terragon-labs/terragon-oss))
- **Factory**:
  - Desktop app (2026-04-08): sessions sidebar. ([Factory](https://factory.ai/news/factory-desktop))
  - **Missions** (Feb 2026): milestones, validators, Mission Control. Missions are explicitly "not fire-and-forget" [secondary]. ([X](https://x.com/FactoryAI/status/2027104899583066300))
  - Droid Computers: persistent machines.
- **OpenHands**:
  - Cloud UI: conversations, chat, action panel; Planning Mode writes PLAN.md. ([docs](https://docs.openhands.dev/openhands/usage/cloud/cloud-ui))
  - **Agent Canvas** (2026-06-16): self-hosted control center for any ACP agent, **including Pi**. ([OpenHands](https://www.openhands.dev/product/canvas))
- **Tembo**: runs Claude Code, Codex, Pi, and others in VMs, triggered from Slack, Linear, or Sentry. ([Tembo](https://www.tembo.io/agents))
- **Charlie Labs**: noted that most usage stayed 1 human : 1 agent. ([recap](https://charlielabs.ai/blog/charlie-2025-a-recap-and-whats-next/))

### Editors and terminals

- **Zed / ACP**:
  - ACP launched 2025-08-27; Claude Code via adapter 2025-09-03.
  - ACP is now used by JetBrains, Devin Desktop, OpenHands, Kiro Crew, Factory, and Nimbalyst.
  - **Consequence: a new GUI can host many agents through ACP.**
  - ([Zed](https://zed.dev/blog/bring-your-own-agent-to-zed), [ACP](https://zed.dev/acp))
- **Warp**:
  - 2.0 (2025-06-24): "Agentic Development Environment" with an Agent Management Panel (active / waiting / paused / errored). ([Warp](https://www.warp.dev/blog/reimagining-coding-agentic-development-environment))
  - Oz cloud orchestration (2026-02-10).
  - Open-sourced 2026-04-28.
  - Complaints: "a lot of people just wanted the terminal app". ([HN](https://news.ycombinator.com/item?id=47970940))
- **Kiro** (AWS):
  - Specs: requirements.md (EARS) → design.md → tasks.md. ([docs](https://kiro.dev/docs/specs/))
  - GA probably 2025-11-17 (sources conflict).
  - Kiro Crew orchestrator (2026-08-04) [secondary].
  - Critique: "way too verbose for the small bug I was asking it to fix". ([Böckeler](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html))

### Pi ecosystem

- **Pi itself**: a minimal TS agent with a system prompt plus tool definitions under 1k tokens; read/write/edit/bash; no sub-agents, plan mode, or todos by default; YOLO. ([Zechner](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/))
- **Repo moved** to `earendil-works/pi` after Zechner joined Earendil in Apr 2026 [secondary]. ([agent-wars](https://agent-wars.com/news/2026-04-08-zechner-pi-earendil)) Confirmed by the local checkout's git remote.
- **Pi 1.0** (2026-10-01): native MCP via Codemode, deferred tool loading, and **Pi Durable**, a crash-resistant harness for long-running agents. ([Earendil](https://earendil.com/posts/pi-1-0/))
  - The local repo contains `packages/durable`, `packages/mcp`, `packages/codemode`.
  - Durable "conversations, model turns, tool calls, and your own state are committed to storage before anything is shown. If the process dies mid-turn, reopening the storage picks the work up where it stopped." (local `packages/durable/README.md`)
- **Community GUIs**:
  - pi-gui (Electron: threads, worktrees, review) ([pi-gui.com](https://www.pi-gui.com/))
  - jmfederico/pi-web ([GitHub](https://github.com/jmfederico/pi-web))
- **Used as a harness** in Sculptor, Jean, Tembo, OpenHands Canvas, and **OpenClaw** (Pi is OpenClaw's agent loop). ([OpenClaw on Wikipedia](https://en.wikipedia.org/wiki/OpenClaw))
- **No official Pi GUI** exists, and no Goal-centric one.

## A.3 Comparison table

| Product (latest relevant date) | Layout paradigm | Unit of work | Goal primitive? | Multi-agent | Progress presentation | Review flow | Isolation | Memory model |
|---|---|---|---|---|---|---|---|---|
| Codex app / ChatGPT desktop (2026-07) | projects→threads sidebar · chat · review pane + task sidebar | thread (cloud: task) | `/goal` per thread, worker self-audits; token budget [secondary] | parallel threads, subagents, automations | stream + task sidebar (plans, artifacts, summaries) | inline diff comments, PR chat, review queue | local / worktree / cloud | AGENTS.md + generated per-machine memories |
| Claude Code desktop/CLI (2026-05) | sessions sidebar · panes (chat/diff/browser/terminal/plan/tasks/subagent) | session | `/goal` per session, separate evaluator model | subagents, agent teams, agent view, dynamic workflows | Normal/Thinking/Verbose modes; peek; Needs input/Working/Completed | diff + line comments, CI bar, auto-merge; auto-archive on PR merge | worktrees, cloud sandboxes | CLAUDE.md + machine-local auto memory per repo |
| Claude Code Projects (2026-09 beta) | project conversation + Overview pane | project → threads | optional one-line project Goal | parallel cloud threads | Overview: ready for review / waiting on you / working | per-thread PRs tab | cloud per thread (local via Remote Control) | project MEMORY.md + instructions, multi-repo |
| Cursor 3 + Projects (2026-09) | Agents Window grid/tiles; IDE kept | agent tab; Project | Project coordinator (no `/goal` found) | up to 8 parallel, best-of-n, coordinator delegation | stream; plans with Mermaid | diff view, Bugbot, Graphite | worktree / cloud / SSH | Rules (Memories folded in, date UNVERIFIED); project context files |
| GitHub Agent HQ + VS Code Agents window (2026-10) | mission control; sessions · chat · Changes; kanban canvases (1.142) | session / issue→PR | Autopilot (`task_complete`) | Copilot + Claude + Codex harnesses | session logs, artifacts panel | PR "Files changed", steer via comments | Actions VM / worktree | user / repo / session memory scopes |
| Antigravity (2025-11 → 2.0 2026-05) | Agent Manager + Inbox; Editor | task / conversation | `/goal` in CLI | many agents, subagent cards | **Artifacts** (plan, task list, walkthrough, recordings) | comment on artifacts | local (terminal sandbox) | knowledge base |
| Devin Desktop / Devin (2026-06) | Agent Command Center (kanban [secondary]) + IDE | session / Space | none found | Devin + ACP agents, local + cloud | status columns (Working/Ready/Blocked) | **Devin Review** (grouped, explained hunks) | cloud VMs / local | Knowledge→Skills, DeepWiki |
| Amp (2026-10) | native/web thread sidebar; TUI for local | thread | `/handoff` "toward a new goal" | subagents, oracle, orbs | stream; subagent summaries | Agentic Review, PR-comment subscriptions | orbs (remote VMs) | AGENTS.md + thread references |
| Conductor / Superset / Emdash / Sculptor / T3 | workspace sidebar · chat · diff | workspace (worktree) | none | N parallel CLIs | raw CLI stream (+status hooks) | diff, merge, PR | worktree (Sculptor: + containers) | inherits the CLI's memory |
| Vibe Kanban (sunset 2026-04) / Cline Kanban / Nimbalyst | kanban board + card pane | task card | none (cards ≈ tasks) | many CLIs, dependency chaining (Cline) | streamed log per card | inline diff comments, PR | worktree | markdown task files (Nimbalyst) |
| Linear agents | issue tracker | Agent Session on issue | issue acts as the goal | 3rd-party agents | typed activities (thought/action/elicitation/response/error) | draft PR | cloud sandbox | issue history |
| Factory (Missions) | sessions sidebar; Mission Control | session / mission | Mission (goals, milestones, success criteria) [secondary] | orchestrator / worker / validator | mission control view | PR | Droid Computers | persistent machine |
| Kiro | IDE + spec panes | spec → tasks | spec acts as the goal | Crew / subagents | task checklist | per-task checkpoints | local | `.kiro/` specs, steering files |
| Warp | terminal tabs + agent panel | agent conversation | none | Oz cloud agents | status badges | code review button | Docker (Oz) | Warp Drive |
| OpenHands Canvas | conversations + canvas | conversation / automation | none | any ACP agent incl. Pi | stream | — | worktree / Docker / cloud | — |
| Pi (engine) | TUI; RPC/SDK for custom UIs | session tree (JSONL) | compaction summary has a `## Goal` section | none built in (by design) | full stream; extension widgets/status | none built in | none (YOLO) | AGENTS.md context files + skills; sessions grouped by cwd |

---

# B. Agent-engineering viewpoints, 2025–2026

## B.1 Minimal harness: Pi and Mario Zechner

- **"What I learned building an opinionated and minimal coding agent"** (2025-11-30) ([mariozechner.at](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)):
  - "Context engineering is paramount."
  - System prompt plus tools under 1k tokens; four tools.
  - No MCP ("significant context overhead").
  - No sub-agents ("zero visibility").
  - No todos ("to-do lists generally confuse models more than they help").
  - Plans as files: PLAN.md "shared across sessions, and can be versioned".
  - YOLO; tmux instead of background bash.
  - He wants "a cleanly documented session format… and a simple way to build alternative UIs on top of the agent core."
- **"What if you don't need MCP at all?"** (2025-11-02): Playwright MCP takes 13.7k tokens, versus a 225-token README plus scripts. ([mariozechner.at](https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/))
- **"Thoughts on slowing the fuck down"** (2026-03-25): "Coding agents are sirens"; agents are "merchants of complexity"; cap daily generation to your review capacity; write "the gestalt of your system" by hand. ([mariozechner.at](https://mariozechner.at/posts/2026-03-25-thoughts-on-slowing-the-fuck-down/))
- **Armin Ronacher on Pi** (2026-01-31): "sessions in Pi are trees". He branches to fix tools without polluting the main context. "You ask the agent to extend itself" (his `/todos`, `/review` extensions). ([lucumr](https://lucumr.pocoo.org/2026/1/31/pi/))
- **Pi 1.0** (2026-10-01): reverses the earlier stance by adding native MCP through Codemode, and adds Pi Durable. ([Earendil](https://earendil.com/posts/pi-1-0/))

## B.2 Anthropic engineering

- **"Building effective agents"** (Dec 2024): workflows vs agents; "the simplest solution possible"; transparency ("explicitly showing the agent's planning steps"). ([Anthropic](https://www.anthropic.com/engineering/building-effective-agents))
- **Multi-agent research system** (2025-06-13): +90.2% on their research eval at roughly 15× the tokens. "most coding tasks involve fewer truly parallelizable tasks than research." ([Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system))
- **"Effective context engineering"** (2025-09-29): "attention budget", "context rot", "smallest possible set of high-signal tokens", just-in-time retrieval, compaction, structured note-taking, sub-agents. ([Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents))
- **Skills** (2025-10-16): progressive disclosure. ([Anthropic](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)) **Code execution with MCP** (2025-11-04): 150k → 2k tokens. ([Anthropic](https://www.anthropic.com/engineering/code-execution-with-mcp))
- **"Effective harnesses for long-running agents"** (2025-11-26) ([Anthropic](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)):
  - An initializer writes `init.sh`, `claude-progress.txt`, and a JSON feature list with every item marked failing.
  - The coding agent does "only one feature at a time".
  - Failure modes: premature victory; marking features done without e2e tests.
- **C compiler with 16 parallel Claudes** (2026-02-05) ([Anthropic](https://www.anthropic.com/engineering/building-c-compiler)):
  - Lock-file task claiming via git; no central orchestrator.
  - "the task verifier [must be] nearly perfect".
  - Agents keep READMEs and progress files.
- **Harness design for long-running apps** (2026-03-24) ([Anthropic](https://www.anthropic.com/engineering/harness-design-long-running-apps)):
  - Planner / generator / evaluator.
  - Self-evaluation "confidently prais[es] the work".
  - Context resets beat compaction ("context anxiety").
  - Scaffolding goes stale as models improve.
- **Managed Agents** (2026-04-08): "Harnesses encode assumptions that go stale as models improve". The session is "a context object that lives outside Claude's context window". ([Anthropic](https://www.anthropic.com/engineering/managed-agents))
- **Ralph plugin**: a Stop hook re-feeds the prompt; `--completion-promise` and `--max-iterations`. ([GitHub](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum))

## B.3 OpenAI

- **"Harness engineering"** (Ryan Lopopolo, 2026-02-11) ([OpenAI](https://openai.com/index/harness-engineering/), via a [mirror](https://github.com/celesteanders/harness/blob/main/docs/research/260211_openai_harness_engineering_codex.md) because the original returned 403):
  - "Humans steer. Agents execute."
  - AGENTS.md is "the table of contents" (about 100 lines).
  - "Plans are treated as first-class artifacts… versioned and co-located."
  - "anything it can't access in-context while running effectively doesn't exist."
  - "corrections are cheap, and waiting is expensive."
  - Single runs last 6+ hours; agent-to-agent review in a "Ralph Wiggum Loop".
- **ExecPlans / PLANS.md**: "work for more than seven hours from a single prompt". Living documents with **Progress, Surprises & Discoveries, Decision Log, Outcomes & Retrospective**. ([OpenAI cookbook](https://developers.openai.com/cookbook/articles/codex_exec_plans)) *These sections map almost one-to-one onto the essay's Task / Cause / Decision / Validation fields.*
- **"Unrolling the Codex agent loop"** (2026-01-23). ([OpenAI](https://openai.com/index/unrolling-the-codex-agent-loop/))
- **"A practical guide to building agents"** (2025): UNVERIFIED this session (fetch failed).

## B.4 Context engineering

- **Tobi Lütke**: "the art of providing all the context for the task to be plausibly solvable". ([philschmid](https://www.philschmid.de/context-engineering))
- **Lance Martin**: four strategies, **write / select / compress / isolate**. ([rlancemartin](https://rlancemartin.github.io/2025/06/23/context_engineering/))
- **Drew Breunig**: context poisoning, distraction, confusion, clash. ([dbreunig](https://www.dbreunig.com/2025/06/22/how-contexts-fail-and-how-to-fix-them.html))
- **Manus**: KV-cache hit rate is the key metric; "the file system as the ultimate context"; **todo.md recitation** keeps the plan in recent attention; keep the wrong turns in context. ([Manus](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus))
- **Tension**: Manus and Anthropic recite plans and progress files, while Zechner says todos confuse models. *Both sides agree that plan state belongs in visible files, not hidden harness state.*

## B.5 Long-horizon loops and goal-driven agents

- **METR**: the 50% time horizon has been doubling roughly every 7 months, faster on 2024–25 data. ([METR](https://metr.org/blog/2025-03-19-measuring-ai-ability-to-complete-long-tasks/))
- **Geoffrey Huntley, "Ralph"**: `while :; do cat PROMPT.md | claude-code ; done`; one item per loop; specs and tests as backpressure; "deterministically bad in an undeterministic world". ([ghuntley.com](https://ghuntley.com/ralph/))
- **Dex Horthy, 12-factor agents**: own your context window; unify execution and business state; launch/pause/resume; contact humans through tool calls; small, focused agents. ([GitHub](https://github.com/humanlayer/12-factor-agents))
- **Dex Horthy, "frequent intentional compaction"**: research → plan → implement at 40–60% context; "a bad line of a plan could lead to hundreds of bad lines of code"; review plans, not just code. ([GitHub](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/ace-fca.md))
- **The `/goal` family** (Codex, Claude Code, Antigravity CLI, Copilot Autopilot) turns Ralph into a product. The shared shape is **condition + check + constraints + budget**. They differ on *who judges*:
  - Codex: the worker audits itself.
  - Claude: a fresh evaluator reads the transcript only.

## B.6 Karpathy

- **Software 3.0** (YC, June 2025) ([Latent Space notes](https://www.latent.space/p/s3)):
  - "Autonomy Slider"; "Keep AI on tight leash"; "Iron Man Suit".
  - "In the Generation <-> verification cycle, we need a full workflow of partial autonomy"; "custom GUIs and autonomy sliders".
  - LLMs have "anterograde amnesia". "Decade of Agents".
  - The exact transcript wording is partly [secondary].
- **Dwarkesh interview** (Oct 2025): agents lack continual learning; on nanochat he preferred autocomplete. ([Dwarkesh](https://www.dwarkesh.com/p/andrej-karpathy))
- **2025 year in review**: "Claude Code emerged as the first convincing demonstration of what an LLM Agent looks like"; "Code is suddenly free, ephemeral, malleable, discardable"; "People actually dislike reading text". ([bearblog](https://karpathy.bearblog.dev/year-in-review-2025/))
- **"Never felt this much behind" X post** (Dec 2025): UNVERIFIED (X blocked).

## B.7 Simon Willison

- **Vibe engineering** (2025-10-07): professionals stay "proudly and confidently accountable". ([simonwillison.net](https://simonwillison.net/2025/Oct/7/vibe-engineering/))
- **Parallel agents** (2025-10-05): review is the bottleneck; he only parallelises research, proofs of concept, and low-stakes work. ([simonwillison.net](https://simonwillison.net/2025/Oct/5/parallel-coding-agents/))
- **Designing agentic loops** (2025-09-30): clear success criteria; sandboxes. ([simonwillison.net](https://simonwillison.net/2025/Sep/30/designing-agentic-loops/))
- **Lethal trifecta** (2025-06-16): private data + untrusted content + external communication. ([simonwillison.net](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/))
- **Async code research** (2025-11-06). ([simonwillison.net](https://simonwillison.net/2025/Nov/6/async-code-research/))
- **Proof that it works** (2025-12-18): "if you haven't seen the code do the right thing yourself, that code doesn't work". ([simonwillison.net](https://simonwillison.net/2025/Dec/18/code-proven-to-work/))

## B.8 Steve Yegge, Armin Ronacher, Cognition, swyx, Hamel

- **Steve Yegge**:
  - "Revenge of the junior developer": agent clusters, then fleets; developers become managers. ([Sourcegraph](https://sourcegraph.com/blog/revenge-of-the-junior-developer))
  - **Beads**: issue-graph memory. ([GitHub](https://github.com/steveyegge/beads))
  - **Gas Town**: Mayor, Polecats, Refinery merge queue, Witness for stuck agents, convoys of beads; "20-30 agents". ([GitHub](https://github.com/steveyegge/gastown)) The launch post's date and content are UNVERIFIED (403).
  - **"AI Vampire"**: one agent is always "done and waiting for you"; he proposes a 3–4 h AI workday [secondary]. ([O'Reilly](https://www.oreilly.com/radar/steve-yegge-wants-you-to-stop-looking-at-your-code/))
- **Armin Ronacher**:
  - "Agentic coding recommendations": "the dumbest possible thing that will work"; barely uses MCP. ([lucumr](https://lucumr.pocoo.org/2025/6/12/agentic-coding/))
  - "Agent design is still hard": sub-agents for failure isolation; evals are "the hardest problem". ([lucumr](https://lucumr.pocoo.org/2025/11/21/agents-are-hard/))
  - Skills vs MCP. ([lucumr](https://lucumr.pocoo.org/2025/12/13/skills-vs-mcp/))
- **Cognition, "Don't build multi-agents"** (Walden Yan, 2025-06-12): "Share context, and share full agent traces"; "Actions carry implicit decisions". ([Cognition](https://cognition.com/blog/dont-build-multi-agents))
  - **Emerging consensus**: a single loop by default; separate contexts only for (a) evaluation, (b) read-only exploration, and (c) truly independent tasks behind a strong verifier.
- **swyx, IMPACT** (Intent, Memory, Planning, Authority, Control flow, Tools): "editable plans"; Authority is the most overlooked element. ([Latent Space](https://www.latent.space/p/agent))
- **Hamel Husain**: "error analysis is the most important activity in evals"; look at 50–100 real traces; binary pass/fail; build custom viewers. ([hamel.dev](https://hamel.dev/blog/posts/evals-faq/))

## B.9 Spec-driven development

- **GitHub Spec Kit**: constitution → specify → plan → tasks → implement → converge. ([GitHub](https://github.com/github/spec-kit))
- **Kiro**: requirements / design / tasks, with "waves" of parallel tasks. ([Kiro](https://kiro.dev/docs/specs/))
- **Böckeler, "Understanding SDD"** (2025-10-15) ([martinfowler.com](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)):
  - Three levels: spec-first, spec-anchored, spec-as-source.
  - Critiques: oversized for small problems; tedious markdown review; agents ignore specs; echoes Model-Driven Development.
  - **Lesson: a Goal layer must cost almost nothing for small tasks.**
- **Tessl**: not checked (UNVERIFIED).

## B.10 Review as the bottleneck, and verification

- **Faros**: review time +91%, PR size +154%. ([Faros](https://www.faros.ai/blog/ai-software-engineering))
- **DORA 2025**: AI is "an amplifier". ([DORA](https://dora.dev/research/2025/dora-report/))
- **LinearB's "5.3× pickup wait"** for agentic PRs: UNVERIFIED (secondhand only). **CodeRabbit report figures**: UNVERIFIED (fetch blocked).
- **METR RCT** (Jul 2025): experienced OSS developers were **19% slower** with AI but believed they were 20% faster. ([METR](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/))
- **METR follow-up** (Feb 2026): results not significant; selection effects; "some developers used multiple AI agents simultaneously, making time measurements unreliable". METR now thinks a speedup is likely but can't size it. ([METR](https://metr.org/blog/2026-02-24-uplift-update/))
- Most AI-generated PRs get no human review [secondary]. ([arXiv 2605.02273](https://arxiv.org/html/2605.02273v1))

## B.11 Memory architectures

- **Claude memory tool**: client-side `/memories`; "ASSUME INTERRUPTION". ([docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool))
- **Claude Code**: auto memory is machine-local and keyed to the git repo; project memory in cloud Projects is separate. ([memory](https://code.claude.com/docs/en/memory), [projects](https://code.claude.com/docs/en/claude-projects))
- **Codex**: memories generated from idle chats, global per machine. ([docs](https://learn.chatgpt.com/docs/customization/memories?surface=app))
- **VS Code**: user / repository / session scopes. ([docs](https://github.com/microsoft/vscode-docs/blob/main/docs/agents/run/memory.md))
- **Devin**: Knowledge → Skills (org / enterprise / personal). ([docs](https://docs.devin.ai/release-notes/overview))
- **Beads and Nimbalyst**: memory as work items (issues, task files).
- **Letta, mem0**: not surveyed (UNVERIFIED).
- **Emerging taxonomy**:
  - **Project** memory: versioned in the repo (AGENTS.md as a table of contents, docs, plans).
  - **User** memory: global preferences.
  - **Episodic** memory: session logs or traces.
  - **Work-item** memory: issues, goals, missions. *This is the layer nobody owns in a local-first way.*

---

# C. Prior art, what worked and failed, user complaints

## C.1 Goal and task boards

| Prior art | What worked | What failed / complaints |
|---|---|---|
| Vibe Kanban | ~28k stars, ~30k MAU [secondary]; card = worktree + agent; diff commenting; "plan and review" framing | No business model: users paid ~$30 to drive ~$3,000 of agent spend. Company shut down Apr 2026 ([shutdown](https://www.vibekanban.com/blog/shutdown), [talk write-up](https://www.sean-weldon.com/blog/2026-05-06-software-engineering-is-becoming-plan-and-review-louis-knight-webb-vibe-kanban)). Worktree folder sprawl ([HN](https://news.ycombinator.com/item?id=47307169)); telemetry backlash ([HN](https://news.ycombinator.com/item?id=44533004)) |
| GitHub Agent HQ mission control | Issue/PR as the unit; works across surfaces | Explicitly conservative ("work the way you already work") |
| Antigravity Agent Manager | Artifacts at the task level; Inbox "genuinely a great idea" [secondary] ([dev.to](https://dev.to/fabianfrankwerner/an-honest-review-of-google-antigravity-4g6f)) | "frustrating… mess"; 2.0 removed the IDE ("bait and switch"); safety incidents |
| Linear Agent Sessions | Typed activities, human stays accountable ("An agent cannot be held accountable") ([AIG](https://linear.app/developers/aig)) | Tied to Linear; coding happens elsewhere |
| Kiro specs | Structure for larger features | Ceremony on small tasks ("12+ tasks with 4+ sub-tasks each", [HN](https://news.ycombinator.com/item?id=46554344)); Kiro responded with Quick Spec ([Kiro](https://kiro.dev/blog/faster-smarter-specs/)) |
| Gas Town / Beads | The Mayor as a single interface removes per-agent bookkeeping ([Appleton](https://maggieappleton.com/gastown)) | "If babysitting 30 claude agents is the future… I want zero part of it" ([HN](https://news.ycombinator.com/item?id=46458936)) |
| Factory Missions, Augment Intent, Claude/Cursor Projects | Goal → milestones/tasks → validators; living spec of goals, tasks, decisions | Too new for independent evidence (Augment admits this); mostly cloud-bound |

## C.2 Inbox and attention routing

- **LangChain ambient agents and Agent Inbox**: notify / question / review. Critique of chat: users must "initiate the conversation" and "you can only have one conversation at a time". ([LangChain](https://www.langchain.com/blog/introducing-ambient-agents))
- **Status grouping is now common**:
  - Claude agent view (Needs input / Working / Completed); Claude Projects "Waiting on you"
  - Devin sidebar (Working / Ready / Blocked)
  - Warp panel (active / waiting / paused / errored)
  - Linear states
- **Notification complaints**:
  - Omnara: missing Android notifications; raw XML tool calls on mobile [secondary].
  - The Codex changelog *reduced* notifications during goal runs, which acknowledges notification fatigue.
  - Claude `/goal` checks in after stalls (30 min, 1 h, then every 2 h). ([CHANGELOG](https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md))

## C.3 Diff-first review

- **Devin Review**: grouped, ordered, explained hunks; moved-code detection. ([Cognition](https://cognition.com/blog/devin-review))
- **Graphite** (now Cursor): stacked PRs plus an AI reviewer.
- **Ink & Switch Patchwork**: AI edits on branches with highlighted diffs plus rationale. ([Ink & Switch](https://www.inkandswitch.com/patchwork/notebook/2024-version-control/07/))
- **Litt**: "literate diffs"; quizzes as "a speed regulator". ([geoffreylitt.com](https://www.geoffreylitt.com/2026/07/02/understanding-is-the-new-bottleneck))
- **jj workflows**: curate agent output into small stacks with an INTENTS file per change [secondary]. ([ianbull.com](https://ianbull.com/posts/jj-vibes/))
- **HN**: "When AI generates 5,000 lines of refactoring in 30 seconds, linear reading becomes a bottleneck". ([HN](https://news.ycombinator.com/item?id=46619855))
- **Social friction**: reviewers become "continuously trained" to avoid a prolific AI-using coworker's PRs. ([HN](https://news.ycombinator.com/item?id=48498265))

## C.4 User complaints by theme

- **Stream noise vs opacity**: both directions are criticised.
  - Too noisy: "A wall of noise that tells you nothing of any substance" (early Copilot PRs). ([HN](https://news.ycombinator.com/item?id=44042425))
  - Too opaque: the Claude Code collapse revolt (A.1).
- **Babysitting and fatigue**:
  - "I was working harder to manage the tools than to actually solve the problem". ([HBR](https://hbr.org/2026/03/when-using-ai-leads-to-brain-fry))
  - Yegge's "AI Vampire".
  - "The context switching is hell". ([HN](https://news.ycombinator.com/item?id=47642895))
  - "mentally burnt-out after… speed-running review of small PRs". ([HN](https://news.ycombinator.com/item?id=47619981))
- **Session sprawl**: Willison's lost feature; Muster; Amp's "more threads than ever".
- **Forced paradigm shifts**: Cursor 2.0/3, Antigravity 2.0, Codex folded into ChatGPT, Warp "bloat". ([issue #8629](https://github.com/warpdotdev/warp/issues/8629))
- **Terminal vs GUI**: no consensus.
  - "the interface isn't a meaningful part of it". ([HN](https://news.ycombinator.com/item?id=45115303))
  - "Claude Code for parallel, Cursor for focus mode" [secondary]. ([HN](https://news.ycombinator.com/item?id=47160338))
  - Desktop wins on concurrency visibility and diff review; the terminal wins on scripting [secondary].
- **Productivity doubts**: METR (B.10); Answer.AI on Devin; Kiro "hours and hours". ([issue #11279](https://github.com/kirodotdev/Kiro/issues/11279))

## C.5 Essays against chat as the interface

- **Amelia Wattenberger**: "Text inputs have no affordances". ([wattenberger.com](https://wattenberger.com/thoughts/boo-chatbots))
- **Linus Lee**: "Conversations are a bad way to keep track of information". ([thesephist.com](https://thesephist.com/posts/latent/))
- **Julian Lehr (Linear)**: "Natural language might be natural, but it's a bottleneck"; "We are significantly faster at receiving data… than sending it". ([substack](https://julianlehr.substack.com/p/the-case-against-conversational-interfaces))
- **Geoffrey Litt**: "Enough AI copilots! We need AI HUDs". ([via Willison](https://simonwillison.net/2025/Jul/27/enough-ai-copilots-we-need-ai-huds/))
- **Maggie Appleton**: "Thicker Interfaces" (visual plans, state machines, timelines). ([maggieappleton.com](https://maggieappleton.com/planning-agents))
- **Karpathy**: the LLM "GUI" hasn't been invented; custom GUIs for the generation–verification loop (Software 3.0).
- **"Goal" as navigation**: "The /goal command is the most important agent primitive of 2026" [secondary]. ([Medium](https://medium.com/@vasu7yadav/the-goal-command-is-the-most-important-agent-primitive-of-2026-1ef4188448b1)) **I found no essay or product that makes Goal the top-level *navigation* object replacing the session list.**

---

# D. Gaps a new product could own

1. **Goals as the top-level, local-first, engine-agnostic object.**
   - Every `/goal` is scoped to one session or thread.
   - The two goal containers (Claude Code Projects, Cursor Projects) are cloud- and GitHub-centric, conversation-shaped, and vendor-locked.
   - Missing: a Goal that owns many sessions, branches, worktrees, and even repos; outlives them; and is the primary sidebar.
2. **Evidence-backed Validation, judged separately.**
   - Codex self-audits; Claude's evaluator reads only the transcript.
   - Only cloud products have verifier roles at all (Factory Missions' validator droids and Augment Intent's verifier, both [secondary]). No local-first GUI runs an independent verifier that *executes* checks (tests, build, screenshot diff) and attaches the artifacts to the Goal as its record.
   - Supported by Anthropic's evaluator-vs-generator work, Willison's "proof that it works", and the EMNLP self-report finding.
   - A Goal should not auto-archive on "agent says done" or "PR merged". It should auto-archive on **verified** completion, with the evidence kept as the archive record.
3. **Structured state derived from the trace, without hiding the trace.**
   - The market swings between raw streams and opaque collapse.
   - Gap: a "live current line" that keeps steerable details (file, command, failing test), plus Goal / Task / Cause / Decision / Changes / Validation fields **derived from the session**, each linking back to the exact trace entries.
   - Pi already emits Goal / Progress / Key Decisions / Next Steps / Critical Context in compaction and branch summaries (Appendix P).
   - OpenAI's ExecPlan sections (Progress, Surprises, Decision Log, Outcomes) are the same idea as a file.
4. **Goal-scoped, portable memory.**
   - Today memory is per machine and per path (Claude auto memory, Codex memories, Pi sessions grouped by cwd).
   - Cloud project memory exists only inside Claude Projects.
   - Gap: a memory layer keyed to Goals and work items (like Beads), stored in a versioned file that travels across machines, worktrees, and engines, with clear project / user / episodic tiers.
5. **Review as a first-class full-screen mode organised by intent.**
   - Devin Review shows the way (grouped, explained hunks), but it lives outside the agent GUIs.
   - Nobody ties the diff to Goal / Task / Decision ("this hunk exists because of decision X, verified by test Y").
   - Nobody rate-limits generation to review capacity, as Zechner suggests.
6. **Attention budgeting for multi-agent work.**
   - Evidence says self-reported productivity peaks at about 3 concurrent streams, and "focus maxing" beats "terminal maxing".
   - No product schedules *the human*: batching review, a WIP limit on goals awaiting review, "next best thing to look at" ordering.
   - Status grouping exists; prioritisation by impact, risk, or blocking does not.
7. **A cheap Goal for small tasks.**
   - Spec-driven tools die of ceremony (Kiro, Spec Kit critiques).
   - A Goal must cost one line ("fix flaky test X; done when `npm test` passes 5×"), with structure growing only as needed.
8. **Pi-specific opening.**
   - Pi has no official GUI. Its owners want "a simple way to build alternative UIs on top of the agent core".
   - It exposes a session *tree* (branch/fork/clone/tree), an RPC mode with steer and follow-up queues, extension UI hooks (`setStatus`, `setWidget`, `notify`), and now Pi Durable (crash-resumable, multi-client steering).
   - No current GUI maps Goals onto the branch tree. Attempts and alternatives as branches, with branch summaries when an attempt is abandoned, is a natural fit nobody has built.
   - Respect Pi's culture: observability over hidden sub-agents; plans as files; YOLO, so **the GUI must own sandboxing and lethal-trifecta warnings**.
9. **Business-model caution.** Vibe Kanban (shut down), Terragon (shut down), Crystal (folded), and Bloop's 1:100 value capture show that thin orchestration layers over other vendors' CLIs struggle to make money. Vendors are absorbing the layer (Claude Code and Cursor Projects; Emdash's "category risk"). ([startuphub](https://www.startuphub.ai/ai-news/claudes-corner/2026/claudes-corner-emdash-yc-w2026)) A defensible position needs the Goal / Validation / Memory layer to be something the engine vendors structurally won't build: local-first, multi-engine, owned by the user.

---

## Appendix P: Pi engine facts relevant to the GUI (from the local repo, HEAD b06c1f2, 2026-10-14)

- **Repo**: `github.com/earendil-works/pi`. Packages include `agent`, `ai`, `coding-agent`, `tui`, `durable`, `mcp`, `codemode`, `chord`, `evals`, `telemetry`.
- **README**: "Pi ships with powerful defaults but skips features like sub-agents and plan mode. Ask Pi to build what you want, or install a package that does it your way." (`README.md`)
- **Sessions** (`packages/coding-agent/docs/how-pi-works.md`, `sessions.md`):
  - JSONL tree; every entry has an id and a parent.
  - `/tree` (navigate within a session), `/fork` (new session from an earlier message), `/clone`.
  - Branch summaries when leaving a branch.
  - Stored under `~/.pi/agent/sessions/`, **grouped by working directory**.
  - `--continue` opens "the most recent session for the current working directory".
- **Compaction and branch-summary format** (`docs/compaction.md`): `## Goal`, `## Constraints & Preferences`, `## Progress` (Done / In Progress / Blocked), `## Key Decisions` (decision + rationale), `## Next Steps`, `## Critical Context`, plus `<read-files>` and `<modified-files>`. *This is very close to the essay's Goal / Task / Cause / Decision / Changes set, and is a ready-made data source for the GUI's state fields.*
- **RPC mode** (`docs/rpc.md`, `rpc-commands.md`):
  - JSONL over stdio.
  - Commands: `prompt`, `steer` (delivered after the current turn's tool calls), `follow_up` (after the agent stops), `abort`, `get_state`, `get_tree`, `get_entries`, `fork`, `clone`, `switch_session`, `compact`, `bash`, `get_session_stats`, `export_html`.
  - Extension UI subprotocol: dialogs `select` / `confirm` / `input` / `editor`; fire-and-forget `notify` / `setStatus` / `setWidget` / `setTitle`. (`docs/rpc-extension-ui.md`)
- **Pi Durable** (`packages/durable/README.md`, experimental): state committed to storage before display; resume after a crash; SQLite or in-memory storage.

---

## Items marked UNVERIFIED (consolidated)

- Codex CLI (Apr 2025) and Codex cloud (May 2025) launch dates. Codex goal state names and token-budget details are only in secondary sources; the official docs don't state goal scope.
- When the Antigravity CLI `/goal` was introduced. The full Antigravity "Inbox" feature set beyond the launch-blog sentence. Whether Jules was folded into Antigravity 2.0.
- When Cursor Memories was folded into Rules. Cursor 3.7–3.11 details.
- Devin Desktop's kanban columns and "Agent Router". Cascade end-of-life date (sources conflict).
- Conductor's cloud and multiplayer features. Opcode's 2026 activity. Mux rename. Which "Chorus" or "Codeflow" was meant.
- Karpathy's Dec 2025 "never felt this much behind" post. Exact Software 3.0 transcript wording.
- OpenAI "A practical guide to building agents" content. Gas Town launch-post date and content. Tessl. Letta and mem0 specifics.
- LinearB 5.3× and CodeRabbit statistics. The May 2026 "1.4–2× output" survey.
- Reddit and X quotes, all of which come via third-party write-ups.
