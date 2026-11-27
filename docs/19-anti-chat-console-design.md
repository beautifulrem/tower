# 19 · Anti-"Chat UI Inertia" Console Design Specification

> **Design thesis**: Tower is a **Precision Air-Traffic Control Flight Deck × Swiss Instrument Editorial** console for supervising autonomous coding agents. It explicitly rejects both the **"Chat UI inertia"** of generic AI coding wrappers (chat bubbles, scrolling transcript feeds, session-tree clutter) and **generic SaaS dashboard** tells (KPI stat-card rows, `3px` colored left-border stripes on rounded cards, pill/badge soup, nested box-inside-box Russian dolls, generic boilerplate subtitles, and uppercase sci-fi tracked labels) in favor of calibrated state telemetry, Swiss hanging-gutter provenance, and ≤ 3-second supervisory scannability.
>
> **Builds on**: `docs/00-vision-and-principles.md` (P1–P10, R1–R12), `docs/04-ux-information-architecture.md`, `docs/12-visual-design-system.md`, `docs/18-evolution-roadmap.md`.

---

## 19.1 Why Chat UI & Generic SaaS Dashboards Fail Multi-Agent Supervision

Generic AI coding tools inherited a 1-to-1 conversational metaphor layered with boilerplate LLM dashboard patterns. Under concurrent, long-running multi-agent work, those patterns collapse across five cognitive dimensions:

| Generic Pattern | Cognitive & Operational Failure | Tower Flight-Deck & Swiss Editorial Replacement |
|---|---|---|
| **Session-tree sidebar & uppercase sci-fi branding** | Disposable chat threads accumulate without lifecycle state; tracked uppercase chrome (`╦ TOWER`) and mismatched count pills add visual noise to native macOS chrome. | **Clean Native Rail**: native traffic-light drag strip, core routes (`Overview`, `Needs you`, `Learning`, `Operations`) with uniform right-aligned `tnum` counts, and active **Goals** grouped strictly by supervisory urgency. |
| **Scrolling transcript stream** | Human attention locks onto motion ("Reading… Thinking…"), creating an illusion of progress while hiding whether acceptance criteria actually passed. | **ATC Flight-Strip Board**: fixed-column horizontal instrument rows (`Glyph · Goal · Live · Criteria · Change · Spend · Updated · Identity`) with single-line steerable telemetry and zero decorative animation. |
| **Unverified prose bubbles & dashed inner boxes** | Agent claims share the visual register of harness facts—or overcompensate with chunky nested dashed boxes inside cards. | **Swiss Hanging-Gutter Provenance**: `Fact`, `Observation`, `Claim`, and `Human` hang their source register in a dedicated left gutter (`⚙ Measured`, `○ Observation`, `┆ Agent says`, `You · HH:MM`) with zero box-inside-box clutter. |
| **KPI stat-card rows & 3px striped cards** | Giant 3–4 box KPI headers, generic subtitles repeating the title bar, `3px` colored left card borders, and pill soup (`[Project] [OS sandbox] [L1]`) waste vertical space and obscure real exceptions. | **Structure Felt, Not Seen**: draw each `1px` border once; surface counts as calm inline `tnum` figures in section headers; frame **exceptions only** (ISA-101 / Airbus lights-out). |
| **Chat prompt box for steering** | Encourages conversational back-and-forth instead of scoped contracts, inline diff annotations, and explicit one-way-door approvals. | **Decision Gate Strip** (`1–9` instant actions, `Esc` fold), **Contract Studio** (clause-numbered terms), **Review Theater** (diff-anchored steering dispatch), and **Directive Steering** with multimodal evidence. |

---

## 19.2 The ≤ 3-Second Scannability Budget & Airbus Lights-Out Chrome

At any instant, a single glance at Tower's Mission Board answers the five North-Star supervisory questions (`00` §0.4) without scrolling through prose or scanning past decorative boxes:

1. **Borderless Instrument Title Bar (`TelemetryStrip`)**:
   - **Lights-Out Exception Discipline**: normal readings sit on one quiet, borderless `tnum` baseline—swept `RunsGauge` (`1/4 running`), engine heartbeat, cumulative spend (`$0.11`), sandbox backend (`Seatbelt S2`), quiet hours, remote phone icon, active engine (`Pi`), and a borderless search button (`⌘K`).
   - **Frame Exceptions Only**: the amber needs-you mark (the `!` disc) and its count appear *only* when at least one goal is blocked on a human decision; the sandbox readout acquires an amber frame *only* when unsandboxed (`S0`) or carrying kernel warnings.

2. **Pinned Decision Gate Strip & Understated `36px` Command Line (`Overview`)**:
   - A quiet `36px` quick-start command bar (`›` prompt + inline shortcut hints) spans the board's top edge alongside the project filter.
   - Run-blocking decisions pin above active goals on the exact same horizontal column grid (`DecisionLine`); selecting any line (`j/k`, `Tab`, click) unfolds its `DecisionCard` in place (`1–9` instant choices, `⌘↩` reply, `Esc` fold back), with amber restricted strictly to the focused card's `28px` ECAM header strip.

3. **Horizontal Flight Strips (`GoalRow`)**:
   - **Anchored Flight-Strip Header**: `.flight-strip-head` (`Goal · Live · Criteria · Change · Spend · Updated · Identity`) sits directly inside the first active goal group above `.board-rows`—never floating detached between `Needs you` and `Running`—sharing a single `1px` hairline with the strips below.
   - **Dual-Track Evidence Gauge**: Verified Harness Facts render as solid green precision bars; tampered-canary passes render as solid amber bars (never green); Agent-environment Observations render as **dashed hollow neutral** bars; pending criteria render as crisp outlined hairlines.
   - **Budget Burn Micro-Bar & Inline Overlap Notice**: a `2px` calibrated track beneath the spend figure with a vertical soft-cap tick, plus a quiet inline overlap notice (the outlined `i` mark and `Overlaps G-0004`) without pill boxes.

---

## 19.3 Four-Provenance Swiss Ledger Grammar (Honesty Grammar v2)

Honesty Grammar (`R1`) is enforced through typography, source-gutter geometry, and color permission—distinguishable in monochrome, print, and screen readers without wrapping every register in nested boxes:

| Register | CSS Class | Swiss Hanging-Gutter Geometry | Typography | Color Permission |
|---|---|---|---|---|
| **Fact** (Harness-measured) | `.prov-frame.prov-fact` | Left gutter scale mark (`⚙`) + `11px` `--text-3` label; flat `--danger-bg` tint only on active error blocks | Proportional UI + `.code-val` mono `tnum` (`--text-1`) | Fresh verifier pass glyphs wear `--st-verified`; failures/sentinels wear `--st-danger`. |
| **Observation** (Agent env) | `.prov-frame.prov-observation` | Left gutter hollow ring (`○`) or word-only `1px dashed` `.chip-obs` | `--text-2` | **Never colored**. Strictly neutral greyscale. |
| **Claim** (Agent prose/log) | `.prov-frame.prov-claim` | Hanging `┆` rule (`--text-4`) + kind label (`Cause`, `Next`, `Agent says` in `--text-3`); zero outer dashed box | Proportional UI face (`--text-2`), never italic | **Never green**. Right-aligned `ConsistencyBadge` (`Unsupported` in `--text-3`, `✕ Contradicted` in danger glyph + `--text-1`). |
| **Human** (Your decision) | `.prov-frame.prov-human` | Hanging authority label (`You · HH:MM` in `--text-2`), or `2px` solid ink left rule on `.heldout` / `.chip-you` | Proportional UI face (`--text-1`) | Uncolored primary ink authority; immutable audit record. |

Status is never a text character. The needs-you, danger and notice marks are one drawn family (the `!` disc, the `×` disc, the outlined `i`), and a goal's lifecycle is a ring that turns only while its work moves; `docs/12` §12.6 and `apps/desktop/DESIGN.md` hold the drawing rules. The `⚙` and `○` in the table above are notation for drawn icons (`⚙` is the harness icon), not characters on screen.

### Single-Layer Provenance & Taint Applications

- **Agent-Reported Blocked (`PauseReason::AgentReportedBlocked`) & Holdout Drafts**: Rendered inside `DecisionCard` using the Swiss hanging `┆` Claim gutter—explicitly marking agent-claimed blockers or proposed tests as unverified Claims without drawing a second box inside the card.
- **Visual Evidence (`Look`) + Browser Console Facts**: Screenshots preserve natural viewport proportions (`side`, `onion` slider, pixel `diff`, Desktop/Mobile tabs), with captured `Console.error` / `pageerror` entries rendered directly beneath in a flat `prov-fact.prov-danger` band.
- **Memory Ratification Editorial Ledger (`Learning`)**:
  - Replaces KPI stat boxes, duplicate titles, `3px` left-striped cards, and pill rows with one single-border `.proposal-ledger` divided by `1px` hairlines (`Memory ratification · 3 pending` opposite clean underline tabs `Pending / Approved / Rejected`).
  - Quiet inline metadata (`Project · G-0001 · 14m ago`) surfaces taint glyphs + classes *only* when tainted (the outlined `i` mark with `Taint: standard · agent_tool_output`, or the `×` disc with `Taint: high · external_web, sentinel_flagged`), paired with a hanging provenance row (`Human review` / `Agent claim`) and right-aligned actions.
  - For `TaintLevel::High`, approval stays hard-locked behind a clean bottom hairline `--danger-bg` strip (`CONFIRM` or rule edit, `docs/09` §9.2.1)—zero nested boxes.

---

## 19.4 Situation Awareness Depth Without Spec Leakage

Following Endsley's three-level Situation Awareness model (`R4`), progressive depth maps cleanly onto four surfaces without leaking internal `[L1]` / `[L2]` / `[L3]` spec tags into the UI:

1. **Overview Board (Fleet Scan)**: Live mode & action across all goals + dual-track criteria segments + spend/overlap signals.
2. **`Space` Quick Peek Drawer (`PeekDrawer`)**: Pressing `Space` on any flight strip opens a `448px` right-edge slide-over sheet without leaving the board:
   - **Header**: Goal ID, state, Verified Seal, title, and `.sep`-joined typographic metadata (`Claude Code · Restricted S2 · :20010`, framing only `Experimental` adapters).
   - **Live telemetry**: Large `LiveLine`, run/rework counters, escalated model slug in `.code-val`, and overlap notice.
   - **Evidence & criteria**: Dual-track `CriteriaBar`, per-criterion status list (`Flaky`, `red → green`), sentinels, and hanging-gutter `Cause` claim with cross-check consistency.
   - **Projection & budget**: Calibrated budget bar, `dl` key-value readings, hanging-gutter `Next` step claim, and direct keyboard actions (`P` Pause/Resume, `R` Review, `↵` Open, `Esc`/`Space` close).
3. **Goal Command Deck (`GoalPage`)**: Single-goal supervision—verification ledger, contract rail, directive steering, and Flight Recorder.
4. **Review Theater (`Review`)**: Full-window diff workspace (`shell-full`), split-geometry virtualization, AST noise folding, and the Acceptance Seal.

---

## 19.5 Lossless Escape Hatches & Single-Layer Operations Ledgers

- **Flight Recorder (`Trace`)**: One keypress (`W`) reveals the time-indexed, windowed lossless event stream as a vertical instrument rail (`All`, `Anomalies`, `Injections`, `Decisions & claims`, `Tools`, `Facts`) with plain `tnum` counts.
- **Operations Console (`⌘4`)**: Single-layer operational ledgers without KPI stat cards, `.posture-banner` boxes, or left-striped queue cards:
  - **Scheduled goals**: Unboxed inline creation bar above a single-border schedule table with plain `Unattended strict` posture text.
  - **Merge queue**: Unified tabular ledger (`#1`, goal ID + title + monospace branch + inline `.code-val` conflict paths, `Ready` vs `Conflict` in ink with a plain cross (git's word on the merge, never the verifier's red), right-aligned reorder/reverify/remove controls).
  - **Storage & sandbox**: Inline header totals and sandbox backend status (`Storage & sandbox · 184.0 MB · 92.0 MB reclaimable · macOS Seatbelt (S2)`) directly above a single-border per-goal disk table.

---

## 19.6 OKLCH Surface Calibration, Native macOS Craft & Budget Guardrails

- **Warm Carbon Dark (`h=70`) & Warm Parchment Light (`h=80–82`)**: Depth on the page comes from calibrated OKLCH lightness steps and single `1px` hairlines. There are no frosted panels, glow shadows or nested card borders in the page itself.
- **Floating material, and only there**: Small passing layers that float over content (toasts, popovers such as `@` completion) use a translucent material: `--material-float` behind `--material-filter` (blur and saturation), with a hairline top edge `--material-edge`. You keep your place because the content shows through, blurred. The command palette and the peek drawer are lists you read word by word, so they are opaque (`--bg-overlay`) like every sheet: through a veil the board's own lines showed inside their rows wherever the blur was not composited. Each theme has its own values: Carbon stays dark enough for `--text-2`, and Parchment takes a lighter veil and a white edge. Sheets you read in (`.panel`: shortcuts, verify, request changes) stay opaque. Under `prefers-reduced-transparency: reduce`, or without `backdrop-filter`, every floating layer falls back to the opaque `--bg-overlay`. Corners are concentric: content inside a rounded layer is rounded by the layer's radius minus its inset (`--radius-l` 10 − `--float-inset` 4 = rows at `--radius-m` 6). The status hues and the no-accent rule are unchanged.
- **Five-Color Status Discipline**: Status hues (`attention` amber, `danger` red, `verified` green, `active` slate-blue, `neutral` grey) belong strictly to the `12px` status marks and lifecycle rings, `2px` micro-meters, and focused `28px` decision headers; body and meta text stay `--text-1`..`--text-3` (`≥ 4.5:1` WCAG AA across light and dark).
- **Typography & Native Desktop Physics**: `Inter Variable` + `"PingFang SC"` before `-apple-system`, `"halt" 1` on single-line labels, `--font-mono` (`liga 0, calt 0, zero 1`) strictly on machine values (IDs, SHAs, paths, commands, ports, cron, model slugs), `cursor: default` on controls, `0ms` hover-in / `150ms` hover-out, and `1.5px` achromatic `:focus-visible` outlines.
- **Bundle & Line-Limit Guardrails**: Zero-runtime CSS (`tokens.css`, `base.css`, `app.css`, `console.css`, each source file ≤ 800 lines) and `lazy(withLater(...))` code-splitting keep start-up JS ≤ 64 KB, total interface JS ≤ 160 KB, and `GoalPage` ≤ 12 KB gzipped.
