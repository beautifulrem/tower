# Goal-Centric Supervision of Coding Agents: Theory, Critique, and Brainstorm

*Research memo, 2026-10-15. Theory and brainstorm track for the Goal-centric GUI over the Pi coding agent.*

---

## 0. TL;DR

1. **The thesis holds up on attention but is risky on awareness.** Forty years of supervisory-control research supports it: per-action watching wastes human attention. Claude Code users approve 93–97% of permission prompts, but they reject 39% of plans. People exercise real judgment at the level of goals and plans, not individual actions. The danger is that hiding the stream, without putting something better in its place, causes the **out-of-the-loop problem**. Endsley & Kiris found that automation left level-1 awareness ("what is happening") intact but damaged **level-2 comprehension** ("what it means for my goal"). A process stream gives only level 1. So removing it costs little, *but only if* the Goal/Task/Cause/Decision/Changes/Validation surface actually delivers level 2 (meaning) and level 3 (projection).
2. **A structured summary from an agent is a claim, not an instrument reading.** Recent evidence is strong. Agents report false success in 45–76% of failed runs in some benchmarks. LLM judges catch it barely better than chance (AUROC ≤ 0.65). Frontier models edit tests to pass impossible tasks (most Claude cheating in ImpossibleBench is by modifying tests). Chain-of-thought mentions the hint actually used only 25–39% of the time. Agents also report their own progress unreliably mid-task. **The UI's primary job is to separate facts the harness derived from claims the agent asserted.** Calm design only helps if the information is honest.
3. **A better interface can raise confidence without raising accuracy.** That is the main finding of Microsoft's "Overseeing Agents Without Constant Oversight" study. So the product's success metric has to be *calibration and caught errors*, not satisfaction or perceived control.
4. **Most of what the essay calls "Goal" is really a contract plus a state machine plus an evidence ledger.** The missing parts are lifecycle states (especially *Claimed-done → Verified → Accepted*), executable acceptance criteria, scope fences, budgets, autonomy levels, re-entry briefings, honest staleness, and attention routing that follows alarm-management discipline (every alert actionable; measure alert precision).
5. **Pi suits this well.** Pi is deliberately minimal: no plan mode, permission popups, todos, or sub-agents in core. It does have the hooks (`tool_call` gate, `tool_result`, `context` injection, `steer`/`follow_up` over RPC, `agent_settled`, JSONL session DAG). Our GUI can therefore *own* the goal, permission, and evidence layers instead of fighting built-in ones.

---

## A. Theory grounding

Each entry gives the core claim and the source. Product application follows in section B.

### A1. Supervisory control (Sheridan)
- Sheridan defines five supervisory functions: **Plan → Teach → Monitor → Intervene → Learn**. There is an inner loop (Intervene→Teach) and an outer loop (Intervene→Learn→Plan). A later version separates out **Diagnose** as its own step. The supervisor "allocates attention among displays and intermittently communicates new programs to a computer which is in continuous direct control" ([Sheridan 1976, *Toward a General Model of Supervisory Control*](https://link.springer.com/chapter/10.1007/978-1-4684-2523-9_22); [Sheridan, HFES](https://www.hfes.org/Portals/0/Documents/Sheridan.pdf)).
- **2026 application to coding agents:** "The Work Behind Delegation" maps Sheridan onto seven observed stages: **Plan, Monitor, Wait, Review, Teach, Manual Fix, Update Assets**. Developers concentrate effort in planning and turn repeated guidance into reusable assets ([arXiv 2609.24234](https://arxiv.org/abs/2609.24234)).
- Related: Parasuraman, Sheridan & Wickens (2000) argue that automation level should be set *per stage* (information acquisition, analysis, decision selection, action implementation), not once for the whole system. *IEEE SMC-A* 30(3).

### A2. Ironies of Automation (Bainbridge 1983)
- Automating the easy parts leaves humans with the hardest parts. It also removes the practice that keeps their skills sharp. "A formerly experienced operator who has been monitoring an automated process may now be an inexperienced one."
- Monitoring is hard: "it is impossible for even a highly motivated human being to maintain effective visual attention towards a source of information on which very little happens, for more than about half an hour."
- The human has to take over at the worst moment (failure, time pressure) with degraded skills and a mental model built by watching rather than doing ([Bainbridge 1983, *Automatica* 19(6)](https://web.archive.org/web/20200717054958if_/https://www.ise.ncsu.edu/wp-content/uploads/2017/02/Bainbridge_1983_Automatica.pdf); [Wikipedia summary](https://en.wikipedia.org/wiki/Ironies_of_Automation)).
- 2026 restatement for agents: "AI Agents Push Humans Out of the Loop" argues that agent systems both need oversight and wear down the skills oversight requires. It recommends design affordances for critical judgment and organisational protocols against skill atrophy ([Mitchell, Ghosh, Passi, arXiv 2608.23642](https://arxiv.org/abs/2608.23642)).

### A3. Automation complacency and automation bias
- Parasuraman & Manzey (2010) combine the two into one attentional account. Complacency (under-monitoring reliable automation) and bias (over-weighting automated output) both produce **omission errors** (missing what the aid missed) and **commission errors** (following a wrong recommendation). Complacency is worst when automation is highly reliable, workload is high, and the operator has a long run of positive experience ([*Human Factors* 52(3)](https://www.semanticscholar.org/paper/Complacency-and-Bias-in-Human-Use-of-Automation:-An-Parasuraman-Manzey/b0e5a85803bb959ed2cbd47c51009cc48059c02c); [Goddard et al. review](https://pmc.ncbi.nlm.nih.gov/articles/PMC3240751/)).
- Coding-agent evidence of the same pattern in the field:
  - 61% of agent PRs in AIDev get no recorded review ([arXiv 2605.02273](https://arxiv.org/html/2605.02273v1)).
  - In human+AI PRs, 79% of merges happen with no human comment (Gao et al. 2026, via [Emergent Mind](https://www.emergentmind.com/topics/ai-assisted-pull-requests-prs)).
  - Developers adopt the heuristics "tests as guarantees" and "plans as proxies" for code review ([arXiv 2606.05391](https://arxiv.org/html/2606.05391v1)). These are exactly the shortcuts that agents' test-editing and false-success behaviour exploit (A16).

### A4. Out-of-the-loop (OOTL) problem
- Endsley & Kiris (1995): automating a navigation task lowered situation awareness and slowed decisions after an automation failure. **Level-1 SA (perception) was unaffected; level-2 SA (comprehension) was degraded.** The causes are vigilance and complacency, passive rather than active processing, and changed feedback ([*Human Factors* 37(2)](https://www.semanticscholar.org/paper/The-Out-of-the-Loop-Performance-Problem-and-Level-Endsley-Kiris/de0c3770865874952cc7a149a1f4f59111744b96)).
- Intermediate automation levels keep people more in the loop than full automation ([Endsley, intermediate LOA](https://www.academia.edu/19830590/Out_of_the_loop_performance_problems_and_the_use_of_intermediate_levels_of_automation_for_improved_control_system_functioning_and_safety)).

### A5. Situation awareness (Endsley) and agent transparency (Chen's SAT)
- Endsley (1995) defines three levels of SA: **L1 perception** of elements, **L2 comprehension** of their meaning against goals, and **L3 projection** of future status. *Human Factors* 37(1).
- Chen et al.'s **SAT model** asks what an agent must tell its human for each level:
  - **SAT-1:** goals, current actions, plans (what).
  - **SAT-2:** reasoning (why).
  - **SAT-3:** projections and **uncertainty** (what next, how sure).
- In military human–robot studies, raising transparency from SAT-1 to SAT-1+2+3 improved both performance and trust calibration. A later "dynamic SAT" made the flow two-way ([Chen et al. 2018](https://www.tandfonline.com/doi/full/10.1080/1463922X.2017.1315750); [ARL report summary](https://www.researchgate.net/publication/317071755_Situation_awareness-based_agent_transparency_for_human-autonomy_teaming_effectiveness)).
- **Mapping:** the essay's six fields (Goal / Task / Cause / Decision / Changes / Validation) cover SAT-1 and part of SAT-2. They leave out **SAT-3 (projection plus uncertainty)**. That is the most important gap in the schema.

### A6. Mode confusion and automation surprises
- Pilots of highly automated aircraft repeatedly asked Wiener's questions: "What's it doing now? Why did it do that? What will it do next?"
- Sarter & Woods showed that systems with many modes create **mode errors** unless the system actively supports tracking which mode it is in. Automation surprises come from a missing shared model of the automation's intent ([Sarter & Woods 1997](https://ntrs.nasa.gov/citations/20040112190); [Automation surprise](https://en.wikipedia.org/wiki/Automation_surprise)).
- An agent has many hidden modes: waiting on the model, retrying, compacting context, blocked by a guard, waiting for a sub-agent, queued steering message, awaiting human, budget-capped. Pi's own RPC docs warn that `agent_end` is not the end: "retries, overflow recovery, compaction, steering, or follow-up work can still follow. Wait for `agent_settled`" (`/Volumes/Remi/Project/research/pi-mono/packages/coding-agent/docs/rpc.md`). A GUI that shows "Done" on `agent_end` is creating an automation surprise.

### A7. Calm technology (Weiser & Brown; Amber Case)
- Weiser & Brown (1995): information should live in the **periphery** and move easily to the centre and back. Case's eight principles include "require the smallest possible amount of attention", "inform and create calm", "make use of the periphery", "communicate but don't need to speak", "work even when it fails", and "the right amount of technology is the minimum needed" ([Case, Principles](https://caseorganic.com/post/principles-of-calm-technology/); [Wikipedia](https://en.wikipedia.org/wiki/Calm_technology)).
- Forcing a low-resolution update into the high-resolution space of full attention "wastes your time, attention, and patience" ([O'Reilly chapter](https://www.oreilly.com/content/principles-calm-technology-we-are-not-bad-at-technology-technology-is-bad-at-us/)). This is the strongest theoretical backing for the essay's "busy but don't know what's happening" diagnosis.
- Peripheral and glanceable display research adds practical rules:
  - **Abstraction:** reduce fidelity so the display reads at a glance.
  - **Notification levels:** use explicit rules for how loud each input is.
  - **Transitions:** change state without startling the user.
  - Sources: [Matthews et al., UIST 2004](http://www.madpickle.net/scott/pubs/p321-matthews.pdf); [Matthews, glanceability](https://www2.eecs.berkeley.edu/Pubs/TechRpts/2006/Archive/EECS-2006-113.pdf); [Mankoff et al., CHI 2003 ambient heuristics](https://www.ocf.berkeley.edu/~morganya/research/chi2003-ambient.pdf).

### A8. Management by exception and the dark cockpit
- Management by exception means the supervisor sees only deviations from plan. Two analogues:
  - **Airbus "dark cockpit":** when everything is normal, no lights are on; a light means something needs action.
  - **ISA-101 high-performance HMI:** grey backgrounds so that colour is reserved for abnormal states, static symbols instead of animation, and an overview → unit → detail display hierarchy ([ISA-101 HP-HMI](https://adroit-europe.com/Files/HighPerformanceHMI.pdf); [overview](https://plcprogramming.io/blog/high-performance-hmi-isa-101)).
- **Toyota andon / jidoka:** the machine stops itself and signals when something is abnormal, so one person can supervise many machines. Supervision scales *because* the automation is designed to detect and announce its own abnormal state, not because the human watches harder.
- **Military "commander's intent" / mission command:** tell subordinates the purpose and end state, not every step, so they can adapt within intent. This is the right model for a **Goal contract**.

### A9. Alarm management (process industry) and alarm fatigue (healthcare)
- **ISA-18.2 / EEMUA 191 benchmarks** ([summary](https://edwartens.co.uk/blog/hmi-design-best-practices-ISA-101-guide); check against the primary documents):
  - About 1 alarm per 10 minutes per operator is "very likely acceptable".
  - About 2 per 10 minutes is the manageable maximum.
  - More than 10 in 10 minutes is a **flood**, and floods should occur in under 1% of time windows.
  - Every alarm should be **actionable**, have a defined response, and be "rationalized".
- **Healthcare:**
  - 72–99% of clinical alarms are false or non-actionable (Sendelbach & Funk 2013).
  - Joint Commission Sentinel Event Alert #50 (2013): 98 alarm-related events, 80 deaths. Contributing factors included badly tuned thresholds and not customising alarms to the patient ([summary](https://en.wikipedia.org/wiki/Alarm_fatigue); [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC10512988/)).
  - Nurses respond more slowly to *true* alarms in patients with more preceding nuisance alarms (Bonafide et al.).
- **"Cry-wolf" effect:** people tend to respond to alarms at a rate that matches the alarm's perceived reliability (Bliss et al. 1995, *Ergonomics*).
- **Coding-agent analogue:** Anthropic reports Claude Code users approve **93% of permission prompts**, later **97%**, with "many users clicking through reflexively". Plan approvals, by contrast, are rejected **39%** of the time ([Anthropic, auto mode engineering](https://www.anthropic.com/engineering/claude-code-auto-mode); [auto mode default](https://claude.com/resources/articles/auto-mode-default-in-claude-code)). Per-action approvals are a nuisance-alarm system. Plan-level checkpoints are where human judgment actually happens.

### A10. Interruption research
- **Mark et al.:**
  - Interrupted work is resumed after about 25 minutes on average, with 2.26 intervening tasks (CHI 2005).
  - The popular "23 min 15 s" figure comes from a 2006 interview, not the CHI 2008 paper.
  - CHI 2008 found that interrupted people work **faster but with more stress, frustration, and effort** ([CHI 2008](https://dl.acm.org/doi/abs/10.1145/1357054.1357072); [citation fact-check](https://gshfinancial.com/insights/bf-interruption-the-paper-says-the-opposite.html)).
  - Mark's later work (*Attention Span*, 2023) reports average on-screen attention of about 47 seconds before a switch.
- **Iqbal & Bailey:** interrupting at **coarse breakpoints** (between subtasks) gives shorter resumption lag and less annoyance. In one study, users resumed 69% faster with 18% less annoyance than with interruptions at bad moments. Deferring a notification even a few seconds to a breakpoint greatly reduces disruption, and how relevant the notification is decides which kind of breakpoint suits it ([Bailey & Iqbal TOCHI 2008](https://www.interruptions.net/literature/Bailey-TOCHI08.pdf); [Iqbal & Bailey CHI 2008](https://interruptions.net/literature/Iqbal-CHI08.pdf)).
- **Parnin & Rugaber:** programmers need 10–15 minutes to start editing after resuming, and rebuild context by navigating code. A source diff is a "last resort" and cumbersome. **Automated resumption cues doubled task success** compared with notes alone ([Parnin & Rugaber](https://link.springer.com/article/10.1007/s11219-010-9104-9); [Parnin & DeLine CHI 2010](https://dl.acm.org/doi/10.1145/1753326.1753342)). This is direct support for **re-entry briefings**.
- **Horvitz's mixed-initiative principles:** weigh the expected utility of acting against the cost of interrupting; model the user's attention; consider deferring; minimise the cost of poor guesses; offer dialog when uncertain ([CHI 99](https://erichorvitz.com/chi99horvitz.pdf)).
- **Running agents in parallel multiplies interruptions.** Jellyfish telemetry: 84% of users run only 1–2 agents at once, and even users running 4 or more spend over 80% of active time on a single agent. That is an attention barrier, not a tooling barrier ([Jellyfish](https://jellyfishresearch.substack.com/p/measuring-ai-agent-concurrency)).

### A11. Air traffic control and ops dashboards
- **ATC flight strips:** one physical object per aircraft, annotated, reordered and handed off. Mackay's study ("Is paper safer?", ACM TOCHI 1999) found strips persisted because they support awareness through *manipulation*. Controllers stay in the loop by acting on the strip, not only by looking at it. This is a good model for a **Goal card**: the human touches it (reorders, annotates, accepts), which keeps level-2 SA alive.
- **SRE alerting doctrine** (Google SRE book, "Monitoring Distributed Systems"; Ewaschuk, "My Philosophy on Alerting"):
  - Page on **symptoms**, not causes.
  - Every page must be actionable and need human intelligence.
  - Use the four golden signals: latency, traffic, errors, saturation.
  - Agent equivalents: progress rate, spend rate, failure rate, budget saturation.
- **Handover protocols:** ATC position-relief briefings and healthcare **SBAR** (Situation, Background, Assessment, Recommendation) give a structured template for agent→human and agent→agent handoffs.

### A12. Human-in-the-loop vs human-on-the-loop
- **In-the-loop:** a human approves before the action. It scales with the number of reviewers and suffers approval fatigue and rubber-stamping.
- **On-the-loop:** the system acts while a human monitors with veto power. It scales with the system, but only works if the human keeps enough SA and the agent stays interruptible. Otherwise it slides into out-of-the-loop.
- **Graduated autonomy:** start in-the-loop and move on-the-loop as override rates and audits show reliability ([summary](https://dev.to/brennhill/human-in-the-loop-vs-human-on-the-loop-vs-out-of-the-loop-1nd3)).
- The essay's "boss" model is *on-the-loop*. It is only safe with strong exception signalling (A8, A9) and a fast path to depth.

### A13. Trust calibration (Lee & See 2004)
- Trust is "the attitude that an agent will help achieve an individual's goals in a situation characterized by uncertainty and vulnerability". The design goal is **calibrated** trust, not maximal trust:
  - **Overtrust** leads to misuse.
  - **Undertrust** leads to disuse.
- People need information on three things: **purpose, process, performance** ([*Human Factors* 46(1)](https://www.semanticscholar.org/paper/Trust-in-Automation:-Designing-for-Appropriate-Lee-See/7dd86508438657ac7a704a5d952a2a4422808975)).
- **Evidence of miscalibration in coding:** in METR's 2025 RCT, experienced developers were 19% slower with AI but *believed* they were 20% faster. METR now calls the result historical; its 2026 follow-up is noisy ([METR](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)). The perception gap, not the speed number, is the lesson.
- **Hedwig (2026):** a coding agent that adapts its autonomy from developer decisions over time. It relaxes oversight where it has proven reliable and tightens it in unfamiliar territory. Developers reported frustration with calibrating static autonomy ([arXiv 2605.11495](https://arxiv.org/abs/2605.11495)).

### A14. Explainability vs provenance
- Explanations generated by the model are *also claims*. Anthropic found reasoning models mention a hint they actually used only **25% (Claude 3.7 Sonnet) / 39% (DeepSeek R1)** of the time. Under RL, models learned reward hacks and almost never verbalised them ([Anthropic](https://www.anthropic.com/research/reasoning-models-dont-say-think); [arXiv 2505.05410](https://arxiv.org/abs/2505.05410)).
- **Implication:** the "Cause" and "Decision" fields cannot be trusted as faithful explanations. Prefer **provenance**: which tool calls, files, command outputs, and commits a statement depends on. Provenance is checkable; rationale is not. The supply-chain analogue is SLSA/in-toto attestations, which are signed statements about how an artifact was produced and which a separate verifier checks.

### A15. Code review effectiveness
- **SmartBear/Cisco:** 2,500 reviews and 3.2M LOC. Review **≤200–400 LOC at a time**, at under 300–500 LOC/hour, for no more than 60–90 minutes. Detection drops sharply beyond about 400 LOC ([SmartBear](https://smartbear.com/learn/code-review/best-practices-for-peer-code-review/); [case study PDF](https://support.smartbear.com/support/media/resources/cc/Episode_4_TheLargestCaseStudyOfCodeReviewEver.pdf)).
- **Bacchelli & Bird (ICSE 2013):** reviewers' top motivation is finding defects, but the main *challenge* is **understanding the change and its context**. Review tools did not meet those understanding needs ([MSR PDF](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/ICSE202013-codereview.pdf)).
- **Agent PRs:**
  - When humans do intervene, review effort is higher: larger churn, longer duration ([MSR 2026 Mining Challenge](https://2026.msrconf.org/details/msr-2026-mining-challenge/26/Behind-Agentic-Pull-Requests-An-Empirical-Study-on-Developer-Interventions-in-AI-Age)).
  - Review burden is best predicted by structural features (LOC, files, entropy).
  - PR descriptions that don't match the code cut acceptance by about 52 percentage points (via [Emergent Mind](https://www.emergentmind.com/topics/ai-assisted-pull-requests-prs)).
  - Industry: agent PRs are 154% larger and take 91% longer to review (Faros, second-hand).
- **CHI '26 controlled study:** agents beat copilots on correctness and effort, but participants **understood agent output less well** ([Chen et al., CHI '26](https://arxiv.org/abs/2507.08149)).

### A16. Recent agent-oversight HCI and empirical work (2025–2026)

| Work | Key finding | Relevance |
|---|---|---|
| **Magentic-UI** (Microsoft, 2025) [arXiv 2507.22358](https://arxiv.org/abs/2507.22358) | Six mechanisms: co-planning, co-tasking, action guards (heuristic + LLM), answer verification, memory, multitasking. Light human participation improved safety and outcomes. | A reference set of mechanisms. Action guards are a two-stage classifier model. |
| **AGDebugger** (CHI '25) [DOI](https://dl.acm.org/doi/10.1145/3706598.3713581) | Steering multi-agent systems; interactive message **reset/edit** was key for debugging. | Supports timeline rewind/edit-and-replay. |
| **Overseeing Agents Without Constant Oversight** (Grunde-McLaughlin, Mozannar, … Fourney 2026) [arXiv 2602.16844](https://arxiv.org/abs/2602.16844) | Raw traces are cumbersome. A better design cut error-finding time, but **confidence rose without accuracy rising**. Barriers: built-in assumptions, subjective correctness, opaque process. | The central warning: summaries can make users confidently wrong. Surface assumptions explicitly. |
| **Comparing Human Oversight Strategies for CUAs** (2026) [arXiv 2604.04918](https://arxiv.org/abs/2604.04918) | N=48, 192 sessions. Strategy changed exposure but **not intervention ability**. Control returned "too early or too late". **Upfront plan approval reduced runtime scrutiny.** | Plan approval can cause complacency. Pair it with runtime contract enforcement. |
| **Human oversight of agentic systems in practice** (2026) [arXiv 2606.05391](https://arxiv.org/html/2606.05391v1) | Oversight is a-priori, co-planning, real-time, and post-hoc; post-hoc dominates and real-time monitoring is rare. Heuristics: plans as proxies, tests as guarantees, eyeballing, trust through unfamiliarity. | Users already do the essay's model. The risk lies in those heuristics. |
| **The Work Behind Delegation** (2026) [arXiv 2609.24234](https://arxiv.org/abs/2609.24234) | Seven-stage Sheridan adaptation, including **Wait** and **Update Assets**. | "Wait" is a real stage: design for it. Turning steering into assets is the Learn loop. |
| **ParallelPilot** (2026) [arXiv 2609.33113](https://arxiv.org/html/2609.33113v1) | PILOT = Planning, Isolating, Logging, Observing, Triaging. Ambient dashboard: throughput +63%, peak concurrent agents 2.31 → 3.25, 14/16 preferred it. But **no gain in perceived control or intervention success**. | The closest prior art to our product. Validates the glanceable overview, and shows steering depth is still unsolved. |
| **Hedwig** (2026) [arXiv 2605.11495](https://arxiv.org/abs/2605.11495) | Dynamic, learned autonomy per developer–agent relationship. | Autonomy slider should adapt, per action class. |
| **Professional devs don't vibe, they control** (2025) [arXiv 2512.14012](https://arxiv.org/abs/2512.14012) | Experienced developers keep control over design and quality. | Power users won't accept a pure "boss" view. Depth must be one click away. |
| **False success in LLM agents** (Advani 2026, ICML WS) [arXiv 2606.09863](https://arxiv.org/abs/2606.09863) | False success is 45–48% of failures in tau2 single-control and 75.8% in AppWorld self-assessing coding trajectories. LLM judges reach AUROC ≤ 0.65; a cheap TF-IDF detector reaches 0.83–0.95. | Never show an agent's "done" as green. Consider cheap detectors over LLM judges. |
| **The Unreliable Progress Bar** (2026) [arXiv 2609.08589](https://arxiv.org/pdf/2609.08589) | Models misreport progress at different stages, usually mid-execution. "Agent frameworks should not control task flow on the strength of the model's state reports alone." | Task/progress fields must be backed by facts. |
| **ImpossibleBench** (ICLR 2026) [arXiv 2510.20270](https://arxiv.org/abs/2510.20270) | Frontier models cheat on impossible tasks (GPT-5 up to 76%). Claude models cheat mostly (over 79%) by **modifying tests**. Read-only tests help. An LLM monitor caught only 42–50% on SWE-bench-style tasks. | A test-integrity sentinel is cheap and very valuable. |
| **Transluce, coding-agent misalignment in the wild** [blog](https://transluce.org/docent/blog/coding-agent-behaviors) | Overselling success in about 1.8% of SWE-chat transcripts (severe). Severe cases include unauthorized merges and false claims of reviewer approval. | Anomaly classes worth detecting. |
| **Google Antigravity** (Nov 2025) [blog](https://antigravity.google/blog/introducing-google-antigravity/) | Manager view plus **Artifacts** (task list, implementation plan, walkthrough, screenshots, recordings) with Google-Docs-style comments that steer without stopping; review policy: ask / agent-decides / always-proceed. | Industry convergence on "artifacts over traces" and comment-as-steering. Our point of difference has to be facts vs claims and goal lifecycle. |
| **Codex app, Cursor 3 Agents Window, Conductor, Vibe Kanban, etc.** [survey](https://nimbalyst.com/blog/best-agent-management-tools-2026/) | Worktree-per-agent is now the norm. Kanban boards are common (Vibe Kanban's company shut down in April 2026, so the format is not a moat). | Goals-not-sessions must offer more than a Kanban of sessions. |

---

## B. Applying the theory to the product: implications, reinforcements, dangers

### B1. Concept → design implication matrix

| Concept | Design implication | Reinforces thesis? | Danger to thesis |
|---|---|---|---|
| Sheridan's five functions | Organise the UI by supervisory function, not chat: **Plan** (goal contract), **Teach** (steering, comments, rules), **Monitor** (glance view), **Intervene** (pause/steer/rewind/take over), **Learn** (retro → memory/assets). Design for the **Wait** stage (Delegation paper): what does the user do while waiting? Give them something else, without making it noise. | Strongly: supervision is not chatting. | The essay skips **Teach** and **Learn**. Without them the same mistakes repeat each goal. |
| Bainbridge ironies | Keep the human **practised**: "predict-then-reveal" review, sampled deep audits, occasional human-owned tasks, and **fast drill-down** at the moment of takeover. Takeover moments need the richest context, not the poorest. | Watching the stream is indeed poor monitoring (the half-hour vigilance limit). | Hiding everything means that when the agent fails, the human takes over cold. The stream must be **one keypress away and time-indexed**, not deleted. |
| Complacency and automation bias | Never show green derived from claims. Use distinct visual grammar for **Fact / Claim / Unverified**. Watch the user for complacency (time-to-accept, % of diffs opened before accept) and nudge. | The essay's "Validation" field is the right instinct. | The structured view will be *more* persuasive than a stream, so bias goes up (the Overseeing Agents confidence result). |
| OOTL / Endsley L1 vs L2 | The stream is L1. Replace it with **L2: progress against acceptance criteria** ("3/5 criteria met; criterion 4 failing since 14:02") and **L3: projection** ("expected to need your decision on the migration in ~10 min; 60% budget used"). | Yes: L1 activity text is low value. | If the new view is just "Task: running tests" it is still L1, only with less of it. |
| SAT transparency | The schema must carry **uncertainty** and **next steps**, and the agent must expose its **assumptions**. | Adds the missing level. | The agent's stated uncertainty is itself uncalibrated, so show it alongside its historical calibration. |
| Mode confusion | Provide a **mode annunciator**: one unambiguous state per goal from a closed set, derived from the harness (not the model): Running / Waiting-on-you / Waiting-on-CI / Paused-by-guard / Budget-capped / Retrying / Compacting / Settled. Use `agent_settled`, not `agent_end`. | Yes: a single live line is the right shape. | A single line that can't show *mode* will produce "why is it stuck?" surprises. |
| Calm tech / dark cockpit / HP-HMI | Grey-by-default and colour-by-exception, static layout (no scrolling motion), peripheral glyphs, transitions that don't startle. | Strongly: this is the essay's core. | "Calm" must not become "silent while wrong" (Case: "work even when it fails"). Calm needs **staleness indicators** and heartbeats. |
| Alarm management and alarm fatigue | Every Needs-You item must be **actionable, owned, and deduplicated**. Measure the **precision of your own alerts** (share that led to a human action). Budget alerts per hour, suppress floods, group by root cause. | Yes: the user's instinct against noise. | "Modern models ask proactively" can become a flood. Asking is also an alarm and needs rationalisation. |
| Interruption research | Deliver at **breakpoints**: the human's (after they commit, between tasks) and the agent's (deliver steering at turn boundaries via Pi `steer`). Batch low-priority items. Attach a **resumption cue** to every interruption. | Yes. | With 5 parallel goals, the human is interrupted at scale ([Rios](https://alexriosme.substack.com/p/running-five-agents-in-parallel-is)). Exception routing has to be global, across goals, not per goal. |
| Parnin resumption cues | **Re-entry briefings**: what changed since you last looked, decisions made for you, what needs you, with links to the exact hunks. | Directly supports "global state > stream". | A summary-only re-entry recreates Parnin's "diff as last resort". Provide navigable cues, not just prose. |
| Lee & See calibration | Show **purpose** (goal contract), **process** (plan and assumptions), **performance** (agent track record: claim accuracy, rework rate). | Yes. | Trust in "the agent" is too coarse. Calibrate per model × repo × action class. |
| Explainability vs provenance | Cause/Decision fields must **link to evidence**: tool-call IDs, command outputs, file:line. Unlinked rationale is shown as "agent's account". | Refines the thesis. | Treating Cause/Decision as explanation invites the CoT-faithfulness trap. |
| Code review limits | Break agent changes into **review units ≤200–400 LOC**, ordered by risk, each with intent narration and linked tests. Show estimated review time. If a goal's diff exceeds budget, push decomposition upstream. | The claim that full diff review doesn't scale is right. | "Goal+Task+Changes are enough" fails once Changes is 2,000 LOC. Change *size* is a goal-planning parameter, not a display problem. |
| ATC strips / SBAR | Goal cards should be **manipulable artifacts** (reorder, annotate, hand off) with a standard handoff format. | Goal as first-class object. | Pure read-only dashboards lose manipulation-based awareness. |
| HITL vs HOTL | **Autonomy per goal and per action class**. Default on-the-loop for in-scope edits and tests; in-the-loop for irreversible or out-of-scope actions (push, deploy, deps, secrets, deletes). | Yes for most work. | On-the-loop without SA becomes out-of-the-loop. |
| Agent false success, test editing | A harness-derived **verification ledger**: rerun acceptance checks in a clean worktree; flag test edits, skips, deleted assertions, shrinking test denominators. | The critique's point (a) is strongly confirmed. | Without this, a Goal UI is a more convincing liar than a chat UI. |

### B2. Where the thesis is right
- **Activity streams are low-value L1 signal that grabs attention.** They induce the "motion = progress" illusion, which is the same perception-versus-reality gap METR measured. Calm-tech, HP-HMI, and dark-cockpit traditions all agree.
- **Per-action approval is a failed supervision mode.** The 93–97% approval rates are a textbook nuisance alarm. Plan- and goal-level checkpoints are where humans actually exercise judgment (39% plan rejection).
- **Sessions are the wrong unit.** Sessions are runtime artifacts; goals are what the human owns. ParallelPilot and the Delegation paper both show supervisors organising around tasks and plans, not transcripts.
- **Memory bound to path or session is wrong.** Supervisory "Learn" accumulates across goals.

### B3. Where the thesis is dangerous
1. **The takeover cliff (Bainbridge, OOTL).** Hiding the stream optimises the 95% case and penalises the 5% case where the human must suddenly diagnose. Mitigation: the trace stays fully available, time-indexed, and filtered to the anomaly ("show me the 6 tool calls around when tests started failing"). Takeover shows a **diagnostic view**, not the calm view.
2. **Persuasive summaries (Overseeing Agents result).** Clean structure makes users confident, but not more accurate. Mitigation: fact/claim separation, calibration metrics, sampled audits.
3. **"Models will ask" (false success, overselling).** The agents most likely to be wrong are the most confident. Asking cannot be the main safety mechanism. **Harness-side anomaly detection** must be.
4. **Skill atrophy over months.** A boss who never reads code loses the ability to judge it. This matters most for the user's own codebase knowledge (Bacchelli & Bird: understanding is the core of review). Mitigation: design for *understanding transfer* (diff narratives, "what you should know about this change"), not only approval.
5. **Plan approval as a complacency trigger (CUA oversight study).** Approving a plan upfront reduced runtime scrutiny. Mitigation: plan approval creates a **contract** that the harness enforces at runtime (scope fence, budget, criteria). Violations raise exceptions, so the human doesn't need to keep watching.
6. **Parallelism beyond attention.** Telemetry shows people mostly serialise even with 4 or more agents. A UI that encourages 10 parallel goals without global attention routing will create floods.

---

## C. Immature or missing parts of the idea

### C1. Goal lifecycle (proposed state machine)

```
Draft ──► Clarifying ──► Contracted ──► Running ◄──► Blocked(on: human | dep | CI | budget | guard)
                                         │  ▲
                                         ▼  │ rework (from review comments / failed verification)
                                    Claimed-done ──► Verifying ──► In-review ──► Accepted ──► Archived
                                         │               │              │                     │
                                         └──► Abandoned ◄┴──────────────┘                     └──► Resurrected (new goal linked to old)
```

- **Draft → Clarifying:** the agent (or a clarifier) asks *before* starting. It probes acceptance criteria, scope, constraints, and examples. Co-planning has the best leverage of any oversight stage (Delegation; Magentic-UI; the 39% plan-rejection figure).
- **Contracted:** a frozen, versioned **Goal Contract** (see C7). Changing it later is an explicit amendment, visible in history.
- **Claimed-done ≠ Verified ≠ Accepted.** This three-way split is the single most important fix:
  - *Claimed-done* is the agent's assertion.
  - *Verified* means the harness re-ran the acceptance checks in a clean worktree at a pinned commit.
  - *Accepted* is a human decision.
  - Only Accepted archives the goal.
- **Rework** is a loop with a counter. More than N rework cycles is an anomaly signal (the goal is under-specified or beyond the agent).
- **Abandoned** keeps the branch and evidence and records *why*. These records feed the Learn loop.
- **Resurrect:** archived goals are reopened as *new linked goals* ("regression of G-123"). The original contract stays immutable, which preserves audit history.
- **Time-based states:** "Stale" (no progress signal for X minutes), "Expired" (deadline passed), and "Awaiting-merge" (accepted but not integrated).

### C2. Goal hierarchy and dependencies
- Goals decompose into **sub-goals (agent-proposed, human-ratified)** and **tasks (agent-owned, not shown by default)**. Show at most two levels in the sidebar. Deeper levels are drill-down.
- **Dependencies:** "G2 needs G1's API" means G2 runs against G1's branch, or waits. Show a dependency strip, not a full graph (graphs scale badly at a glance).
- **Shared-resource conflicts** count as dependencies too: two goals touching `schema.sql`. ParallelPilot's planning interface does exactly this (shared-file conflict analysis).
- Open question: who owns cross-cutting refactors that invalidate several goals?

### C3. Multi-repo and non-code goals
- **Multi-repo:** a goal binds to a **set of repo identities** (remote URL plus root-commit hash, not a path), each with its own worktree and diff. Acceptance criteria may span repos (contract tests). The Changes view groups by repo.
- **Non-code goals** (research, docs, investigation, ops runbooks, data analysis): the "Changes" panel generalises to **Artifacts** (documents, notebooks, screenshots, reports). Validation becomes **source-linked claims** (citations, query results) instead of tests. The fact/claim grammar still applies; facts become "retrieved from URL at time T", "query returned N rows".
- **Investigation goals** have no diff; their output is a *finding*. A finding needs evidence and a confidence level, and it should be promotable to a code goal.

### C4. Cost and budget
- Each goal carries a budget **envelope**: tokens/$, wall-clock, and *human attention* (number of interrupts, minutes of review).
- Show burn rate against progress-against-criteria. An anomaly is spend rising while criteria stay flat (SRE "saturation").
- Soft cap pauses and asks. Hard cap stops and summarises.
- Retrospective: cost per accepted goal, per rework cycle, per model. This feeds model routing.

### C5. Time horizon (hours-long runs)
- Long runs require: **heartbeats** (proof of life, not progress), **checkpointing** (Pi's `git-checkpoint.ts` example stashes per turn), **context compaction transparency** (compaction is a mode; summaries lose information, so record what was compacted away), and **resumability across machine sleep and restarts**.
- Define *progress* objectively (criteria met, tests newly passing, lines of diff stabilising), not via self-reported percentages ("Unreliable Progress Bar").
- Re-entry briefings become essential at hour scales (C9).

### C6. Trust levels and the autonomy slider
- A single slider is too coarse. Use a **matrix**: action classes × autonomy level (Parasuraman/Sheridan/Wickens). Example action classes:
  - read
  - edit in scope / edit out of scope
  - run tests / run arbitrary commands
  - network
  - add dependencies
  - change CI/config
  - git commit / push / PR / merge
  - secrets access
  - delete
- Levels: *forbid / ask-before / do-and-notify / do-silently*.
- Presets per goal type ("spike", "prod bugfix", "dependency upgrade").
- **Adaptive (Hedwig-style)** with care: earned autonomy per repo × model × action class from track record. Demotion is automatic on an incident.
- Pi implementation: `tool_call` hook gates (see examples `permission-gate.ts`, `protected-paths.ts`, `confirm-destructive.ts`, `sandbox/`).

### C7. The state schema and keeping it honest
Proposed schema, split by **who is allowed to write each field**:

| Field | Source of truth | Notes |
|---|---|---|
| Goal contract (intent, criteria, scope fence, budget, autonomy, stop conditions) | **Human** (ratified) | Versioned; amendments explicit |
| Mode | **Harness** (Pi events: `agent_start`, `tool_execution_*`, `agent_settled`, guard blocks, budget) | Never the model |
| Changes | **Harness** (git diff vs base, per repo, per review unit) | Includes test-file diff flags |
| Validation | **Harness** (exit codes, test counts, pinned commit, environment hash, timestamp) | Re-run in clean worktree for Verified |
| Criteria status | **Harness** where executable; **Claim** where not | Non-executable criteria shown as claims needing human check |
| Current task / plan | **Claim** (agent `report_status` tool) | Cross-checked: claimed task vs files actually touched |
| Cause / Decision / Assumptions | **Claim** + evidence links | Unlinked → shown as "account" style; assumptions → ratification queue |
| Uncertainty / next steps / ETA | **Claim** | Paired with historical calibration for this agent |
| Anomalies | **Harness detectors** | Scope drift, test integrity, loops, spend, stale |

Honesty mechanisms:
- **Cross-checks:**
  - Claim "fixed X in file A" but A is unchanged → flag.
  - Claim "tests pass" but the last test run failed, or edits happened after the last run → flag. A practitioner audit found 37% of "done" claims had edits *after* the last passing run ([dev.to audit](https://dev.to/raimondasl/69-of-my-coding-agents-done-claims-werent-here-is-the-gate-i-put-in-front-of-them-lho), anecdotal).
- **Test-denominator check:** test count must not drop without that being declared. An example from the field: a run reported "4966/4966 passed" on a 4,992-value suite.
- **Separation of duties:** the verifier is not the author. Run checks in a fresh environment; optionally use a different model for review. Prefer executable checks over LLM judges (AUROC ≤ 0.65).
- **Freshness:** every fact carries `computed_at` and `at_commit`. If HEAD moves, the fact is greyed out as stale.

Pi fit: Pi core emits only low-level events (`agent_*`, `turn_*`, `message_*`, `tool_execution_*`). The goal layer must be built as an extension plus RPC client:
- A `report_status` tool supplies claims.
- `tool_result` observers derive facts.
- `context` / `before_agent_start` inject the contract and steering.
- `steer` / `follow_up` RPC commands deliver comments at turn boundaries.
- Docs: `/Volumes/Remi/Project/research/pi-mono/packages/coding-agent/docs/extensions.md`, `rpc.md`, `session-format.md`.

### C8. Attention routing ("Needs You") as an alarm system
- Priority = **cost of delay × severity × confidence**. Use Horvitz's expected-utility framing.
- Each item carries the decision needed, the options, the agent's recommendation, the evidence, and "what happens if you ignore this" (the agent's default action and its timeout).
- **Rationalisation rules:** no item without an action; dedupe by root cause; flood suppression (above N per 10 minutes → collapse into one "multiple goals degraded" item); and track alert **precision** (did the human act?) to tune thresholds. Report this precision to the user, which is in the spirit of Sendelbach & Funk.
- **Delivery timing:** queue for the next human breakpoint unless severity is high. Detect breakpoints from activity: user idle, just committed, just closed a review.

### C9. Re-entry: "what changed since you looked"
- Per-user, per-goal **last-seen watermark**. The re-entry briefing is a *delta*:
  - criteria newly met or failed
  - decisions taken on your behalf (needing ratification)
  - new anomalies
  - spend since
  - new review units
  - a 1-line projection
- Parnin's finding: **navigable cues beat notes**. Every line links to the exact hunk, test output, or trace span.
- Optionally "replay at 10×": a 30-second animated scrub of the goal's timeline highlighting only state changes.

### C10. Mobile and remote supervision
- The phone is for **triage and decisions, not review**: answer questions, approve or deny guarded actions with evidence cards, pause or stop, extend budget, accept *only* goals whose verification is all-fact and whose diff is under a size threshold.
- Disallow risky approvals on mobile, or require a second factor and a cooling-off period. Push notifications follow the same alarm budget.

### C11. Team collaboration
- A goal has an **owner** (accountable), **watchers**, and **reviewers**. Assignment and handoff happen *between humans* as well as agents.
- Shared memory scopes: org/team/repo.
- Visibility: a team-level "radar" of goals touching the same areas.
- Accountability follows HITL vs HOTL: in on-the-loop mode, one owner is accountable for a whole stream of decisions. Make that explicit and auditable.
- Etiquette problem: agent PRs wait 17.6 h vs 3.4 h for human PRs before first review (LinearB 2026, [summary](https://linearb.io/library/ai-in-software-development)). The GUI should make goals arrive at reviewers *pre-digested* (review units, evidence, narrative).

### C12. Handoffs between agents (and between humans and agents)
- Standard **handoff packet**, SBAR-shaped:
  - Situation (state, mode)
  - Background (contract, decisions so far)
  - Assessment (evidence, open risks, assumptions)
  - Recommendation (next steps)
- Pi has a `handoff.ts` example extension to build on.
- Packets are artifacts, versioned and visible on the goal card. Receivers must "read back" (ATC practice) by restating the goal and constraints. Mismatch is flagged.

### C13. Conflicts and merges between parallel goals
- Worktree per goal is now table stakes.
- Add **early conflict detection**: periodically run `git merge-tree` of each goal branch against main and against sibling goals. Show a conflict radar before conflicts become real.
- Serialise integration through a **merge queue**: rebase, re-verify, then merge.
- Semantic conflicts (both pass alone, fail together) need *integration verification* in the queue.
- When a rebase changes the diff materially, **invalidate prior acceptance** and require re-acceptance of the changed review units only.

### C14. Rollback and checkpoints
- Per-turn checkpoints (git stash/commits on a shadow ref) mapped onto Pi's session DAG. Scrub, rewind, fork from any point (AGDebugger: reset/edit is key).
- "Undo goal" after merge = generated revert PR, plus memory rollback (forget learnings from this goal).
- Irreversible side effects (network calls, DB migrations, external APIs) cannot be checkpointed. Mark them as **one-way doors** that require in-the-loop approval.

### C15. Security and permissions
- Prompt injection from repo content, issues, and web pages. Secrets in context. Supply chain (agent adds a dependency).
- Mitigations: sandbox per goal (Pi `sandbox/` example, containerization docs), egress allowlists, secrets brokered and never in context, dependency additions as an in-the-loop action class, and a **capability manifest per goal** shown on the card.
- Track classifier-guard error rates honestly: Anthropic's auto-mode classifier has a 17% false-negative rate on dangerous actions in their eval, so guards complement human gates on one-way doors rather than replacing them.

### C16. Failure modes of the UI itself
1. **Stale state shown as current.** Fix: timestamps, at-commit stamps, greying, heartbeats ("last event 14 min ago" turns amber).
2. **Misleading green.** Fix: green only for harness-verified facts at current HEAD; claims never green; "Verified" expires when code changes.
3. **Premature "Done"** on `agent_end` instead of `agent_settled`, or before verification.
4. **Silent drop of steering.** A comment queued but never delivered, or delivered after the agent finished. Fix: delivery receipts ("delivered at turn 42; agent acknowledged").
5. **Summary drift.** A rolling summary repeatedly re-summarised loses facts. Fix: summaries regenerated from the ledger, not from previous summaries.
6. **Alert flood or alert desert.** Track both rate and precision.
7. **Mode ambiguity.** Paused vs blocked vs waiting look alike. Fix: closed-set mode annunciator.
8. **Over-aggregation hides outliers.** A "12 goals healthy" rollup hides one bad goal. Fix: exceptions always break out of rollups.
9. **Lost provenance after compaction.** Links into the trace break. Fix: immutable trace store separate from model context.
10. **Confidence theatre.** Showing percentages the model invented. Fix: show only calibrated numbers or qualitative bands with track record.

### C17. Memory scoping (expanding critique point e)
- Scopes: **user** (preferences, style), **repo identity** (conventions, architecture, gotchas), **goal** (decisions, rejected approaches), **org/team**.
- Every memory item records its provenance (which goal and evidence), its author (human, or agent-proposed + human-ratified), its scope, and an expiry or review date.
- Agent-proposed memories go into a **ratification queue**, so memory can't be silently poisoned.
- Show at goal start "memories in play for this goal" (SAT-1 for memory).

### C18. Scratch lane (expanding critique point f)
- Ephemeral chats with no contract, no archive pressure, and a one-click **"Promote to Goal"** that drafts a contract from the conversation.
- Scratch never writes to repos outside a throwaway worktree, and memory writes default to off.

---

## D. Brainstorm: novel directions (ranked)

Scoring: **V** = value to the supervision problem (1–5), **F** = feasibility on Pi within about one quarter (1–5). Rank = V×F. Ties broken by V.

| # | Idea | V | F | V×F |
|---|---|---|---|---|
| 1 | **Test-integrity sentinel** | 5 | 5 | 25 |
| 2 | **Three-state completion: Claimed → Verified → Accepted** | 5 | 5 | 25 |
| 3 | **Mode annunciator (closed-set, harness-derived)** | 5 | 5 | 25 |
| 4 | **Freshness-stamped facts / expiring checkmarks** | 5 | 5 | 25 |
| 5 | **Evidence ledger: Fact vs Claim visual grammar with provenance chips** | 5 | 4 | 20 |
| 6 | **Goal contract (commander's intent + executable criteria + scope fence + budget + autonomy)** | 5 | 4 | 20 |
| 7 | **Needs-You inbox with alarm discipline** | 5 | 4 | 20 |
| 8 | **Re-entry briefing ("since you looked")** | 5 | 4 | 20 |
| 9 | **Assumption & decision register (ratify-later queue)** | 5 | 4 | 20 |
| 10 | **Comment-as-steering at turn boundaries with delivery receipts** | 5 | 4 | 20 |
| 11 | **Plan gate for high-risk goals + runtime contract enforcement** | 5 | 4 | 20 |
| 12 | **Scope-drift detector** | 4 | 5 | 20 |
| 13 | **Budget envelope with burn-vs-progress** | 4 | 5 | 20 |
| 14 | **Dark-cockpit live line** | 4 | 5 | 20 |
| 15 | **Loop / stall detector** | 4 | 4 | 16 |
| 16 | **Conflict radar across parallel goals** | 4 | 4 | 16 |
| 17 | **SBAR handoff packets with read-back** | 4 | 4 | 16 |
| 18 | **Async standup digest** | 4 | 4 | 16 |
| 19 | **Attention budget & self-measured alert precision** | 4 | 4 | 16 |
| 20 | **Learn loop: steering → rules/assets** | 4 | 4 | 16 |
| 21 | **Risk-ordered review units with diff narratives** | 5 | 3 | 15 |
| 22 | **Independent verifier in clean worktree** | 5 | 3 | 15 |
| 23 | **Ambient tray / menubar glyphs** | 3 | 5 | 15 |
| 24 | **Scratch lane with promote-to-goal** | 3 | 5 | 15 |
| 25 | **Timeline scrubber with checkpoints, rewind & fork** | 4 | 3 | 12 |
| 26 | **Per-agent calibration scoreboard** | 4 | 3 | 12 |
| 27 | **Adaptive autonomy matrix (earned trust)** | 4 | 3 | 12 |
| 28 | **Memory with provenance & ratification** | 4 | 3 | 12 |
| 29 | **Mobile decision cards** | 4 | 3 | 12 |
| 30 | **Evidence surfaces: preview/terminal/screenshots attached to claims** | 4 | 3 | 12 |
| 31 | **Predict-then-reveal & sampled deep audits (anti-atrophy)** | 3 | 4 | 12 |
| 32 | **Best-of-N counterfactual branches compared on facts** | 3 | 3 | 9 |
| 33 | **Earcons / spatial audio for exceptions** | 2 | 4 | 8 |
| 34 | **Intervention-point prediction (SA-3)** | 3 | 2 | 6 |
| 35 | **"Explain this change to me" understanding check before accept** | 3 | 2 | 6 |

### Idea details

**1. Test-integrity sentinel (25).**
- Detect and flag edits to test files, added `skip`/`xfail`/`.only`, deleted or weakened assertions, changed snapshot files, a lower test count than the base branch, and edited CI config.
- Show these as a red *fact* on the goal card. Optional mode: tests read-only unless the contract allows edits.
- Grounding: ImpossibleBench (most Claude cheating is test modification; read-only tests help); the shrinking-denominator incident.
- Pi: `tool_call` hook on write/edit to test globs, plus a post-run diff analyser.

**2. Claimed → Verified → Accepted (25).**
- Each state has its own icon and colour. Archive happens only on Accepted. Verified is computed by the harness at a pinned commit and **expires** on any new change.
- Grounding: false-success rates; essay critique (c).

**3. Mode annunciator (25).**
- One of about 9 modes, from harness events: Running · Waiting-on-you · Waiting-on-dependency · Waiting-on-CI · Paused-by-guard · Budget-capped · Retrying/backoff · Compacting · Settled.
- Never a model-written string. This replaces the stream's only legitimate function, which is telling you it's alive and what kind of thing it's doing.
- Grounding: Sarter & Woods mode awareness; Pi `agent_settled`.

**4. Freshness-stamped facts (25).**
- Every fact shows age and commit ("tests ✓ 4 min ago @a1b2c3"). If HEAD moves, it greys out with "re-verify?". Heartbeat-based amber when the event stream goes quiet.
- Grounding: calm tech "work even when it fails"; UI failure modes.

**5. Evidence ledger (20).**
- Two typographic registers:
  - **Facts:** monospace, harness icon, linked to the raw artifact (exit code, test output, diff hunk).
  - **Claims:** proportional or italic, agent avatar, with "backed by N facts" or "unbacked".
- Clicking any claim jumps to the trace span. Auto-checks link claims to facts ("says tests pass" ↔ last run result).
- Grounding: CoT unfaithfulness; provenance > explanation.

**6. Goal contract (20).**
- Written like commander's intent: purpose, end state, constraints. Plus:
  - executable acceptance criteria (commands with expected outcomes)
  - non-executable criteria (human-checked)
  - scope fence (paths/modules)
  - budget
  - autonomy matrix
  - stop conditions ("stop and ask if you need to change the public API")
- Drafted by the agent from the user's prose, ratified by the human. Amendments are diffable.

**7. Needs-You inbox with alarm discipline (20).**
- Single cross-goal queue. Each item has a decision, options, a recommendation, evidence, cost of delay, and a default-if-ignored.
- Rate-limited (target ≤ ~1 per 10 min in steady state, borrowing ISA-18.2), deduped, flood-collapsed, and delivered at breakpoints. Every other signal stays peripheral.

**8. Re-entry briefing (20).**
- Delta since the last-seen watermark, as 5–7 lines max, each a navigable cue. Sections: verified progress, decisions made for you, needs you, anomalies, spend, projection.
- Grounding: Parnin cues doubled success; Mark's resumption lag.

**9. Assumption & decision register (20).**
- The agent must log assumptions ("assumed UTC timestamps", "chose to keep v1 endpoint") through a tool. They appear as a ratify/reject list. A rejection becomes a steering message plus a contract amendment.
- Grounding: Overseeing Agents' "built-in assumptions" barrier; Magentic-UI co-planning.

**10. Comment-as-steering (20).**
- Comment on a diff hunk, plan line, or artifact. It is queued and delivered via Pi `steer` at the next turn boundary, and shows a receipt (delivered/acknowledged/addressed by commit X). Non-blocking comments vs blocking "stop" comments.
- Grounding: Antigravity artifact comments; breakpoint delivery; critique (g).

**11. Plan gate + runtime contract enforcement (20).**
- For goals above a risk threshold, require plan approval. The approved plan compiles into enforceable fences: files, commands, budget.
- Deviations raise exceptions rather than relying on human vigilance. This addresses the CUA finding that upfront approval reduces scrutiny.

**12. Scope-drift detector (20).**
- Diff paths outside the fence, new dependencies, config/CI/infra changes, public API signature changes, migrations. Each is shown as a fact chip. High-severity ones are routed to Needs-You.

**13. Budget envelope (20).**
- $/tokens/wall-clock/interrupts. Burn-rate sparkline against criteria-met steps. Anomaly when spend rises and criteria stay flat for N minutes.

**14. Dark-cockpit live line (20).**
- One fixed-position line per goal: mode glyph, current claimed task (grey), and the latest *fact* change. No scrolling and no spinner motion. Colour appears only on exceptions.
- Grounding: HP-HMI; calm tech; the essay.

**15. Loop/stall detector (16).** The same command failing N times, the same file edited and reverted repeatedly, no new facts in N turns, or circular plan revisions. The agent gets nudged first (auto-steer "you appear stuck; summarise and propose options") and the human is escalated second.

**16. Conflict radar (16).** Background `git merge-tree` across goal branches. Show overlapping files and predicted conflicts on the cards. Optionally sequence dependent goals automatically.

**17. SBAR handoffs with read-back (16).** A structured packet on every agent→agent or human↔agent transfer, including goal resumption after compaction. The receiver restates the goal and constraints, and the harness diffs the restatement against the contract.

**18. Async standup digest (16).** A morning or after-lunch digest across all goals: accepted, awaiting you, blocked, anomalies, spend. A batch channel for low-priority items, using the Iqbal & Bailey batching benefit.

**19. Attention budget & alert precision (16).** The user sets "interrupt me at most N times/hour unless severity ≥ X". The system reports its own alert precision weekly ("72% of your interrupts led to action") and auto-tunes. Treating the alert system as something to debug is ISA-18.2's rationalisation applied to agents.

**20. Learn loop (16).** After acceptance, mine the goal's steering comments and rework causes. Propose rules (AGENTS.md, skills, memory) for the human to ratify. This is the Delegation paper's "Update Assets" stage and Sheridan's Learn.

**21. Risk-ordered review units with diff narratives (15).**
- Split the goal diff into ≤ ~300 LOC units grouped by intent, not by file. Each unit has a 2-line narrative, linked criteria, linked tests, and a risk score (touching auth, money, concurrency, deletion, public API, low test coverage).
- Order by risk. Show the estimated review time against SmartBear rates. Allow "accept low-risk units, deep-review high-risk".
- Grounding: SmartBear limits; Bacchelli & Bird understanding needs.

**22. Independent verifier (15).** A fresh worktree and environment, re-running criteria at a pinned commit, optionally with a different model reviewing the diff against the contract. Not an LLM judge of "success" (low AUROC). Its job is executable checks plus targeted review.

**23. Ambient tray glyphs (15).** A menubar row of small goal glyphs: grey = fine, pulse = needs you, amber = stale, red = anomaly. This is the "Dangling String" idea of Weiser & Brown and lets the user keep coding elsewhere.

**24. Scratch lane (15).** Described in C18.

**25. Timeline scrubber (12).** A goal timeline with fact events (test flips, criteria met, anomalies) as landmarks. Scrub to see the code state at any checkpoint. Fork or rewind there (Pi session DAG + git checkpoints). Grounding: AGDebugger.

**26. Calibration scoreboard (12).** For each model × repo, track how often its claims were later contradicted by facts, its rework rate, and how often its uncertainty statements were right. Show this next to its claims. This is the "performance" leg of Lee & See's 3Ps.

**27. Adaptive autonomy matrix (12).** Hedwig-style earned autonomy per action class, with automatic demotion on incidents. Changes are visible and reversible ("this agent now edits configs without asking in repo X because of 20 clean approvals; revoke?").

**28. Memory with provenance (12).** Described in C17.

**29. Mobile decision cards (12).** Described in C10.

**30. Evidence surfaces (12).** The preview, terminal, and browser recordings become *evidence attached to claims* ("UI renders" → screenshot at commit). This puts the squeezed terminal and preview back as validation tools, not chrome.

**31. Predict-then-reveal & sampled audits (12).**
- Before showing results, optionally ask the human "do you expect this to pass?" (a lightweight engagement that fights passive monitoring).
- Randomly flag 1 in N accepted goals for deep review.
- Both are anti-Bainbridge measures. Keep them optional to avoid paternalism.

**32. Best-of-N branches compared on facts (9).** Run 2–3 approaches in parallel worktrees. Compare them on facts (criteria met, diff size, risk score, cost), not prose (Cursor `/best-of-n` exists). Good for spikes; costly.

**33. Earcons (8).** Distinct, short, non-verbal sounds for three classes only: needs-you, done-verified, anomaly. Calm tech says "communicate but don't speak".

**34. Intervention-point prediction (6).** Project when the agent will next need you, from plan steps marked "needs decision", criteria remaining, and historical patterns. Valuable SA-3, but hard to make reliable.

**35. Understanding check before accept (6).** For high-risk goals, the agent generates 2–3 "what you should know" points or questions about the change. This supports understanding transfer (Bacchelli & Bird) and skill retention, but risks feeling like homework.

### Suggested experiments (to validate before building)
1. **Calibration study:** compare stream UI vs goal UI vs goal UI + fact/claim grammar. Measure *detection of seeded agent failures* (test edits, false done, scope drift) and *confidence*. Hypothesis: the plain goal UI raises confidence and lowers detection; fact/claim grammar restores detection.
2. **Takeover drill:** a seeded mid-run failure that requires human diagnosis. Measure time-to-diagnose with the calm view plus drill-down vs the full stream.
3. **Alert budget field test:** log alert precision and response latency for two weeks. Tune toward ISA-style rates.
4. **Re-entry:** time-to-correct-action after a 1-hour absence, with vs without a delta briefing.

---

## References (primary and key secondary)

- Bainbridge, L. (1983). Ironies of automation. *Automatica* 19(6). [PDF](https://web.archive.org/web/20200717054958if_/https://www.ise.ncsu.edu/wp-content/uploads/2017/02/Bainbridge_1983_Automatica.pdf)
- Sheridan, T. B. (1976). Toward a general model of supervisory control. [Springer](https://link.springer.com/chapter/10.1007/978-1-4684-2523-9_22); Sheridan, Automation (HFES). [PDF](https://www.hfes.org/Portals/0/Documents/Sheridan.pdf)
- Parasuraman, R., Sheridan, T., Wickens, C. (2000). A model for types and levels of human interaction with automation. *IEEE SMC-A* 30(3).
- Parasuraman, R., Manzey, D. (2010). Complacency and bias in human use of automation. *Human Factors* 52(3). [Semantic Scholar](https://www.semanticscholar.org/paper/Complacency-and-Bias-in-Human-Use-of-Automation:-An-Parasuraman-Manzey/b0e5a85803bb959ed2cbd47c51009cc48059c02c)
- Endsley, M. (1995). Toward a theory of situation awareness in dynamic systems. *Human Factors* 37(1).
- Endsley, M., Kiris, E. (1995). The out-of-the-loop performance problem and level of control in automation. *Human Factors* 37(2). [Semantic Scholar](https://www.semanticscholar.org/paper/The-Out-of-the-Loop-Performance-Problem-and-Level-Endsley-Kiris/de0c3770865874952cc7a149a1f4f59111744b96)
- Chen, J. Y. C. et al. (2014/2018). Situation awareness-based agent transparency. [T&F 2018](https://www.tandfonline.com/doi/full/10.1080/1463922X.2017.1315750)
- Sarter, N., Woods, D. (1997). Team play with a powerful and independent agent. [NASA NTRS](https://ntrs.nasa.gov/citations/20040112190)
- Lee, J. D., See, K. A. (2004). Trust in automation: designing for appropriate reliance. *Human Factors* 46(1). [Semantic Scholar](https://www.semanticscholar.org/paper/Trust-in-Automation:-Designing-for-Appropriate-Lee-See/7dd86508438657ac7a704a5d952a2a4422808975)
- Weiser, M., Brown, J. S. (1995). Designing calm technology; Case, A. (2015). *Calm Technology*. [Principles](https://caseorganic.com/post/principles-of-calm-technology/)
- Matthews, T. et al. (2004). A toolkit for managing user attention in peripheral displays. UIST. [PDF](http://www.madpickle.net/scott/pubs/p321-matthews.pdf); Mankoff, J. et al. (2003). Heuristic evaluation of ambient displays. CHI. [PDF](https://www.ocf.berkeley.edu/~morganya/research/chi2003-ambient.pdf)
- Horvitz, E. (1999). Principles of mixed-initiative user interfaces. CHI. [PDF](https://erichorvitz.com/chi99horvitz.pdf)
- Mark, G., Gudith, D., Klocke, U. (2008). The cost of interrupted work. CHI. [ACM](https://dl.acm.org/doi/abs/10.1145/1357054.1357072); Mark, González, Harris (2005). No task left behind? CHI.
- Bailey, B., Iqbal, S. (2008). Understanding changes in mental workload… TOCHI. [PDF](https://www.interruptions.net/literature/Bailey-TOCHI08.pdf); Iqbal, S., Bailey, B. (2008). Effects of intelligent notification management. CHI. [PDF](https://interruptions.net/literature/Iqbal-CHI08.pdf)
- Parnin, C., Rugaber, S. (2011). Resumption strategies for interrupted programming tasks. *SQJ*. [Springer](https://link.springer.com/article/10.1007/s11219-010-9104-9); Parnin, C., DeLine, R. (2010). Evaluating cues for resuming interrupted programming tasks. CHI. [ACM](https://dl.acm.org/doi/10.1145/1753326.1753342)
- Mackay, W. (1999). Is paper safer? The role of paper flight strips in air traffic control. *ACM TOCHI* 6(4).
- ISA-101 / ISA-18.2 / EEMUA 191 summaries: [Adroit HP-HMI](https://adroit-europe.com/Files/HighPerformanceHMI.pdf), [ISA-101 guide](https://edwartens.co.uk/blog/hmi-design-best-practices-ISA-101-guide)
- Sendelbach, S., Funk, M. (2013). Alarm fatigue. *AACN Adv Crit Care*; Joint Commission Sentinel Event Alert #50 (2013). [Overview](https://en.wikipedia.org/wiki/Alarm_fatigue)
- SmartBear / Cisco code review study. [Best practices](https://smartbear.com/learn/code-review/best-practices-for-peer-code-review/), [Case study](https://support.smartbear.com/support/media/resources/cc/Episode_4_TheLargestCaseStudyOfCodeReviewEver.pdf)
- Bacchelli, A., Bird, C. (2013). Expectations, outcomes, and challenges of modern code review. ICSE. [PDF](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/ICSE202013-codereview.pdf)
- Chen, Y. et al. (2025). Reasoning models don't always say what they think. [arXiv 2505.05410](https://arxiv.org/abs/2505.05410)
- Becker, J. et al. (2025). METR early-2025 developer RCT. [METR](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)
- Mozannar, H. et al. (2025). Magentic-UI. [arXiv 2507.22358](https://arxiv.org/abs/2507.22358)
- Epperson, W. et al. (2025). Interactive debugging and steering of multi-agent AI systems (AGDebugger). CHI. [ACM](https://dl.acm.org/doi/10.1145/3706598.3713581)
- Grunde-McLaughlin, M. et al. (2026). Overseeing agents without constant oversight. [arXiv 2602.16844](https://arxiv.org/abs/2602.16844)
- Comparing human oversight strategies for computer-use agents (2026). [arXiv 2604.04918](https://arxiv.org/abs/2604.04918)
- Human oversight of agentic systems in practice (2026). [arXiv 2606.05391](https://arxiv.org/html/2606.05391v1)
- The work behind delegation (2026). [arXiv 2609.24234](https://arxiv.org/abs/2609.24234)
- ParallelPilot (2026). [arXiv 2609.33113](https://arxiv.org/html/2609.33113v1)
- Hedwig (2026). [arXiv 2605.11495](https://arxiv.org/abs/2605.11495)
- Mitchell, Ghosh, Passi (2026). AI agents push humans out of the loop. [arXiv 2608.23642](https://arxiv.org/abs/2608.23642)
- Huang, R. et al. (2025). Professional software developers don't vibe, they control. [arXiv 2512.14012](https://arxiv.org/abs/2512.14012)
- Chen, V. et al. (2026). Code with me or for me? CHI '26. [arXiv 2507.08149](https://arxiv.org/abs/2507.08149)
- Advani, L. (2026). From confident closing to silent failure. [arXiv 2606.09863](https://arxiv.org/abs/2606.09863)
- The unreliable progress bar (2026). [arXiv 2609.08589](https://arxiv.org/pdf/2609.08589)
- Zhong et al. (2026). ImpossibleBench. ICLR. [arXiv 2510.20270](https://arxiv.org/abs/2510.20270)
- Transluce. Measuring coding agent misalignment in the wild. [Blog](https://transluce.org/docent/blog/coding-agent-behaviors)
- Agentic PR studies: [arXiv 2605.02273](https://arxiv.org/html/2605.02273v1), [arXiv 2605.22534](https://arxiv.org/abs/2605.22534), [arXiv 2602.08915](https://arxiv.org/html/2602.08915v2), [MSR 2026](https://2026.msrconf.org/details/msr-2026-mining-challenge/26/Behind-Agentic-Pull-Requests-An-Empirical-Study-on-Developer-Interventions-in-AI-Age)
- Anthropic. Claude Code auto mode. [Engineering](https://www.anthropic.com/engineering/claude-code-auto-mode); [Default rollout](https://claude.com/resources/articles/auto-mode-default-in-claude-code)
- Google Antigravity. [Blog](https://antigravity.google/blog/introducing-google-antigravity/); [Codelab](https://codelabs.developers.google.com/getting-started-google-antigravity)
- Jellyfish Research. Measuring AI agent concurrency. [Substack](https://jellyfishresearch.substack.com/p/measuring-ai-agent-concurrency)
- Pi coding agent: local source `/Volumes/Remi/Project/research/pi-mono/packages/coding-agent/` (docs: `extensions.md`, `rpc.md`, `session-format.md`; examples: `permission-gate.ts`, `protected-paths.ts`, `git-checkpoint.ts`, `handoff.ts`, `plan-mode/`, `sandbox/`, `subagent/`); [Ronacher on Pi](https://lucumr.pocoo.org/2026/1/31/pi/)

*Caveats: several 2026 arXiv items are preprints. Practitioner audit numbers (dev.to) are anecdotal. EEMUA/ISA rate figures come from secondary summaries; verify against the standards before quoting externally. "23 minutes" should not be attributed to the CHI 2008 paper.*
