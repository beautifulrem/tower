# Tower Anti-AI-Slop Frontend Design Audit & Surgical Blueprint

> **Date**: 2026-11-23  
> **Scope**: External 2025–2026 design-engineering benchmark synthesis, forensic visual audit of `apps/desktop/src/` and `assets/screenshots/*.png`, and surgical remediation blueprint across Shell, Overview, PeekDrawer, Learning, Operations, GoalPage, Review, and ContractEditor.  
> **Companion specs**: `docs/12-visual-design-system.md`, `docs/19-anti-chat-console-design.md`, `research/ui-aesthetics-2026.md`.

---

## 1. Executive Thesis: Why "AI Slop" Creeps Into Instrument UIs — and How Tower Eliminates It

Anthropic's frontend aesthetics guidance (*Prompting for Frontend Aesthetics*) and 2025–2026 design-engineering critiques (*Spot the Slop*, *avoid-ai-design*) identify the root mechanism of "AI slop": **distributional convergence**. Because LLMs train heavily on SaaS dashboards, Tailwind UI kits, and shadcn templates, unguarded UI generation regresses toward statistical centroids that fake "visual structure" through additive decoration rather than typographic and spatial architecture:

1. **KPI Stat-Card Grids**: Rows of 3–4 identical bordered metric boxes (`Pending 3 | Models 3 | 1st-pass 85%`) paired with redundant page titles and generic subtitles (`"Schedules, merge queue & disk/sandbox posture."`).
2. **The Colored Left-Border Stripe Crutch**: Gluing a `2px` or `3px` green, amber, or red vertical stripe onto rounded cards (`.proposal-card`, `.mq-row`, `.prov-frame`, `.ev-pill`, `.seal-check`, `.risk-badge`) to simulate hierarchy where alignment and greyscale belong.
3. **Pill & Badge Soup**: Wrapping every piece of normal metadata (`[Pi]`, `[Full S2]`, `[Sandbox S2]`, `[Ports 20000-20009]`, `[Project]`, `[Taint: none]`, `[O Unattended strict]`, `[OS sandbox]`, `[L1]`, `[L2]`, `[L3]`) in `1px` bordered pills until nothing stands out.
4. **Russian-Doll Box-in-Box Nesting**: Placing a dashed or solid bordered `.prov-frame` inside a bordered `.proposal-card` or `.decision` card alongside a bordered `.proposal-guard` box — violating Vercel Geist's **"draw each border once"** law.
5. **Sci-Fi Uppercase Tracking & Spec Leakage**: Rendering `╦ TOWER` or `STEERING DIRECTIVE` in `10.5–11px` uppercase with `0.06em` letter-spacing, or leaking internal architectural labels (`L1`, `L2`, `L3`) onto user-facing badges.
6. **Mixed Form Metaphors**: Rendering heavy SaaS bordered radio cards (`Sandbox tier`) directly above calm unboxed specification radios (`Autonomy`), or jamming full-width dashed dropzones (`Paste or drop screenshots into intent`) flush against neighboring field labels.

### Tower's Core Identity (Preserved 100%)

Eliminating AI slop does **not** mean flattening Tower into a generic minimal note app. Tower's moat is its **Precision Air-Traffic Control Flight Deck × Swiss Instrument Editorial** identity:

- **Goal-Centric Supervision Desk (Anti-"Chat UI Inertia")**: Fixed-column flight strips, `Space` quick-peek telemetry, `1–9` instant Decision Gate actions, clause-numbered Contracts, and diff-anchored Review Theater — zero chat bubbles, zero session-tree sidebars, zero decorative spinners.
- **Four-Provenance Honesty Grammar (`R1`)**: Physical, monochrome-safe separation between **Fact** (Harness-measured), **Observation** (Agent environment), **Claim** (Agent prose/log — *never green*), and **Human** (immutable primary-ink authority).
- **Five-Color Cockpit Law (`R2`, `R5`, ISA-101)**: Exactly five status tokens (`--st-verified` green exclusively for fresh Harness verifier passes on the current tree; `--st-attention` amber exclusively for actionable human decisions; `--st-danger` red for verifier failures, high sentinels, and hard refutations; `--st-active` muted slate-blue for running/verifying glyphs; `--st-neutral` grey for everything else).
- **Calibrated OKLCH Surfaces**: Warm Carbon dark (`h=70`, `c=0.004–0.006`) and Warm Parchment light (`h=80–82`, `c=0.002–0.006`), achromatic focus rings (`--focus`), Inter Variable (`opsz 32` display cut) + JetBrains Mono Variable (`"liga" 0, "calt" 0, "tnum" 1, "zero" 1`), and native macOS desktop ergonomics.

> **The Surgical Rule**: Every pixel on Tower's glass must justify why it is not neutral text on an aligned grid. **Structure is felt through column alignment, luminance steps, and typographic contrast — never painted on with pills, stripes, and nested boxes.**

---

## 2. 2025–2026 External Design Benchmark Synthesis

### 2.1 Linear ("A Calmer Interface", 2025–2026 Refresh)

Linear's architectural UI refresh (*"A calmer interface for a product in motion"*) directly addressed the exact failure mode visible in Tower's secondary console views: as rich capabilities land, borders, badges, and chrome quietly proliferate until chrome competes with content.

| Linear Craft Principle | Measured / Documented Detail | Direct Application to Tower |
|---|---|---|
| **"Don't compete for attention you haven't earned"** | Sidebar luminance stepped down (`#08090a` vs `#0f1011` canvas); team badge colored fills stripped; icons redrawn smaller and quieter. | Strip pill wells from `TelemetryStrip` (`.tel-slots`, `.gauge-sandbox`, `.gauge-cmd`), remove uppercase `╦ TOWER` `.side-brand`, and unify sidebar counters as plain `tnum` numerals. |
| **"Structure should be felt not seen"** | Proliferating `1px` dividers and card wrappers removed; borders softened to `8%` / `12%` / `15%` white alpha; alignment carries table structure. | Delete `.kpi-cell`, `.posture-banner`, `.telemetry-strip` pills, `.ev-pill` wrappers, and nested `.prov-frame` boxes; rely on column alignment and single `1px` hairlines (`--border-subtle` `6%`, `--border-grid` `8%`). |
| **Calibrated LCH Neutrality** | Replaced 98 hand-picked variables with 3-input LCH generation (`base`, `accent`, `contrast`), strictly preventing accent hue bleed into neutrals. | Keep Tower's Warm Carbon (`h=70`) / Warm Parchment (`h=80`) OKLCH scales and **achromatic focus/selection** (`--focus`, `--select-edge`) so amber and verifier green remain pure signals. |
| **Asymmetric Hover Physics** | `--speed-highlightFadeIn: 0s`, `--speed-highlightFadeOut: 150ms` — rows snap under the cursor with zero lag and decay softly behind it. | Enforce `transition-duration: 0ms` on `:hover` and `150ms linear` on leave across all rows, tabs, and buttons. |

### 2.2 Native-Grade macOS Developer Tools (Raycast v2, Zed, Sublime Merge, Kaleidoscope, Things 3)

| Benchmark | Defining Craft Decisions | Direct Application to Tower |
|---|---|---|
| **Raycast macOS v2** | Explicitly bans `cursor: pointer` (*"immediately signals 'this is a website'"*); omits gratuitous hover chrome on static controls; uses native `NSMenu` popups; borderless translucent keycaps (`--kbd-bg`); `0ms` keyboard response. | Keep `cursor: default` globally on `button, [role="button"], a`; borderless `.kbd` (`3px` radius, `6%` alpha tint); native `Menu.popup()` for overflow/select menus; compact `36px` quick-start command prompt (`›`). |
| **Zed Editor** | Pairs `IBM Plex Sans` + `Lilex` (same typographic skeleton) with semantic font aliases and tight UI density (`compact` / `default` / `comfortable`); panels divide space with single `1px` hairlines rather than floating cards. | Keep `--font-ui` / `--font-mono` discipline; shrink inline mono to `max(0.923em, 11.5px)` so JetBrains Mono x-height (`0.550`) matches Inter (`0.546`) without "code larger than words". |
| **Sublime Merge & Kaleidoscope** | Diff files sit in crisp single-border frames (`6px` radius) with quiet file headers (`Modified` in muted ink, path in primary mono) and single-hairline hunk headers; Kaleidoscope pioneered `1 / 2 / 3` Side / Onion / Diff comparison with `Space` hold-for-before. | Remove stacked double borders between `.file-head` and `.hunk-head`, replace dashed `.unit-narrative` card + `.risk-badge` pills above diffs with a single quiet editorial line, and flatten `Look` console error readouts beneath screenshots. |
| **Cultured Code Things 3** | Hierarchy comes almost exclusively from **whitespace, font weight, and three greyscale values** — never boxes inside boxes; controls stay quiet until needed; spatial transitions (`220ms`) explain place changes while keyboard sheets open in `0ms`. | Apply `4px`-grid vertical breathing room in `ContractEditor` (`ClauseHead`, field groups, inline attachment row) and flatten `Learning` ratification proposals into clean paper-like sheets/rows. |

### 2.3 Design Engineering & Anti-Slop Craft (Vercel Geist, Freiberg / Kowalski / Coursey, Anthropic)

- **Vercel Geist Border & Typography Laws**:
  - **Draw Each Border Once**: Semi-transparent `oklch` borders (`6%–14%` alpha) brighten visibly where two boxes touch or nest. Adjacent rows share a single `border-bottom: 1px solid var(--border-subtle)`; a table inside a section never wraps itself in a second outer `.prov-frame` box.
  - **Label vs Copy Line-Height Split**: Single-line UI rows, buttons, and metadata use fixed pixel label line-heights (`13px/20px`, `12px/16px`) across Latin and CJK so `1x` and `2x` baselines never jitter; multi-line prose (`.reading`) uses `14px/22px` (`24px` in `zh-CN`).
  - **Tabular Figures Everywhere Readings Align**: `font-variant-numeric: tabular-nums` (`.num`) on all counts, durations, percentages, diffs, and dollar figures.
- **Rauno Freiberg, Emil Kowalski & Paco Coursey (Interaction Precision)**:
  - Tactile `0.5px` active press (`transform: translateY(0.5px)`), `cubic-bezier(0.23, 1, 0.32, 1)` ease-out-quint entrances (`160ms`), faster exits (`100ms`), FLIP row group transitions (`220ms`), and `⌘K` toggle-close focus restoration.
  - Restraint in command interfaces (`cmdk`): group headings are quiet `11–12px` labels in `--text-3` without uppercase letter-spaced boxes; shortcut hints sit flush right in muted mono.
- **LLM SaaS Slop Tell Taxonomy & Tower Counter-Measures**:

| # | Classic AI Slop Tell | Where It Appeared in Tower (`HEAD`) | High-Craft Instrument Replacement |
|---|---|---|---|
| 1 | **3–4 KPI Stat-Card Grid** at top of dashboard | `Learning.tsx` (`Pending 3 \| Models 3 \| 1st-pass 85%`) & `Operations.tsx` (`Scheduled 2 \| Merge queue 2 \| Total 184 MB \| Reclaimable 92 MB`) via `ConsoleMast` / `.kpi-cell` | Delete `ConsoleMast` completely (`TitleBar` already names the route); place `tnum` counts inline inside section headers (`Memory ratification · 3 pending`). |
| 2 | **Duplicate H1/H2 + Boilerplate Subtitle** | `Learning` (`"Memory ratification queue & verifier calibration facts."`) & `Operations` (`"Schedules, merge queue & disk/sandbox posture."`) | Delete redundant route heading + subtitle; open directly with the primary operational section. |
| 3 | **`3px` Colored Left-Border Card Stripes** | `.proposal-card.taint-level-standard` (`3px` amber), `.taint-level-high` (`3px` red), `.mq-row.mq-ready` (`3px` green — **also violates `R2` when unmerged!**), `.mq-conflict` (`3px` red), `.ev-pill-*`, `.seal-check-*`, `.risk-badge` | Delete all `2px`/`3px` colored left stripes on cards/rows; communicate state via calibrated `10px` glyphs (`◆`, `■`, `✓`) and inline text on clean `1px` hairline rows. |
| 4 | **Pill / Badge Vomit** | `GoalPage` `.telemetry-strip` (`[Pi] [Full S2] [Sandbox S2] [Ports…]`), `CriterionRow` `.ev-strip` (`.ev-pill`), `PeekDrawer` (`[Restricted S2] [:20010]`), `TitleBar` (`.tel-slots`, `.gauge-sandbox`), `Operations` (`[O Unattended strict]`, `[OS sandbox]`, conflict file pills) | Zero-pill metadata grammar: plain `12px` text joined by UI-font `.sep` (`·`), framing **only** genuine anomalies (`Experimental` engine, unsandboxed `S0`). |
| 5 | **Russian-Doll Box-in-Box Nesting** | `Learning` (`ProposalCard` → `.prov-frame` dashed box + `.proposal-guard` red box), `Operations` (`.prov-frame` wrapping `.data-table-wrap`), `PeekDrawer` (`.prov-claim` dashed boxes inside `.peek-band`), `DecisionCard` (`.prov-claim` inside `.decision`) | Single-layer Swiss hanging provenance gutter (`6em–7.5em` left label column + clean body text); tables stand on their own single `1px` frame without outer `ProvBox` wrappers. |
| 6 | **Internal Spec Jargon Leaked as Badges** | `PeekDrawer.tsx` rendering `[L1]`, `[L2]`, `[L3]` `.peek-level` mono badges on section headers | Delete `.peek-level` badges completely; section titles (`Live telemetry`, `Evidence & criteria`, `Budget & projection`) speak for themselves. |
| 7 | **Uppercase Wide-Tracked Sci-Fi Labels** | `Sidebar` `.side-brand` (`╦ TOWER`, `uppercase`, `0.06em`), `SteerBox` `.steer-title` (`STEERING DIRECTIVE`), `GoalBlocks` `.ledger-cols-head` (`uppercase`, `0.06em`) | Remove uppercase + tracking from UI chrome and section headers (preserving **only** `.contract-mast`, an intentional editorial document masthead verified by `type.spec.ts`). |
| 8 | **Inconsistent Sibling Form Controls** | `ContractEditor` Clause 04: `Sandbox tier` uses heavy bordered `.tier-card` boxes directly above `Autonomy` plain `.radio` rows | Unify both into calm, unboxed specification `.radio` rows (`accent-color: var(--text-1)`, bold title `text-1`, 1-line description `text-3`). |

### 2.4 Industrial & Aviation Restraint (ISA-101, Airbus Dark Cockpit, Dieter Rams, Teenage Engineering)

- **ISA-101 ("Gray Is Normal; Color Is Strictly an Exception")**: At least 90% of pixels in steady state remain neutral greyscale. Green never means "enabled/ready/online" (fixing `.mq-row.mq-ready` and `.trust-full` green tints!).
- **Airbus Lights-Out & ECAM Header Strip**: When a goal needs human intervention, amber illuminates **only** the `28px` `.decision-head` strip (`◆ CI failed` left, `39m ago` right) over a calm `--bg-raised` card body — never flooding entire cards or sidebars. Meanwhile, `TelemetryStrip`'s quiet engine reading (`Engine Pi`) proves the cockpit is powered rather than frozen.
- **Dieter Rams / Teenage Engineering**: Grid discipline (`4px` spatial unit, aligned tabular columns across stacked sections) and material honesty (`--font-mono` with zero ligatures for machine evidence; proportional UI type for human/agent language).

---

## 3. Tower Visual Physics Blueprint (Tokens, Provenance & Typography)

### 3.1 Surface & Border Architecture (`tokens.css`)

Keep the calibrated OKLCH Warm Carbon (`dark`) and Warm Parchment (`light`) tokens intact:

| Layer | Dark (`Warm Carbon`, `h=70`) | Light (`Warm Parchment`, `h=80`) | Architectural Role |
|---|---|---|---|
| `--bg-sidebar` | `oklch(0.155 0.004 70)` | `oklch(0.965 0.004 80)` | Receding navigation rail (Linear luminance law) |
| `--bg-field` | `oklch(0.170 0.004 70)` | `oklch(1 0 0)` | Page-level inputs (cards use `--bg-app` inside raised surfaces) |
| `--bg-app` | `oklch(0.180 0.004 70)` | `oklch(0.992 0.002 80)` | Primary workspace canvas & `TitleBar` |
| `--bg-strip` | `oklch(0.194 0.005 70)` | `oklch(0.985 0.004 82)` | Table headers, `PeekDrawer` header/footer, subtle bands |
| `--bg-drawer` | `oklch(0.198 0.005 70)` | `oklch(0.996 0.002 82)` | Slide-over `PeekDrawer` body |
| `--bg-raised` | `oklch(0.215 0.005 70)` | `oklch(1 0 0)` | Cards, ledgers, diff frames (`+0.035 L` above dark canvas) |
| `--bg-hover` | `oklch(0.235 0.005 70)` | `oklch(0.955 0.004 80)` | Instant `0ms` hover highlight, `150ms` fade-out |
| `--bg-selected` | `oklch(0.265 0.006 70)` | `oklch(0.940 0.006 80)` | Active sidebar row / selected tab |
| `--border-subtle` | `oklch(1 0 0 / 0.06)` | `oklch(0.20 0.01 70 / 0.08)` | Row dividers, section hairlines |
| `--border-grid` | `oklch(1 0 0 / 0.08)` | `oklch(0.20 0.01 70 / 0.10)` | Instrument grid lines, scale rules |
| `--border` | `oklch(1 0 0 / 0.10)` | `oklch(0.20 0.01 70 / 0.14)` | Controls, inputs, single-frame tables |

**Strict Containment Rules**:
1. **One border per boundary**: Never wrap a `.data-table-wrap` inside a bordered `.prov-frame`, and never wrap a `.prov-frame` box inside a bordered `.proposal-card` or `.decision` card.
2. **Zero left-border color stripes**: Ban `border-left: 2px/3px solid var(--st-*)` on cards, rows, and badges.
3. **Frame exceptions only**: Default `Full S2` / `Restricted S2` / `Seatbelt S2` / `Unattended strict` / `Taint: none` render as unframed text. Only degraded/unsafe states (`Experimental` engine, `S0` no-sandbox `.warn`, `Observation` word chip `.chip-obs`) wear a hairline/dashed frame.

### 3.2 Unified Four-Provenance Visual Grammar (Swiss Hanging Gutter — Honesty Grammar v3)

Tower's original `HonestyCore.tsx` (`.claim` and `.human-line` in `app.css:570-634`) already nailed the Swiss editorial ledger: **a fixed-width hanging source gutter on the left, clean content in the middle, and verification/consistency metadata flush right — zero boxes**. By contrast, `.prov-frame` in `console.css:14-95` introduced boxy bordered/dashed cards with `2px` left stripes that create box-in-box clutter whenever placed inside `PeekDrawer`, `Learning`, `Operations`, `DecisionCard`, or `Review`.

**Unified Specification for `.prov-frame` (`ProvenanceFrame.tsx` + `console.css`)**:

```css
.prov-frame {
  display: grid;
  grid-template-columns: minmax(6.5em, 8em) minmax(0, 1fr) auto;
  column-gap: var(--sp-3);
  align-items: baseline;
  padding: 4px 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  min-width: 0;
}
```

| Register | Gutter Glyph & Label (`11px`, `halt`) | Content Typography | Color & Frame Law |
|---|---|---|---|
| **Fact** (`prov-fact`) | `<Icon name="harness" size={10} />` (`--text-3`) + label (`Measured` / `Sentinels` / `Console errors`, `--text-3`) | `--text-1`; machine values in `.code-val` / `.num` (`tnum`) | Unboxed in normal state (facts are the cockpit baseline). Fresh verifier pass/fail glyphs wear `--st-verified` / `--st-danger`. If `danger` block (e.g., `look-console`), use a flat `1px` top hairline or subtle `--danger-bg` band — no `3px` stripe. |
| **Observation** (`prov-observation`) | `<Icon name="ring" size={10} />` (`--text-3`) or word-only `1px dashed var(--border-strong)` `.chip-obs` | `--text-2`; `.code-val` on commands/counts | **Strictly uncolored greyscale**. Dashed border lives only on the compact `.chip-obs` word, never wrapping multi-line blocks. |
| **Claim** (`prov-claim`) | `┆` (`--text-4`) + kind (`Agent says`, `Cause`, `Next`, `Tainted claim` in `--text-3`) | Proportional `--font-ui`, `--text-2`, never italic | **Never green. Zero dashed outer box. Zero matte card fill.** Right-aligned `ConsistencyBadge` (`Unsupported` in `--text-3`; `✕ Contradicted` in danger glyph + `--text-1`). |
| **Human** (`prov-human`) | `You · HH:MM` or `Human review` (`--text-2`, `500` weight) | Proportional `--font-ui`, `--text-1` primary ink | Uncolored primary-ink authority; optional `2px solid var(--text-1)` mark only on compact inline `.chip-you` (`Held-out tests`). |

### 3.3 Zero-Pill Metadata & CJK/Latin Typography Rules

1. **Middle-Dot Separator (`.sep`)**: Metadata items on one line join with `<span class="sep">·</span>` (`--font-ui`, `--text-3`, `padding: 0 0.35em`, zero literal spaces around `·`), or clean `12px` column gaps — never pills.
2. **Monospace Strictly on Machine Tokens**: `--font-mono` (`max(0.923em, 11.5px)`, `"liga" 0, "calt" 0, "zero" 1`) wraps **only** goal IDs (`G-0001`), commit pins (`@c54717e`), file paths/globs (`src/**`), CLI commands (`pnpm test`), ports (`20000–20009`), cron strings (`0 2 * * 1-5`), and model slugs (`anthropic/claude-sonnet-4-5`). Human labels, units (`files`, `min`, `ago`), and separators stay in `--font-ui`.
3. **CJK Optical Discipline**: `"PingFang SC"` sits ahead of `-apple-system` in `--font-ui`; single-line labels carry `.halt` (`"halt" 1` halves full-width CJK punctuation); `:root[lang="zh-CN"]` sets `--measure: 40em`, `--measure-short: 28em`, and zero letter-spacing on headings/body.

---

## 4. Screen-by-Screen Forensic Audit & Surgical Fixes

### 4.1 Shell: TitleBar Telemetry Strip & Operational Sidebar (`@craft-shell`)

**Forensic Findings (`overview.png`, `TelemetryStrip.tsx`, `Sidebar.tsx`, `console.css:196-335`)**:
- `TitleBar` wraps `1/4 running` in a dark inset `.tel-slots` pill box with 4 tiny vertical `.tel-lamp` bars, wraps `macOS Seatbelt (S2)` in a `.gauge-sandbox` pill box, wraps `◆ 4` in a bordered `.tel-blocking` box, and places vertical `.tel-sep` ticks between items — turning a quiet status bar into a row of bordered buttons.
- `Sidebar` renders `╦ TOWER` in `.side-brand` (`font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase`) next to the macOS traffic-light drag zone — a textbook AI-dashboard template tell.
- Sidebar counts use three inconsistent treatments simultaneously: `Needs you 4` wears an amber `.side-row-alert .side-count` pill, `To review 2` and `Operations 1` are plain `num` text, and `Learning 3` wears a grey `.side-count-pill` box (`Sidebar.tsx:99-130`).

**Surgical Fixes**:
- **`TelemetryStrip.tsx` & `console.css`**: Strip borders, `.bg-well` backgrounds, `.tel-lamps`, and `.tel-sep` dividers off `.tel-slots`, `.gauge-sandbox` (when normal), and `.gauge-cmd`. Render one calm, borderless baseline of tabular readings (`◆ 4` in amber glyph + `--text-1` numeral when blocking > 0; swept `RunsGauge` + `1/4 running`; heartbeat age; `$0.11`; plain `macOS Seatbelt (S2)` that gains `--attention-bg` tint **only** when `.warn` unsandboxed; quiet hours bell; `Engine Pi`; borderless search icon button).
- **`Sidebar.tsx` & `console.css`**: Delete `.side-brand` from `.sidebar-drag` so the macOS traffic-light region stays clean and native. Delete `.side-count-pill` and `.side-row-alert .side-count` background boxes; render every sidebar counter as a uniform right-aligned `.num.side-count` (`--text-1` when actionable/non-zero, `--text-3` otherwise), letting the left `NeedsYouMark` (`◆`) carry the amber signal once.

### 4.2 Overview Mission Board (`@craft-shell`)

**Forensic Findings (`overview.png`, `Overview.tsx:207-247`, `GoalRow.tsx`, `console.css:340-452`)**:
- **Detached Column Header Bug**: In `Overview.tsx:226-228`, `<BoardCols class="flight-strip-head" />` (`Goal | Live | Criteria | Change | Spend | Updated | Identity`) is rendered **above** `<For each={groups()}>`, which places it directly underneath the `Needs you 4` decision lines and *above* the `Running 1` `.scale-title` hairline! Visually, the column headers look like a footer for `Needs you` rather than headers for the Goal flight strips.
- **Boxy Row Pills**: `GoalRow.tsx:125` wraps concurrent file overlaps in `.overlap-pill` (`border: 1px solid var(--border-strong); background: var(--bg-well)`), and `.g-peek-btn` draws a bordered micro-box on hover.
- **Quick-Start Bar**: Needs to stay a crisp, understated `36px` command line (`›` prompt, plain `11px` `--text-3` shortcut hints without heavy chrome).

**Surgical Fixes**:
- **`Overview.tsx`**: Move `<BoardCols class="flight-strip-head" />` inside the first Goal group (below its `.scale-title` heading, directly above its `.board-rows`), or integrate column labels cleanly with the first active Goal group so every column header sits directly over its readings (`Goal · Live · Criteria · Change · Spend · Updated · Identity`).
- **`GoalRow.tsx` & `console.css`**: Replace `.overlap-pill` box with quiet inline `<NoticeMark /> <span class="code-val">G-0004</span>` (`--text-2`). Keep `.quick` at `36px` height, `6px` radius, mono `›` prompt, and borderless `.kbd` hints in `.board-keys`.

### 4.3 Quick Peek Slide-Over Drawer (`@craft-shell`)

**Forensic Findings (`peek.png`, `PeekDrawer.tsx:87-163`, `console.css:485-575`)**:
- **Spec Leakage**: Each section header renders `[L1]`, `[L2]`, `[L3]` inside bordered `.peek-level` mono badges (`PeekDrawer.tsx:100, 113, 146`) — leaking Endsley's theoretical SA levels (`docs/19 §19.4`) into the UI.
- **Header Pill Clutter**: Under the title, `Claude Code` is followed by bordered `[Restricted S2]` (`TrustPill`) and `[:20010]` (`.posture-pill`) boxes (`PeekDrawer.tsx:87-95`), plus another `.posture-pill` for `escalated_model` in L1 (`line 105`).
- **Dashed Box Clutter**: `Cause` (`line 138`) and `Next` (`line 159`) are wrapped in full-width dashed `ProvBox` (`.prov-claim`) containers inside an already-narrow `448px` drawer.

**Surgical Fixes**:
- **`PeekDrawer.tsx` & `console.css`**: Delete `<span class="peek-level">L1/L2/L3</span>` and `.peek-level` CSS completely.
- Replace `[Restricted S2]`, `[:20010]`, and `escalated_model` pills with calm `.sep`-separated plain metadata (`Claude Code · Restricted S2 · :20010`), framing **only** `Experimental` (`trust-experimental`).
- Render `Sentinels`, `Cause`, and `Next` via the unboxed hanging provenance gutter (`6.5em` left label + clean text + right-aligned `Unsupported` in `--text-3`).

### 4.4 Learning Console (`@craft-shell`)

**Forensic Findings (`learning.png`, `Learning.tsx`, `console.css:682-833`)**:
- `Learning` is the single densest concentration of SaaS AI slop in the app:
  1. `ConsoleMast` (`lines 193-201`) duplicates the `TitleBar` `"Learning"` title, adds generic subtitle `"Memory ratification queue & verifier calibration facts."`, and renders 3 `.kpi-cell` stat cards (`Pending 3`, `Models 3`, `1st-pass 85%`).
  2. `ProposalCard` (`lines 125-173`) paints `3px` solid amber/red left borders (`.taint-level-standard`, `.taint-level-high`), renders a pill bar (`[Project] [Taint: none/standard/high]`), nests a full-width bordered/dashed `ProvBox` inside the card (`lines 141-150`), and for high taint nests *another* red-bordered `.proposal-guard` box (`lines 152-157`) — three concentric boxes!
  3. `Calibration` (`line 228`) wraps `DataTable` (which already has `.data-table-wrap` border) inside a `ProvBox kind="fact"` (`border + 2px left rule`), creating a literal double-bordered table, plus `[Low sample]` `.posture-pill` inside cells.

**Surgical Fixes**:
- **`Learning.tsx` & `console.css`**: Delete `ConsoleMast` JSX and `.console-mast` / `.console-kpis` / `.kpi-cell` CSS.
- Put inline tabular summary counts directly in section headers: `Memory ratification · 3 pending` on the left, clean text/underline status tabs (`Pending · Approved · Rejected`) on the right; `Model calibration · 3 models · 85% 1st-pass` above the table with `ProjectFilter` and `Retry`.
- Flatten `Memory ratification` into a single-layer editorial ledger (single `1px` container with `1px` `--border-subtle` dividers between items, or clean flat `1px` sheets with **zero** `3px` left stripes and **zero** inner boxes):
  - Quiet inline header line: `Project · G-0001 · 14m ago` (when `taint_level === "none"`, show **no** taint badge at all — normal is quiet! When `standard`: `◆ Standard taint · agent_tool_output`; when `high`: `■ High taint · external_web, sentinel_flagged` as glyph + plain text).
  - Rule text in `14px/22px` `--text-1`.
  - Provenance rendered as one unboxed hanging-gutter line (`Human review` or `┆ Agent claim` left, origin/detail/inline `.code-val` evidence right).
  - For `high` taint pending items: a clean bottom confirmation bar separated by `border-top: 1px solid var(--border-subtle)` with subtle `--danger-bg` tint (`■ High taint: edit rule or type CONFIRM` + inline input + actions) — zero nested box.
- Unwrap `DataTable` from `ProvBox` in `Calibration` (add a quiet `⚙ Verified harness facts` caption in the section header instead) and replace `[Low sample]` pill with muted `· low sample` text (`--text-3`).
- **Keep all lazy re-exports at lines 20–33 of `Learning.tsx` untouched** so `App.tsx` Vite chunking stays identical.

### 4.5 Operations Console (`@craft-shell`)

**Forensic Findings (`operations.png`, `Operations.tsx`, `console.css:838-905`)**:
- `ConsoleMast` (`lines 78-86`) duplicates `"Operations"`, adds boilerplate subtitle `"Schedules, merge queue & disk/sandbox posture."`, and draws 4 `.kpi-cell` stat cards.
- `Scheduled goals` (`line 108`) puts a bordered `[O Unattended strict]` `.posture-pill` on every single table row.
- `Merge queue` (`lines 139-164`) renders separate `.mq-row` cards with `3px` solid **green** (`mq-ready` — violating `R2`, since queue readiness is not a fresh verifier pass!) and `3px` solid **red** (`mq-conflict`) left stripes, `[Ready]` / `[■ Conflict]` `.posture-pill` boxes, and `[src/cart.js]` `.posture-pill` wrappers around conflict paths.
- `Storage & sandbox` (`lines 174-203`) renders a mostly empty full-width `.posture-banner` box (`macOS Seatbelt (S2) [OS sandbox]`) above a `ProvBox` double-wrapping `DataTable`.

**Surgical Fixes**:
- **`Operations.tsx` & `console.css`**: Remove `ConsoleMast`. Fold counts into section headers (`Scheduled goals · 2 active`, `Merge queue · 2`, `Storage & sandbox · 184.0 MB · 92.0 MB reclaimable`).
- In `Scheduled goals`: keep the clean inline creation bar (`schedule-form` with `1px` `--border` and `6px` radius) and render posture as plain `--text-2` text (`Unattended strict` / `Standard`) without `.posture-pill`.
- In `Merge queue`: convert `.mq-list` / `.mq-row` into a unified `DataTable` or single-frame hairline ledger (`#1`, `G-0001` + title + mono branch, status `Ready` in `--text-2` vs `<DangerMark /> Conflict` in `--text-1` with inline `.code-val` conflict file paths separated by spaces/commas, and compact right-aligned `↑ ↓ Reverify Remove` controls) — **zero green/red `3px` left stripes, zero conflict pills**.
- In `Storage & sandbox`: delete `.posture-banner` and unwrap `DataTable` from `ProvBox`; display sandbox posture (`macOS Seatbelt (S2) · MicroVM unavailable` + any warnings) as a single quiet inline metadata row directly under the section header next to `Clean (92.0 MB)`.

### 4.6 Goal Command Deck (`@craft-workbenches`)

**Forensic Findings (`goal.png`, `GoalPage.tsx`, `views/goal/{GoalBlocks,CriterionRow,ContractRail,SteerBox}.tsx`, `deck.css`)**:
- **Header Pill Vomit (`GoalPage.tsx:112-128, 171-173`)**: Directly beneath `G-0001 · shop · Contract v1 · Run 1`, `.telemetry-strip` renders 4–6 bordered `.tel-pill` boxes (`[Pi] [Full S2] [Sandbox S2] [Ports 20000-20009]`), repeating exact data already shown in the right-hand `ContractRail` (`Scope fence › Ports`, `Autonomy › Sandbox`, `Engine › Full S2 / Pi default`)!
- **Six-Step Criterion Pill Soup (`CriterionRow.tsx:32-64, 107-118`, `deck.css:57-162`)**: Every verified criterion spawns `.ev-strip` containing up to 6 left-striped `.ev-pill` boxes (`Base→Pin proved`, `Source-only ✓`, `Canary intact`, `Assertion guard ✓`, `Flaky…`, `Console errors…`) plus a Human-striped `.ev-holdout-files` box with `.ev-hf` file pills — duplicating `BaselineLine`, `CanaryLine`, `HeldOutLine`, and `LoopbackLine` immediately below it!
- **Boxy Two-Column Honesty Ledger (`GoalBlocks.tsx:218-230, 333-354`, `deck.css:165-250`)**: `.ledger-cols-head` uses uppercase `0.06em` tracking, and each `.ledger-pair` draws a dashed `.ledger-claim-cell` box beside a left-striped `.ledger-fact-cell` box.
- **Contract Rail Scope & Dependency Pills (`ContractRail.tsx:59, 109-113`, `deck.css:253-325`)**: `src/**`, `test/**`, `package.json` are wrapped in bordered `.scope-chip` boxes instead of clean mono paths.
- **Steering Console & Flight Recorder (`SteerBox.tsx`, `Trace.tsx`, `Look.tsx`, `deck.css:368-458`)**: `.steer-console` has a `2px` solid left border and uppercase tracked `STEERING DIRECTIVE` `.steer-title`; `Trace` filter tabs carry `.trace-tab-count` pill boxes and `.trace-denied-tag` red boxes; `Look` wraps console errors in a boxy `ProvenanceFrame`.

**Surgical Fixes (`GoalPage.tsx`, `views/goal/**`, `styles/workbenches.css`)**:
- **`.goal-head`**: Delete `.telemetry-strip` pill row! Fold only non-duplicated engine identity (`Pi` / `Claude Code`) into `.goal-identity` via `.sep` (`G-0001 · shop · Contract v1 · Run 1 · Pi`), and render a compact exception badge **only** when `trustTier === "experimental"` or `no_sandbox` (`S0`) or `escalated_model` is active.
- **`DecisionCard`**: Keep the Airbus ECAM `28px` `.decision-head` amber strip over a calm `--bg-raised` card (`1px solid var(--card-edge)`, `6px` radius), and ensure `agentBlocked` / `holdoutDraft` claims inside it render with the unboxed hanging gutter rather than a nested dashed box.
- **`CriterionRow.tsx`**: Replace `.ev-strip` / `.ev-pill` left-striped boxes and `.ev-holdout-files` box-in-box pills with either Tower's native quiet sub-rows (`BaselineLine`, `CanaryLine`, `HeldOutLine`, `LoopbackLine` — which already cover red→green, source-only, canary, held-out files, and loopback!) plus one quiet `ObsRow` for any remaining sentinel/flaky/console-error note (`◇ Flaky · 1× rerun passed` or `■ 2 console errors`), eliminating both visual duplication and pill clutter.
- **`Honesty Ledger` (`GoalBlocks.tsx`)**: Remove uppercase tracking from `.ledger-cols-head`; replace `.ledger-claim-cell` dashed box and `.ledger-fact-cell` striped box with flat, `1px` `--border-subtle` hairline-divided rows (`┆ C1 …` in `--text-2` on the left, `↔` in `--text-4`, `<ConsistencyBadge />` + evidence on the right).
- **`ContractRail.tsx`**: Remove `.scope-chip`, `.dep-chip`, and `.esc-active` pill boxes; render scope globs as clean inline `.code-val` tokens (`--text-1` for include, `--text-2` for readonly/exclude) separated by spaces/commas on the aligned two-column `rail-dl` grid.
- **`SteerBox.tsx`, `Look.tsx` & `Trace.tsx`**: Remove `border-left: 2px solid` and uppercase tracked `.steer-title` on `.steer-console` (use normal-case `12px` `--text-2` label + clean mode switch); flatten `Look` console errors into a compact hairline list under the thumbnails; render `Trace` tab counts as plain `tnum` numerals (`Anomalies 2`) without pill boxes.

### 4.7 Review Theater (`@craft-workbenches`)

**Forensic Findings (`review.png`, `Review.tsx`, `views/review/{notes,panels,Timeline,FileDiff}.tsx`, `theater.css`)**:
- **Header Segmented Box**: `All changes | Last turn | Compare runs…` sits inside a heavy pill container next to dense mono stats.
- **Pre-Reading Dashed Card + Striped Risk Pills (`notes.tsx:25-47`, `theater.css:63-122`)**: `UnitNarrative` renders a full-width dashed `.unit-narrative` box containing `┆ Agent claims why` and left-striped `.risk-badge` boxes (`border-left: 2px solid`, `◆` / `■` pseudo-elements) directly above `ReviewNotes` — creating two stacked banners before the first diff file.
- **Accept Sheet Striped Boxes (`panels.tsx:312-323`, `theater.css:145-195`)**: `AcceptPanel` renders 4 `.seal-check` boxes with `2px` green/amber/red left stripes (`Snapshot fresh`, `0 high sentinels`, `Human checks clear`, `Merge prediction clear`), and `ChangesPanel` renders a left-striped `.dispatch-head` box + `.dispatch-pill` amber footer pill.
- **Noisy Bottom Status Rail (`Review.tsx:615-687`)**: Packs 9 keyboard hint groups + 2 mouse prose sentences (`click a line number or + to comment`, `⌘-click a line number to open in editor`) + hunk counter + unit counter across the bottom bar.

**Surgical Fixes (`Review.tsx`, `views/review/**`, `styles/workbenches.css`)**:
- **Header**: Render `TimelineSwitcher` (`All changes · Since last review · Last turn · Compare…`) as understated inline text/underline tabs without a heavy outer pill frame; keep `Seal` (`Verified @c54717e`) and `CriteriaBar` crisp.
- **Unit Pre-Reading & Diff Frames**: Render `UnitNarrative` as a quiet hanging-gutter `Claim` line (`┆ Agent claims why` left, claim prose middle, inline `■` / `◇` risk text right — zero dashed card, zero `.risk-badge` boxes). Keep `.file` as a single `1px solid var(--card-edge)` (`6px` radius) container with `--bg-raised` header (`Added`/`Modified` in `--text-3`, mono path in `--text-1`) and single-hairline hunk headers (no double borders on `.semantic-fold` / `.vdiff-badge`).
- **`AcceptPanel` & `ChangesPanel`**: Replace `.seal-check` striped boxes with a clean 2×2 typographic readout (`✓` / `◆` / `■` glyph + `--text-1`/`--text-2` label on a subtle top/bottom hairline grid); remove `.dispatch-head` left stripe.
- **Bottom Status Bar**: Trim `.review-status` to essential keyboard chords on the left (`J K units · ] [ hunks · V viewed · A accept · ? all keys`, plus inline steering count when `comments().length > 0`) and tabular `Unit 1 / 2` + accepted hunk count on the right (drop the two verbose `.status-mouse` prose instructions — `?` ShortcutSheet documents them).

### 4.8 Contract Studio / Editor (`@craft-workbenches`)

**Forensic Findings (`contract.png`, `ContractEditor.tsx`, `views/goal/HoldoutDrafts.tsx`, `deck.css:487-587`)**:
- **Visual Clash in Clause 04 (`ContractEditor.tsx:317-357`, `contract.png` right column)**: `Sandbox tier` renders two heavy bordered `.tier-card` boxes (`Default OS Sandbox` highlighted with a bright border + raised fill, `MicroVM` in a dark box) immediately above `Autonomy`, which renders three clean, unboxed `.radio` rows (`Cautious`, `Standard`, `Autonomous`). They are both single-choice radio specifications in the exact same clause yet look like they came from two different apps!
- **Cramped Dashed Dropzone (`ContractEditor.tsx:195-206`, `contract.png` left column)**: `.att-drop-zone` (`border: 1px dashed var(--border); background: var(--bg-well)`) spans the full reading column directly beneath `Purpose`'s helper caption and sits **0–4px** above the `Done when (optional)` label — visually colliding with the next field.
- **Nested Dashed Holdout Draft Boxes (`deck.css:507-528`)**: `.holdout-panel` draws a dashed box with a `2px` dashed left border containing `.holdout-draft` dashed boxes inside it.
- **Helper Caption Bloat**: Several fields stack label + placeholder + multi-sentence `.field-hint` where the label and `e.g.` placeholder already communicate the shape.

**Surgical Fixes (`ContractEditor.tsx`, `HoldoutDrafts.tsx`, `styles/workbenches.css`)**:
- **Unify `Sandbox tier` with `Autonomy`**: Delete `.tier-cards` / `.tier-card` boxes and render `Sandbox tier` using the exact same `.autonomy-choices` / `.radio` specification row pattern (`input[type="radio"]` with `accent-color: var(--text-1)`, `<b>Default OS Sandbox</b>` in `--text-1`, `<span class="radio-desc">Seatbelt / Landlock</span>` in `--text-3`, disabled state cleanly dimmed when MicroVM is unavailable).
- **Clean Inline Attachment Row & `4px`-Grid Spacing**: Replace the full-width dashed `.att-drop-zone` banner with a quiet, compact attachment row tucked cleanly inside `Purpose`/`Intent`'s field block (`+ Attach screenshot` ghost/link trigger + muted `Paste or drop image` hint), followed by proper `var(--sp-4)` (`16px`) vertical separation before `Done when (optional)`.
- **Flatten `HoldoutDrafts`**: Replace nested dashed `.holdout-panel` / `.holdout-draft` boxes with a single `1px` hairline-divided draft list carrying the `┆ Proposed holdout (agent claim)` hanging provenance header, transitioning cleanly to primary ink (`Human`) once ratified.
- **Editorial Caption Trim**: Keep non-obvious domain laws (`Tower runs command criteria in a clean environment…`, `Pushing, publishing and rewriting history always ask you first…`) crisp, and trim redundant prose hints where label + `e.g.` placeholder suffice.

---

## 5. Hard Invariants, Accessibility & Bundle Guardrails

Every anti-slop change must preserve 100% of Tower's automated quality gates:

| Gate | Hard Requirement & Protected Selectors |
|---|---|
| **Honesty E2E (`honesty.spec.ts`, `smoke.spec.ts`)** | `.goal-head`, `.seal-tampered`, `.row > svg.glyph` (`mark-attention` + `aria-label` `/Passed, not evidence/`), `.side-goal .side-icon svg`, `.goal-page .criterion`, `.criterion-row .result-tampered`, `.criterion-row .result-pass`, `.col-result`, and `/Verified by Tower\|Agent claim/` text on `goal/G-0001`. |
| **Typography E2E (`type.spec.ts`)** | `.editor:not(.contract-skeleton) .contract-mast` (`0.08em` tracking in `zh-CN`), `.contract-mast-project` (`0.02em`), `.clause-title` (`0em`), `.empty-body` (`28em` in `zh-CN`, `text-wrap: pretty`, no 1-word orphans), `.decision-body` (`40em` in `zh-CN`, `72ch` in `en`), and `"liga" 0, "calt" 0` on `.sentinel-machine`, `.criterion-cmd`, `.goal-sub .code-val`, `.kbd`. |
| **Contract & Look E2E (`contract.spec.ts`)** | `.contract-skeleton` (`0.15s` delay, `0s` duration, `.clause-no` `["01","02","03"]`), `.editor .contract-mast-word`, `.look-steps` (`Step` button, `.look-steps-verbs`, `.look-step-why`, `.look-step-no`), `.goal-page .criterion .num` + `.look-step-list-read .look-step`. |
| **Settings E2E (`settings.spec.ts`)** | `.settings .clause-head` (7 unnumbered clauses), `Settings clauses` nav (7 links, `aria-current="location"`), zero `input[type="checkbox"]`, `≥ 4` `[role="switch"]`, `.settings-form .toggle-row` aligned to value column (`offset: 0`, `hintBelow: true`). |
| **WCAG AA Accessibility (`smoke.spec.ts` axe-core)** | Zero `serious` or `critical` violations across `overview`, `inbox`, `learning`, `operations`, `goal/G-0001`, `review/G-0001`, and `settings` in both `light` and `dark` themes (`--text-4` never used on body/readable runs; status hues never used as small-text foregrounds). |
| **Bundle & File Size (`bundle-budget.sh`, `line-limit.sh`)** | Start-up JS `≤ 65,536 B`, `GoalPage` chunk `≤ 12,288 B`, on-demand JS `≤ 110,592 B`, total JS `≤ 163,840 B` gzipped; every source file (`*.rs`, `*.ts`, `*.tsx`) and CSS sheet kept clean and modular (`≤ 800` lines). Deleting `ConsoleMast`, `.ev-strip` pill arrays, and `.telemetry-strip` pills directly **reduces** gzipped JS while elevating visual craft. |

---

## 6. Primary References

1. **Linear** — *A calmer interface for a product in motion* & *How we redesigned the Linear UI* (`linear.app/now`), March 2025–2026 UI refresh changelog & production token audit.
2. **Raycast** — *A Technical Deep Dive Into the New Raycast* & *The New Raycast* (`raycast.com/blog`), WKWebView + native macOS desktop ergonomics.
3. **Cultured Code** — *Things 3* design notes (`culturedcode.com/things/blog`) & MacStories longitudinal review on borderless typographic hierarchy.
4. **Zed Industries & Sublime HQ / Kaleidoscope** — Zed UI density & paired Plex/Lilex typography (`zed.dev`); Sublime Merge & Kaleidoscope diff/comparison ergonomics.
5. **Vercel Geist & Design Engineering** — Geist Colors & Typography (`vercel.com/geist`); Rauno Freiberg (*Invisible Details of Interaction Design*, *Devouring Details*), Emil Kowalski (*animations.dev*), Paco Coursey (*cmdk*, Linear craft).
6. **Anthropic & Anti-Slop Critiques** — *Prompting for Frontend Aesthetics* (`platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics`), *Spot the Slop: A UI Designer's Guide to Fixing AI Defaults*, `avoid-ai-design`.
7. **Industrial & Cockpit Standards** — ISA-101 High-Performance HMI (*"Gray is normal; color is strictly an exception"*), Airbus *Lights-Out / Dark Cockpit* & ECAM annunciator ergonomics, Dieter Rams (*Ten Principles for Good Design*), Teenage Engineering OP-1 field layout system.
