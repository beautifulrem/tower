---
name: Tower
description: A supervision desk for one engineer running several coding agents; evidence before claims, colour only where it means something.
colors:
  parchment-sidebar: "oklch(0.965 0.004 80)"
  parchment-page: "oklch(0.992 0.002 80)"
  parchment-raised: "oklch(1 0 0)"
  parchment-hover: "oklch(0.955 0.004 80)"
  parchment-selected: "oklch(0.940 0.006 80)"
  parchment-hairline: "oklch(0.20 0.01 70 / 0.14)"
  parchment-hairline-subtle: "oklch(0.20 0.01 70 / 0.08)"
  ink-1: "oklch(0.230 0.006 70)"
  ink-2: "oklch(0.430 0.006 70)"
  ink-3: "oklch(0.470 0.006 70)"
  ink-4: "oklch(0.525 0.005 70)"
  decision-amber: "oklch(0.600 0.150 65)"
  decision-amber-ground: "oklch(0.962 0.034 85)"
  verifier-green: "oklch(0.550 0.130 155)"
  danger-red: "oklch(0.540 0.190 25)"
  danger-red-ground: "oklch(0.965 0.025 25)"
  running-blue: "oklch(0.500 0.130 240)"
  carbon-sidebar: "oklch(0.155 0.004 70)"
  carbon-page: "oklch(0.180 0.004 70)"
  carbon-raised: "oklch(0.215 0.005 70)"
  carbon-hover: "oklch(0.235 0.005 70)"
  carbon-selected: "oklch(0.265 0.006 70)"
  carbon-hairline: "oklch(1 0 0 / 0.10)"
  carbon-hairline-subtle: "oklch(1 0 0 / 0.06)"
  carbon-ink-1: "oklch(0.945 0.003 70)"
  carbon-ink-2: "oklch(0.860 0.005 70)"
  carbon-ink-3: "oklch(0.720 0.006 70)"
  carbon-ink-4: "oklch(0.645 0.006 70)"
  carbon-decision-amber: "oklch(0.800 0.150 75)"
  carbon-decision-amber-ground: "oklch(0.225 0.030 75)"
  carbon-verifier-green: "oklch(0.770 0.130 155)"
  carbon-danger-red: "oklch(0.750 0.150 25)"
  carbon-danger-red-ground: "oklch(0.215 0.030 25)"
  carbon-running-blue: "oklch(0.780 0.120 235)"
typography:
  stamp:
    fontFamily: "Inter Variable, PingFang SC, -apple-system, sans-serif"
    fontSize: "28px"
    fontWeight: 580
    lineHeight: "36px"
    letterSpacing: "-0.022em"
    fontVariation: "\"opsz\" 32"
  display:
    fontFamily: "Inter Variable, PingFang SC, -apple-system, sans-serif"
    fontSize: "24px"
    fontWeight: 500
    lineHeight: "32px"
    fontVariation: "\"opsz\" 32"
  title:
    fontFamily: "Inter Variable, PingFang SC, -apple-system, sans-serif"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: "28px"
    letterSpacing: "-0.012em"
    fontVariation: "\"opsz\" 32"
  question:
    fontFamily: "Inter Variable, PingFang SC, -apple-system, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: "24px"
    letterSpacing: "-0.008em"
  reading:
    fontFamily: "Inter Variable, PingFang SC, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "22px"
    letterSpacing: "-0.006em"
  section:
    fontFamily: "Inter Variable, PingFang SC, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "20px"
    letterSpacing: "-0.003em"
  body:
    fontFamily: "Inter Variable, PingFang SC, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "20px"
    letterSpacing: "-0.003em"
    fontFeature: "\"calt\" 1, \"cv01\" 1, \"ss03\" 1"
  meta:
    fontFamily: "Inter Variable, PingFang SC, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
  hint:
    fontFamily: "JetBrains Mono Variable, ui-monospace, SF Mono, monospace"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: "16px"
    fontFeature: "\"liga\" 0, \"calt\" 0, \"zero\" 1"
  code:
    fontFamily: "JetBrains Mono Variable, ui-monospace, SF Mono, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: "20px"
    fontFeature: "\"liga\" 0, \"calt\" 0, \"tnum\" 1, \"zero\" 1"
rounded:
  hairline: "1px"
  xs: "3px"
  s: "4px"
  m: "6px"
  l: "10px"
  full: "999px"
spacing:
  sp-1: "4px"
  sp-2: "8px"
  sp-3: "12px"
  sp-4: "16px"
  sp-5: "20px"
  sp-6: "24px"
  sp-8: "32px"
  sp-10: "40px"
components:
  button-primary:
    backgroundColor: "{colors.ink-1}"
    textColor: "{colors.parchment-page}"
    typography: "{typography.section}"
    rounded: "{rounded.m}"
    padding: "0 10px"
    height: "26px"
  button-primary-hover:
    backgroundColor: "{colors.ink-2}"
    textColor: "{colors.parchment-page}"
  button-default:
    backgroundColor: "{colors.parchment-raised}"
    textColor: "{colors.ink-1}"
    typography: "{typography.section}"
    rounded: "{rounded.m}"
    padding: "0 10px"
    height: "26px"
  button-default-hover:
    backgroundColor: "{colors.parchment-hover}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.m}"
    padding: "0 10px"
    height: "26px"
  button-small:
    padding: "0 8px"
    height: "24px"
  input-text:
    backgroundColor: "{colors.parchment-raised}"
    textColor: "{colors.ink-1}"
    typography: "{typography.body}"
    rounded: "{rounded.m}"
    padding: "4px 8px"
    height: "28px"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.s}"
    padding: "0 8px"
    height: "22px"
  tab-active:
    backgroundColor: "{colors.parchment-selected}"
    textColor: "{colors.ink-1}"
  sidebar-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.m}"
    padding: "0 8px"
    height: "28px"
  sidebar-row-active:
    backgroundColor: "{colors.parchment-selected}"
    textColor: "{colors.ink-1}"
  goal-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink-1}"
    typography: "{typography.body}"
    height: "40px"
  goal-row-selected:
    backgroundColor: "{colors.parchment-selected}"
  decision-card:
    backgroundColor: "{colors.parchment-raised}"
    textColor: "{colors.ink-1}"
    rounded: "{rounded.m}"
    padding: "10px 12px 12px"
  decision-card-head:
    backgroundColor: "{colors.decision-amber-ground}"
    textColor: "{colors.ink-2}"
    typography: "{typography.meta}"
    padding: "0 12px"
    height: "28px"
  palette:
    backgroundColor: "{colors.parchment-raised}"
    rounded: "{rounded.l}"
    width: "600px"
  palette-item:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.m}"
    padding: "0 10px"
    height: "32px"
  chip-fact:
    textColor: "{colors.ink-2}"
    typography: "{typography.hint}"
    rounded: "{rounded.xs}"
    padding: "0 5px"
    height: "18px"
  kbd:
    textColor: "{colors.ink-3}"
    typography: "{typography.hint}"
    rounded: "{rounded.xs}"
    padding: "0 4px"
    height: "16px"
---

# Design System: Tower

## Overview

**Creative North Star: "The Control Tower at Night"**

Tower is a supervision desk, not a chat. One engineer watches several coding agents the way a tower controller watches traffic: a board of flight strips, a row of instrument readouts along the title bar, and a logbook where every line says whose it is. Normal work is grey, and it moves only in its own small mark: a running goal's mark turns slowly, like a status light on a rack. Colour turns up only when a decision is waiting for you, a verifier has ruled, or something has gone wrong. That is a product rule as much as a style. The long-form doctrine lives in `docs/12-visual-design-system.md` (§12.1 direction, §12.5 honesty grammar, §12.6 glyphs, §12.7 motion) and `docs/19-anti-chat-console-design.md`. This file records what the shipped code does; `tokens.css` is the source of truth for values.

The density is Operate-mode macOS: 13px body, 28px sidebar rows, 40px board rows, hairlines in place of boxes, and very few cards. The decision card is the one recurring card. Hierarchy comes from size, weight and four steps of warm grey ink, not from frames or icons. Two themes share one hue family (h≈70–80): **Warm Parchment** (light) and **Warm Carbon** (dark). Each surface step is a lightness step, so the eye finds the layer before it finds the hairline.

The signature devices are the **provenance gutter**, a hanging left column that names the source of every statement (Measured / Observation / Agent says / You), and the **stamp**, a 1px die-cut frame that carries the acceptance verdict and the commit pin in the interface's largest type. The agent is never personified: no avatar, no name, no face.

**Key Characteristics:**
- Warm near-neutral ramp; no accent hue. Primary actions are inverted ink, and selection and focus are carried by lightness.
- Five status colours with exclusive meanings: amber = needs your decision, green = verifier pass, red = danger, blue = running, grey = everything else.
- Glyph shape carries state before colour does: lifecycle rings (a turning arc while running), the ! disc for needs you, the outlined i for a notice, the × disc for danger.
- Mono only for machine text (ids, commands, paths, hashes, figures), set with ligatures off and a slashed zero.
- Opaque reading sheets (palette, peek drawer, accept sheet); blur only on small passing layers (toasts, the @ completion).
- Keyboard-opened layers appear instantly. Only work in motion loops, and only where you watch it: a running mark turns on the board, the goal page and the peek while its work moves (labels `moving`: not waiting on you, nothing for you, not silent), and the live line of the goal in view shimmers. Everything else moves once, on a spring that never overshoots, and all of it stands still under reduced motion.

## Colors

A warm grey instrument panel in which colour shows up only as a signal, and each signal colour has one meaning.

### Primary
- **Ink** (`ink-1` light / `carbon-ink-1` dark): body text, facts and the primary button. A primary action is ink-filled with page-coloured words. It is inverted, not coloured, because colour is reserved for status. Hover steps the fill to `ink-2`. Disabled keeps the filled form at 0.45 opacity.

### Status (the five signal colours, `--st-*`)
- **Decision Amber** (`decision-amber`, ground `decision-amber-ground`): only means *needs you to decide*. It appears on the ! disc, the decision card's 28px header strip, the "Needs you" sidebar icon and count, the attention mode badge's tint, commented diff lines (2px inset gutter rule), and the tampered-canary criteria segment. Its arrival is a single flash (`--attention-flash`, 700ms) that decays to the ground and never repeats.
- **Verifier Green** (`verifier-green`): only a fresh verifier pass. It appears on the verified criteria segment, the pass result mark, the verified lifecycle glyph on goals in review, accepted or integrated with a machine verdict, the seal's pin, and diff-add tints. It is never used on a statistic, aggregate, step, claim, observation or human check.
- **Danger Red** (`danger-red`, ground `danger-red-ground`): verifier failures, sentinel hits (the × disc), scope violations, hard contradictions, unresponsive agents, and diff-delete tints. A danger button's resting words are ink, not red.
- **Running Blue** (`running-blue`): the running/verifying lifecycle glyph (a faint ring with a turning quarter arc) and the runs gauge, which is the same mark. It has enough chroma to be told from grey at 10px.
- **Neutral** (`--st-neutral` = `ink-3`): every other state, observations included.

Status colours colour glyphs, segments and tinted grounds. They never colour small text: text in a status context is ink-1 or ink-2.

### Neutral
- **Parchment / Carbon Sidebar** (`parchment-sidebar` / `carbon-sidebar`): the sidebar is one step darker than the content it frames.
- **Page** (`parchment-page` / `carbon-page`): the app background.
- **Raised** (`parchment-raised` / `carbon-raised`): cards, buttons and reading sheets. In dark mode, raised sits 0.035 L above the page.
- **Hover / Selected** (`*-hover`, `*-selected`): row hover and "you are here". Selection is a ground, never a colour.
- **Hairlines** (`*-hairline-subtle` for structure, `*-hairline` for controls, `--border-strong` on hover): 1px, translucent ink.
- **Ink 2–4**: `ink-2` holds secondary text that must still be read (claims, meta, live line). `ink-3` holds labels, hints and the provenance gutter. `ink-4` holds placeholders, line numbers, empty segments and refuted rules. All four inks hold 4.5:1 on every surface they meet, the selected row included (contrast notes in `tokens.css`).

Diff and syntax colours (`--diff-*`, `--code-token-*`) are low-chroma tints whose hues stay away from the five status colours.

### Named Rules
**The Amber Is a Question Rule.** Amber means one thing: a human decision is waiting. Something worth noticing that needs no decision gets the outlined i and ink-1 text, with no colour. Amber is never a selection colour. In a queue of decision cards the heads go neutral, and the focused card takes `--bg-selected`.

**The Green Is the Verifier's Word Rule.** Green appears only beside a verifier result or a verified goal glyph. A count, a percentage, a plan step, an agent's claim or your own tick is never green. A pass that does not count (tampered canary) is drawn solid amber, never green.

**The No Accent Rule.** There is no brand hue. Focus is a 1.5px ink ring at 65–70% alpha, links underline in translucent ink, and the primary button is inverted ink.

## Typography

**Display / UI Font:** Inter Variable (falls back to PingFang SC, then -apple-system)
**Mono Font:** JetBrains Mono Variable (falls back to ui-monospace, SF Mono)

**Character:** Inter with its display optical cut (`opsz 32`) for anything 20px and up, and JetBrains Mono for evidence. Mono text reads exactly as written: no ligatures, no contextual alternates, slashed zero (`=>` stays two characters, `===` stays three bars).

### Hierarchy
- **Stamp** (580, 28px/36px, −0.022em, display cut): the acceptance verdict inside the stamp. Nothing else in the interface is this size.
- **Display** (500, 24px/32px): empty states and the Welcome title only.
- **Title** (500, 20px/28px, −0.012em, display cut): the goal title. The medium stamp also uses this size.
- **Question** (500, 16px/24px): the one-sentence question on a decision card and sheet headings.
- **Reading** (400, 14px/22px): prose you read: Welcome lede, mined rules, contract text. Measure 72ch (40em in Chinese).
- **Section** (500, 13px/20px, ink-1): section titles. No uppercase, no tracking.
- **Body** (400, 13px/20px, −0.003em): the default for UI text, rows and claims.
- **Meta** (400, 12px/16px, ink-2): times, counts, field labels, the live line on the board.
- **Hint** (mono 500, 11px/16px, ink-3): shortcut hints, provenance gutter labels and chips. The keycap is mono 500 at 10px.
- **Code** (mono 400, 12.5px/20px, tabular): diffs, logs and command output. Inline machine values (`.code-val`) are mono at max(0.923em, 11.5px).

Latin tracking tightens with size (−0.003em at 13px down to −0.012em on titles). CJK is never tracked: `lang="zh-CN"` sets letter-spacing 0, and measures switch from `ch` to `em`. The one exception is the stamp verdict, which opens to +0.02em in Chinese.

### Named Rules
**The Mono Is Evidence Rule.** Monospace is for ids, commands, paths, hashes and figures, never for prose labels. Counts in the UI face use tabular figures.

**The Middle Dot Rule.** " · " belongs to the two instrument lines only: the criteria scale ("Verified 2/3 · 1 doesn't count · Observed 0/3 · Human 0/2") and the budget line. Everywhere else, groups are told apart by a gap and a change of weight or ink (`.sep:empty` is just space).

**The Medium Weight Rule.** Emphasis is 500, and it always comes with an ink step up (ink-2 → ink-1) or a size step, because a CJK 500 may fall back to 400. Heavier cuts are reserved for the verdict: the large seal's word (600) and the stamp (580).

## Layout

A fixed macOS frame: 52px title bar, a sidebar of 232px (204px at ≤1200px window width), and content on a 4px spacing grid (`sp-1`–`sp-10`). Two widths govern content. Anything you **read** (decision cards, forms, long text) sits within an 840px reading width, with sentences held at a 72ch measure. **Instruments** (board rows, criteria, diffs) run full width.

The title bar is an instrument strip: a breadcrumb on the left and a borderless row of `tnum` gauges on the right (Needs-you count, runs, heartbeat, spend, sandbox, quiet hours, engine, search). A gauge gets a frame only when it is an exception, for example the sandbox gauge on an amber ground when unsandboxed.

The board is a **flight-strip table**. "Needs you" decision lines come first, then running goals in 40px rows on one fixed column grid (glyph · goal · live · criteria · change · spend · updated · identity). A 22px header row sits inside the first group and shares one hairline with the strips. Columns compress between 1241–1560px, and the identity column gives way first. Group headings are scale titles: 12/500 ink-3, then a tabular count, then a hairline running to the right edge.

The goal page puts the **verdict line** directly under the title: seal, the two-track counts, and the goal's single primary action at the line's end. Then come identity fields (separated by gaps, not dots), sentinels, any decision card, and criteria, with a 340px contract rail on the right. Review takes the full window. The peek drawer is 448px from the right edge. Sizes ship at 1100–1800px wide, in English and Chinese, and the interface size setting scales the whole surface (zoom 0.92 / 1 / 1.1).

### Named Rules
**The Read vs Instrument Rule.** Text you read stops at 840px and 72ch. Instruments use the whole width.

**The One Primary Rule.** Each surface has one filled primary button. In a queue of decision cards, only the focused card's primary is filled. The others drop to the default frame and keep their key hint.

## Elevation & Depth

Depth comes from lightness, not shadow: sidebar < page < raised < hover < selected. Surfaces at rest are flat. A card's material is its hairline: cream-warm on Parchment (`--card-edge`, no shadow), and on Carbon a subtle hairline plus one line of shadow under its foot. Real shadows belong only to layers that float over content. Scrims dim what a layer covers: `--scrim` for a sheet that takes the room, `--scrim-soft` for the peek drawer, which only leans over the board.

### Shadow Vocabulary
- **Card lift** (`--card-lift`: `0 1px 0 oklch(0 0 0 / 0.30)` dark, `none` light): decision cards and raised panels. Something set on the page, not drawn on it.
- **Overlay** (`--shadow-overlay`: `0 16px 48px oklch(0 0 0 / 0.45), 0 0 0 1px var(--border)` dark; `oklch(0.2 0.01 70 / 0.18)` light): palette, panels, sheets, toasts.
- **Material edge** (`--material-edge`: `inset 0 0.5px 0` with a faint light): the top edge of the palette and toasts catches light. Sheets you read in have no such edge.
- **Drawer** (`--shadow-drawer`: `-12px 0 36px …`): the peek drawer's left side.
- **Ink pen** (`inset 2px 0 0` of ink-1 / ink-3 / amber): a 2px rule at the left edge that marks the current or accepted hunk, a commented diff line, or your own register. This is a mark, not elevation.

### Named Rules
**The Opaque Sheet Rule.** Anything you read word by word (palette, peek drawer, accept sheet) sits on the opaque `--bg-overlay`. Translucent `--material-float` with a 24px blur is only for small passing layers (toasts, the @ completion), and it falls back to opaque under reduced transparency.

## Shapes

Small, quiet corners at four steps: 3px for keycaps and the stamp's die-cut frame, 4px for chips, tabs and tinted readouts, 6px for buttons, inputs, rows, cards and diff frames, and 10px only for floating layers (palette, menus, toasts). One capsule (`--radius-full`) is kept for shapes that hold no words: the criteria segments and the status dots. Anything that holds words keeps a corner, never a capsule. Corners are concentric: a 10px layer holds its 6px rows at a 4px inset. Criteria segments are 12×4px capsules on an ink-4 track. A verified one fills green, an observed one is hatched in ink-3 (1.5px diagonals at a 3px pitch: said, not measured), and a discounted one fills amber. When a count moves, the segment keeps its element and fills along its length on the snappy spring. Line style carries provenance: a solid line means measured or yours; a dashed line, or a hatch inside a segment, means observed or said. The stamp's frame is solid when the seal holds and dashed when it is withheld. Hairlines are drawn once and never nested; boxes never sit inside boxes.

## Components

### Buttons
Compact AppKit-like controls that are clear without needing colour.
- **Shape:** gently rounded (6px), 26px tall (24px small), 0 10px padding, 13/500.
- **Primary:** filled ink with page-coloured words, and its keycap hint rides inside at 0.8 opacity. Hover moves to ink-2. There is one per surface.
- **Default:** raised surface, 1px hairline, ink-1 words. Hover is instant: hover ground and stronger hairline. Leaving fades over 150ms. A press gives to 98% over 90ms and comes back on the snappy spring.
- **Ghost:** transparent, ink-2 words, keycap hint in ink-3. Disabled keeps a hairline so it still reads as a button.
- **Disabled:** the frame stays and the words step back to ink-3 (AppKit). A disabled primary keeps its filled form at 0.45 opacity.
- **Armed (destructive, second press):** selected ground with an ink-1 frame. A 2px ink rule drains along the foot over 2s (`--dur-arm`) and stands still under reduced motion.

### Chips and badges
- **Fact:** no frame. The harness "measured" mark is the register, with 12px ink-2 text.
- **Observation chip:** 18px, 11px, a 1px **dashed** frame in `--border-strong`, no icon.
- **Fact chip:** the same chip with a **solid** 1px hairline.
- **You chip:** a 2px solid ink-1 rule at the left edge, square corners, ink-1 text.
- **Held tag (a criterion's evidence strip):** its tone's ground (amber, or red for a danger), ink-1 words, 4px corners, no frame: the row's mark already says the tone.
- **Mode badge:** words with no frame. Attention mode adds an amber ground tint (4px radius). A badge word that changes settles over 100ms (split-flap).

### Cards (the decision card)
- **Corner Style:** 6px, with a `--card-edge` hairline and `--card-lift`.
- **Head:** a 28px strip on the amber ground, meta size: kind (ink-1, 500), owner, delay cost, countdown. A new card flashes once, then decays. Listed in a queue, the head goes transparent with a hairline. Focused in a queue, it takes the neutral selected ground.
- **Body:** padding 10px 12px 12px. A 16/500 question, then the body in ink-2 and numbered options with consequences. The recommendation is set as a claim (Agent says), followed by evidence and the action row. Sentences are held to 72ch even when the card runs the board's width.
- **Leaving:** the card fades and rises 2px while its slot folds to zero height over 160ms ease-in, and the list below moves up.

### Inputs / Fields
- **Style:** 28px, 6px radius, 1px hairline, on `--bg-field` (white / near-page). Inside a raised card, a field uses the page colour so it never reads as a hole.
- **Focus:** a 1.5px focus-ring outline offset into the border (it replaces the edge rather than adding a second one), and the border steps to ink-3.
- **Error / Warning:** the message is in ink-1 with a leading 12px mark: the red × disc for an error, the uncoloured outlined i for a warning. Placeholders are ink-4 and examples say "e.g.".

### Navigation
- **Sidebar:** 28px rows, 6px radius, ink-2 words, and 16px one-pen icons in ink-3. Hover is an instant ground with ink-1 words. Active shows the selected ground and ink-1 words, with no edge stripe. The Needs-you icon stays amber, and danger stays red. Group titles are 12px ink-3 with a count. Keycap hints appear on hover only. In an inactive window the chrome steps back to ink-3, and status colours stay.
- **Tabs:** 22px text tabs at 12px with a 4px radius. Active takes the selected ground. In steering and review sub-modes, active is a 1.5px ink underline (`inset 0 -1.5px 0`).
- **Command palette:** 600px wide, 10px radius, opaque, overlay shadow with a material edge. The field is the panel's own top line (40px, mono `›` prompt). Items are 32px rows at a 6px radius; the selected item takes the selected ground. Opened from the keyboard, it appears instantly. Otherwise it lifts 4px on the snappy spring.

### Glyphs and icons
One pen throughout: a custom SVG set (`components/Glyph.tsx`) with round caps and joins, stroked around 1.3px at every size (2 / 1.75 / 1.6 / 1.5 for 10 / 12 / 14 / 16px). Lifecycle rings: a ring is a goal. Running is a faint ring with a quarter arc, and the whole mark turns once every 1.1s (verifying turns the same arc on a dashed ring). Paused is the ring with two bars, a check in a ring is verified, a solid disc is sealed, and dashes mean "said, not proven". The turn is a transform on the whole svg, so it stays on the compositor. It turns only where you watch the work (a board row, the goal page, the peek, the runs gauge) and only while the work moves; in the lists you move through (sidebar, palette, cross-references, history), on a run waiting on you or gone silent, and under reduced motion, it stands with its arc at the top right. A goal merged without the verifier's pass keeps a hatched core, so it differs from a verified merge by shape, not by colour alone.

The status marks are one family on the icons' 16-unit grid, drawn 12px and sitting 2px under the baseline: a disc with its symbol cut out. **Needs you** is the ! on amber, **danger** is the × on red, and a **notice** is the same disc drawn as a 1.5 line with an i, never coloured: it marks what is worth a look but asks nothing, such as a run gone silent in the title bar and on the phone. Each is a single even-odd path, so the symbol is a true hole and shows whatever ground the mark sits on (a selected row, a raised sheet). Where a stylesheet places a mark before words (field messages, toasts, a failed trace step, risk badges), it draws the same paths as a mask (`--mark-*` in `tokens.css`; a unit test holds them equal to `MARK_PATH` in `Glyph.tsx` and to the phone page's copies). There are no warning triangles, diamonds or squares, and no status is ever drawn with a text character or an emoji. A state glyph crossfades over 100ms.

### Provenance gutter (signature)
Every statement on the goal page, review, peek and proposals is a three-column grid: a hanging source column (minmax(6.5em, 8.5em), 11px ink-3), the body (13px), and an aside. The source column names the speaker: **Measured** (harness mark, which turns green only when the verifier passed), **Observation**, **Agent says** (body in ink-2, never green), and **You** (500, ink-2 label). A measured failure is the one framed exception: a 4px-radius danger ground with 6px 10px padding. The register comes from the column and the ink, with no box around each line.

### Stamp and seal (signature)
- **Seal:** pin glyph, verdict word (ink-1 500, or 600 in the display cut when large), and a mono `@hash`. Green appears only on the pin.
- **Stamp:** a 1px frame of ink at 82%, 3px radius, holding two cells divided by its own rule. On the left, the verdict (glyph plus word, 28px/580 or 20px). On the right, the pin (mono, ink-2). When the seal is withheld, the frame and divider are dashed and the ink drops to ink-3. When the accept sheet opens, the frame lands half a pixel heavy and settles while the ink rises 60ms behind it, over 220ms with no bounce. Under reduced motion it simply stands.

### Live line (flight strip)
A three-column line: mode badge, detail (action and target in ink-2), and age in ink-3. 12/16 on the board and 13/20 on the goal page. Agent activity replaces the text instantly. The detail names a call only while it runs, or once the run has gone silent (the last thing it did); otherwise it names the run ("Run 2", "第 2 次运行"), or "Getting started" before a first run's first call, unless that run has gone silent before one ("Run 1"). While a run starts the badge says "Starting" and the detail names the run, never "Starting" twice. On the board a call that has just ended keeps its words for one second, and the badge keeps the call's mode with them, so the row changes as one and quick calls change it once each; in English the badge's column holds "Thinking" and "Working" alike, so the detail starts at one x; the run's elapsed time follows the run's name in ink-3 and never a call's words, where it would read as the call's own time, and it is whole or set aside by measure, never cut (set aside, it is in the detail's tooltip, on a line of its own with the run's name, never after a command). On the goal page and the peek the header names the run at all times, so between calls their live line says how long the run has gone ("elapsed 21h 33m", "已进行 21 小时 33 分"; the phone says it the same way) rather than naming it again, or names the run where its start time is unknown; the board, with no header, names the run and then its time. On the goal in view (the goal page and the peek), while the agent is moving (running, not waiting on you, not silent) its words shimmer: a band of the line's own ground sweeps across the ink-2 words every 2.4s, the way AI Elements' Shimmer marks an agent at work. The band is the words' `::after`, clipped to them and moved by transform alone, so the words keep their ink and nothing repaints per frame. When the goal waits on you or falls silent, the band holds where it is and fades out over 600ms (`--dur-settle`), so the words never jump between their dimmed and their whole ink. Board rows never shimmer; there the turning mark says it. Under reduced motion the words are plain ink-2.

## Do's and Don'ts

### Do:
- **Do** use the semantic tokens only (`--bg-*`, `--text-*`, `--st-*`, `--sp-*`, `--radius-*`); values live in `src/styles/tokens.css`.
- **Do** carry state in glyph shape first (ring, turning arc, the ! disc, the outlined i, the × disc), so status reads in greyscale.
- **Do** put the source of every statement in the provenance gutter: Measured, Observation, Agent says, You.
- **Do** keep one filled primary per surface. In a decision queue, only the focused card's primary is filled.
- **Do** make hover arrive instantly (0ms) and leave over 150ms. Entering layers settle on a spring that never overshoots (`--spring-snappy` for small things, `--spring-soft` for panels), and leaving ones ease in.
- **Do** open keyboard-triggered layers (palette, panels) with no animation.
- **Do** set ids, commands, paths, hashes and figures in mono or tabular figures.
- **Do** hold reading text to 840px and 72ch (40em in Chinese), and let instruments run full width.
- **Do** keep sheets you read in opaque.

### Don't:
- **Don't** add an accent or brand hue; selection, focus and the primary action are ink and lightness.
- **Don't** use amber for warnings, staleness or "might be a problem". Use the outlined i with ink-1 text.
- **Don't** colour a statistic, aggregate, plan step, claim, observation or human check green.
- **Don't** colour small text with a status colour; status colours belong to glyphs, segments and grounds.
- **Don't** use " · " outside the criteria scale and the budget line.
- **Don't** use uppercase or tracked labels, KPI stat-card rows, pill soup, or boxes nested inside boxes.
- **Don't** put a coloured stripe down the edge of a card or an active nav item. The 2px ink pen is reserved for your own register, the current hunk and commented diff lines.
- **Don't** loop anything that is not work in motion: no pulses, breathing lights, celebration or decorative shimmer. The turning running mark and the in-view live line's shimmer are the only loops, and the one-shot amber decay is the only flash.
- **Don't** bounce. Springs here settle without overshoot.
- **Don't** draw a status with a text character (■ ◆ ◇) or an emoji; status is the mark family.
- **Don't** personify the agent (no avatar, name or face), and don't set claims in italics.
- **Don't** use a hand cursor on controls; this is a desktop app.
