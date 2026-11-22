# 19 · Anti-"Chat UI Inertia" Console Design Specification

> **Design thesis**: Tower is a **Precision Air-Traffic Control Flight Deck × Swiss Instrument Editorial** console for supervising autonomous coding agents. It explicitly rejects the "Chat UI inertia" of generic AI coding wrappers (chat bubbles, scrolling transcript feeds, session-tree clutter, purple gradients, glassmorphism blur) in favor of calibrated state telemetry, physical provenance separation, and ≤ 3-second supervisory scannability.
>
> **Builds on**: `docs/00-vision-and-principles.md` (P1–P10, R1–R12), `docs/04-ux-information-architecture.md`, `docs/12-visual-design-system.md`, `docs/18-evolution-roadmap.md`.

---

## 19.1 Why Chat UI Fails Multi-Agent Supervision

Generic AI coding tools inherited a 1-to-1 conversational metaphor: a sidebar of disposable `/new` chat sessions, a central transcript stream of prose bubbles, and a secondary diff drawer. Under concurrent, long-running multi-agent work, that metaphor collapses across four cognitive dimensions:

| Chat UI Inertia Pattern | Cognitive & Operational Failure | Tower Flight-Deck Replacement |
|---|---|---|
| **Session-tree sidebar** | Disposable chat threads accumulate without lifecycle state; supervisors cannot tell what is running, blocked, or verified. | **Operational Rail** (`Overview`, `Needs You`, `Learning`, `Operations`) + active **Goals** grouped strictly by supervisory urgency. Sessions are downgraded to per-goal Flight Recorder traces. |
| **Scrolling transcript stream** | Human attention locks onto motion ("Reading… Thinking…"), creating an illusion of progress while hiding whether acceptance criteria actually passed. | **ATC Flight-Strip Board**: fixed-column horizontal instrument rows (`Glyph · Goal · Live · Criteria · Change · Spend · Updated · Identity`) with single-line steerable telemetry and zero decorative animation. |
| **Unverified prose bubbles** | Agent claims ("All tests pass! Ready to merge!") share the exact visual register as tool outputs and harness facts, amplifying reward-hacking blind spots. | **Four-Provenance Visual Physics**: `Fact`, `Observation`, `Claim`, and `Human` are physically separated by border geometry, typography, and color permission—green is strictly reserved for fresh Harness verifier facts. |
| **Chat prompt box for steering** | Encourages conversational back-and-forth instead of scoped contracts, inline diff annotations, and explicit one-way-door approvals. | **Decision Gate Strip** (`1–9` instant actions, `Esc` fold), **Contract Studio** (clause-numbered terms), **Review Theater** (diff-anchored steering dispatch), and **Directive Steering** with multimodal evidence. |

---

## 19.2 The ≤ 3-Second Scannability Budget & ATC Flight-Strip Density

At any instant, a single glance at Tower's Mission Board answers the five North-Star supervisory questions (`00` §0.4) without scrolling through prose:

1. **Top Telemetry Title Bar (`TelemetryStrip`)**:
   - **Active Slots Lamp Strip**: discrete slot indicator lamps paired with the swept `RunsGauge` (`2/4 running`) showing immediate fleet utilization.
   - **Blocking Needs-You Counter**: amber `◆` pill that appears *only* when at least one goal is blocked on a human decision; clicking jumps directly to the Decision Gate.
   - **Sandbox Posture Pill**: explicit kernel isolation readout (`S2 Seatbelt`, `Landlock`, `MicroVM`, or warning when unsandboxed) so security posture is continuously observable, never buried in preferences.
   - **Engine Heartbeat, Spend, Quiet Hours & Remote Phone Posture**: tabular-numeral readings aligned on one quiet baseline; healthy indicators collapse gracefully at half-screen widths while problems always stay visible.

2. **Pinned Decision Gate Strip (Overview Top)**:
   - Every run-blocking decision sits pinned above active goals on the exact same horizontal column grid (`DecisionLine`).
   - Selecting any line (`j/k`, `Tab`, click) unfolds its full `DecisionCard` in place (`1–9` instant choices, `⌘↩` reply, `Esc` fold back) so blocking exceptions are resolved in seconds without losing board context.

3. **Horizontal Flight Strips (`GoalRow`)**:
   - A quiet tabular **Flight-Strip Header** anchors every column (`Goal · Live · Criteria · Change · Spend · Updated · Identity`) above the first active group, matching the empty ghost board's exact grid geometry.
   - **Dual-Track Evidence Gauge**: Verified Harness Facts render as solid green precision bars; tampered-canary passes render as solid amber bars (never green); Agent-environment Observations render as **dashed hollow neutral** bars; pending criteria render as crisp outlined hairlines.
   - **Budget & Wall-Clock Burn Micro-Bar**: a 2px calibrated track beneath the spend figure with a vertical soft-cap tick; fill shifts from quiet neutral to amber only when crossing the soft cap.
   - **Overlap Radar Warning Pill**: highlights conflicting concurrent goals (`◇ G-0004`) directly on the strip before merge time.
   - **Engine & Trust Tier Metadata**: non-default engines and trust tiers (`Full S2`, `Restricted S2`, `Experimental`) surface honestly without crowding narrow viewports.

---

## 19.3 Four-Provenance Visual Physics (Honesty Grammar v2)

Honesty Grammar (`R1`) is enforced as physical material grammar—distinguishable in monochrome, print, and screen readers—never relying on color alone:

| Register | CSS Class | Physical Geometry | Typography | Color Permission |
|---|---|---|---|---|
| **Fact** (Harness-measured) | `.prov-frame.prov-fact` | Solid `1px` hairline frame + `2px` **solid** left precision rule + scale mark | Mono `tnum` values (`--text-1`) | Fresh verifier pass may wear `--st-verified`; failures/sentinels may wear `--st-danger`. |
| **Observation** (Agent env) | `.prov-frame.prov-observation` | `1px` **dotted** neutral frame + hollow ring mark | Mono values (`--text-2`) | **Never colored**. Strictly neutral greyscale. |
| **Claim** (Agent prose/log) | `.prov-frame.prov-claim` | `2px` **dashed** left bar + dashed hairline + matte tint + explicit `Agent 称` / `Agent claims` badge | Proportional UI face (`--text-2`), never italic | **Never green**. Cross-check consistency (`Consistent · N facts`) stays neutral; hard refutation wears danger `✕`. |
| **Human** (Your decision) | `.prov-frame.prov-human` | `2px` **solid** primary ink rule (`--text-1`) + `You · HH:MM` stamp | Proportional UI face (`--text-1`) | Uncolored ink authority; immutable audit record. |

### Specialized Provenance Applications

- **Agent-Reported Blocked (`PauseReason::AgentReportedBlocked`)**: Rendered inside a `DecisionCard` with a **dashed Claim frame** for the agent's stated blocker and cited evidence—explicitly signaling that "the agent *claims* the task is impossible/blocked" while giving the human clean options to amend the contract, provide guidance, or abandon.
- **Synthetic Holdout Drafts**: Proposed hidden tests enter as **Claims** (dashed frame, zero green) until the human explicitly edits/ratifies them into `holdout/`, at which point they transition to the **Human** solid-ink register.
- **Visual Evidence (`Look`) + Browser Console Facts**: Screenshots preserve natural viewport proportions (`side`, `onion` slider, pixel `diff`, optional Desktop/Mobile viewport tabs). Captured browser `Console.error` and uncaught `pageerror` entries render directly beneath the shots in a **Fact** frame so runtime JS errors are never hidden by a pretty screenshot.
- **Memory Ratification Taint Physics (`Learning`)**:
  - `TaintLevel::None` (pure human quote or harness fact): solid neutral frame, direct approve/reject.
  - `TaintLevel::Standard` (touched repo files or tool output): amber `◇` border + taint-class chips.
  - `TaintLevel::High` (untrusted external content or instruction-like patterns): danger `■` frame + `--danger-bg` strip; approval is **hard-locked** until the human edits the rule text or enters an explicit confirmation phrase (`docs/09` §9.2.1).

---

## 19.4 Situation Awareness L1 / L2 / L3 Spatial Mapping

Following Endsley's three-level Situation Awareness model (`R4`), Tower maps progressive depth onto four zero-clutter surfaces:

1. **Overview Board (Fleet Scan)**: L1 mode & live action across all goals + L2 dual-track criteria segments + L3 spend/overlap alerts.
2. **`Space` Quick Peek Drawer (`PeekDrawer`)**: Pressing `Space` on any flight strip opens a `440px` right-edge slide-over instrument card **without leaving the board**:
   - **L1 (Perception)**: Large live annunciator (`ModeBadge · tool · target · elapsed`), run/rework counter, overlap warning.
   - **L2 (Comprehension)**: Full dual-track criteria breakdown (red→green, canary intact/tampered, flaky rerun notice, held-out badge) + active sentinels + latest cross-checked claim.
   - **L3 (Projection)**: Budget burn gauge (spent / soft tick / hard cap), wall-clock remaining, next-step claim, branch target.
   - **Direct Actions**: Inline `P` Pause/Resume, `R` Review, `↵` Open Command Deck, `Esc`/`Space` dismiss back to the exact board row.
3. **Goal Command Deck (`GoalPage`)**: Deep single-goal supervision—contract rail, verification ledger, multimodal steering console, and Watch mode.
4. **Review Theater (`Review`)**: Full-window diff workspace (`shell-full` hides the sidebar), split-geometry virtualization, AST noise folding, and the physical Acceptance Seal.

---

## 19.5 Escape Hatches Without Chat Regression

`R3` and `R12` warn against "takeover cliffs" where hiding raw activity hurts diagnosis. Tower provides lossless escape hatches that stay anchored to instrument grammar:

- **Flight Recorder (`Trace`)**: One keypress (`W`) reveals the time-indexed, windowed lossless event stream styled as a vertical instrument rail—never chat bubbles. Structured anomaly-first filters isolate signal in one click:
  - `All` · `Anomalies & Denials` (errors, sandbox denials, sentinels, stalls, failed criteria) · `Tower Injections` (verbatim system prompts, steering injections, rework escalations) · `Decisions & Claims` · `Tools` · `Facts`.
- **Operations & Learning Views**: Dedicated lazy-loaded operational consoles (`⌘3` Learning, `⌘4` Operations) keep cron-scheduled unattended goals, sequential merge queues, disk storage cleanup, memory ratification, and per-model calibration facts cleanly separated from the live Mission Board.

---

## 19.6 OKLCH Surface Calibration, Typography & Budget Discipline

### Surface & Color Architecture
- **Dark — Warm Carbon** (`h=70`, `c=0.004–0.006`): Sidebar `L=0.155` → App `L=0.180` → Strip `L=0.194` → Drawer `L=0.198` → Raised Card `L=0.215` → Hover `L=0.235` → Selected `L=0.265`. Depth is communicated via calibrated lightness steps and 1px hairlines (`--border-grid`), never frosted glass or glow shadows.
- **Light — Warm Parchment** (`h=80–82`, `c=0.002–0.006`): Sidebar `L=0.965` → Well `L=0.952` → Strip `L=0.984` → App `L=0.992` → Raised Card `L=1.000` with warm parchment edges (`--card-edge`).
- **Status Palette Discipline**: Exactly five status hues (`attention` amber, `danger` red, `verified` green, `active` muted slate-blue, `neutral` grey). Status colors tint glyphs, rules, and soft opaque grounds—small body/meta text always stays `--text-1` or `--text-2` to guarantee WCAG AA/AAA (`≥ 4.5:1` / APCA `Lc ≥ 75`) in both themes.
- **Typography & CJK Craft**: `Inter Variable` (display optical sizing `opsz 32` for verdicts/headings) + `JetBrains Mono Variable` (`liga 0, calt 0, tnum 1, zero 1` for exact evidence readability); zero letter-spacing on CJK body/headings, character-measured `em` reading columns for `zh-CN`, and `halt` punctuation compression on single-line instrument strips.

### Motion & Keyboard Velocity
- Zero ambient or decorative loops; keyboard-triggered overlays appear in `0ms`; all transitions honor `prefers-reduced-motion: reduce`.
- Global navigation chord grammar: `⌘1` Overview · `⌘2` Needs You · `⌘3` Learning · `⌘4` Operations · `⌘,` Settings · `⌘K` Command Palette · `N` New Goal · `G` Next Blocking Decision · `?` Live Shortcut Sheet.
- Overview velocity: `J/K` move · `Space` Quick Peek · `↵` Open · `R` Review · `1–9` decide · `Esc` fold/close.

### Engineering & Bundle Budget Guardrails
- Visual craft lives in zero-runtime CSS (`tokens.css`, `base.css`, `app.css`, `console.css`).
- Non-startup views (`PeekDrawer`, `Learning`, `Operations`, `GoalPage`, `Review`, `Settings`, `ContractEditor`, floating panels) load strictly via `lazy(withLater(...))` with secondary dictionary strings in `*.later.ts`, keeping start-up JS ≤ 64 KB, total interface JS ≤ 160 KB, and `GoalPage` ≤ 12 KB gzipped.
