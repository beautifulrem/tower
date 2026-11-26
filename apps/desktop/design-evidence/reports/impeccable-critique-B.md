# Impeccable critique — Assessment B (Detector + Browser Evidence)

Target: Tower desktop UI, frozen checkout `/tmp/tower-design/wt-baseline-b` (commit bf22cad), `apps/desktop`.
Detector: impeccable skill 4.10.0 (`scripts/impeccable`, engine 0.1.27).
Provenance: the CLI source scan ran. The in-page scan also ran: `detect.js` was injected into each page. It ran in Playwright WebKit with stubbed Tauri IPC fed by the dumped supervisor views. It did not run in the real Tauri WKWebView, which has no CDP.

---

## 1. CLI source scan

Command: `cd apps/desktop && impeccable detect --json src`
- **Exit code 2** (primary findings present). stderr empty.
- **Files scanned: 214** (145 `.ts`, 64 `.tsx`, 5 `.css`). All were scanned with **regex matching only**. The CLI warns that rules needing a parsed page (tiny-text, low-contrast and the other element rules) did not run on them, so the source result undercounts and is not a clean bill of health.
- **Findings: 3, all one rule.** No advisory findings.

| Rule | Severity | File:line | Snippet |
|---|---|---|---|
| side-tab | warning (slop) | `src/styles/app.css:4788` | `.hunk-head.hunk-accepted td`: inset box-shadow 2px stripe, left edge |
| side-tab | warning (slop) | `src/styles/app.css:4798` | `.hunk-head.hunk-current td`: inset box-shadow 2px stripe, left edge |
| side-tab | warning (slop) | `src/styles/app.css:4802` | `.hunk-head.hunk-current.hunk-accepted td`: inset box-shadow 2px stripe, left edge |

No TSX or TS file produced a finding.

---

## 2. Rendered (in-page) scan

### How it ran
- **Server:** `impeccable live-server --background` started from a scratch dir (`/tmp/tower-design/b-live`) and served `http://localhost:8400/detect.js` (200, 3.25 MB, WASM embedded).
- **Temporary spec:** `apps/desktop/e2e/zz-detect.spec.ts`. It used `openTower` and `settled` from `e2e/tauri.ts` and enriched the fixtures with `enrichRich` plus a copy of `shots.spec.ts`'s `enrichConsole` data so Learning and Operations have content. Each screen was rendered in Playwright WebKit with reduced motion. Viewport height was 900.
- **Language and theme:** each screen ran in the two pairs the project's shots harness uses, **en + light** and **zh-CN + dark**.
- **Per page:**
  1. Preflight for mutable injection: set `document.title` to `[Human] Tower`, append a `<script>`, scroll to top. It passed on all 20 pages.
  2. Set `__IMPECCABLE_CONFIG__ = {autoScan:false}` and run `page.addScriptTag({url: detect.js})`.
  3. Run `impeccableDetectAsync()` to get structured findings, including the pixel visual-contrast pass.
  4. Run `impeccableScanAsync()` to draw the overlay and print the `[impeccable]` console group. Wait 2.5 s, capture the console messages and take a screenshot.
- **Command:** `E2E_PORT=1442 E2E_FIXTURES=/tmp/tower-design/fixtures ./node_modules/.bin/playwright test e2e/zz-detect.spec.ts --project=webkit` gave **20 passed (20.1 s)**.
- **Health on every page:** detector core error = none (the page has no CSP blocking WASM), page errors = 0. The console summary matched the structured findings.
- **Visual-contrast pixel pass:** it ran, but **0 candidates on every page**. Nothing on these screens has text over images, gradients or unresolved translucent stacks. Low contrast was covered by the deterministic `low-contrast` rule.
- **Evidence:** one JSON and one overlay screenshot per scan in `/tmp/tower-design/b-detect/` (`<route>-<width>-<lang>-<theme>.{json,png}`), plus `fs-*.txt` font-size counts (see section 3).

### Findings per route / viewport

| Route | Viewport | en-light | zh-CN-dark |
|---|---|---|---|
| overview | 1440×900 | flat-type-hierarchy (body 11px, h2 12px, h1 13px; step 1.09:1) | same |
| overview | 1100×900 | flat-type-hierarchy (same values) | same |
| inbox | 1440×900 | tiny-text ×2: `p.decision-note.heldout-note > span`; `article.decision.quiet … p.decision-note` (11px) | tiny-text ×1: `p.decision-note.heldout-note > span` |
| goal/G-0001 | 1440×900 | tiny-text ×4: `div.criterion:nth-of-type(2\|5) > div.ev-holdout-files > span.ev-hf.ev-hf-ran` (11px), below the fold | same 4 |
| goal/G-0001 | 1100×900 | tiny-text ×4 (same elements) | same 4 |
| review/G-0001 | 1440×900 | side-tab: `tr.hunk-head.hunk-current > td` (inset 2px left stripe) | same |
| new (contract editor) | 1440×900 | low-contrast: `label.radio.disabled > b` 3.3:1 (#8e8c8b on #fdfcfb); `label.radio.disabled > span.radio-desc` 2.2:1 (#adaba9 on #fdfcfb); flat-type-hierarchy (body 12, h1 13, h2 13; 1.08:1) | low-contrast: `label.radio.disabled > span.radio-desc` 2.8:1 (#5d5b59 on #131110); flat-type-hierarchy |
| settings | 1440×900 | flat-type-hierarchy (12/13/13); straggler (advisory): `#memory-hint` leaves "characters)." alone on line 2 (8% of the measure) | flat-type-hierarchy |
| learning | 1440×900 | flat-type-hierarchy (12/13/13); repeated-container-text ×3: "Approve" / "Edit" / "Reject" each 3× in `div.proposal-ledger` | flat-type-hierarchy only |
| operations | 1440×900 | flat-type-hierarchy (12/13/13) | same |

No route was clean in both pairs. The inbox and goal pages did not trigger flat-type-hierarchy because the goal page has a 20px h1 and the inbox has a 16px question role.

### Totals across 20 scans

Counts are finding instances. Unique elements are in parentheses.

| Rule | Instances | Unique elements / page-level hits | Advisory |
|---|---|---|---|
| tiny-text | 19 | 4 `.ev-hf-ran` spans on goal (×4 runs) + 2 `.decision-note` on inbox | no |
| flat-type-hierarchy | 12 | page-level on overview (×4), new, settings, learning, operations (×2 each) | no |
| repeated-container-text | 3 | 3 button labels in `.proposal-ledger` (en only) | no |
| low-contrast | 3 | 2 elements in the disabled MicroVM radio (en-light ×2, zh-dark ×1) | no |
| side-tab | 2 | `tr.hunk-head.hunk-current > td` (×2 runs) | no |
| straggler | 1 | `#memory-hint` (en-light) | yes |

### Source locations of rendered findings
- **tiny-text `.ev-hf`:** markup `src/views/goal/CriterionRow.tsx:60` and `:114`. CSS `src/styles/workbenches.css:140-145` hard-codes `font-size: 11px`, mono, text-2. The parent `.ev-holdout-files` at `workbenches.css:130` uses `--fs-hint`.
- **tiny-text `.decision-note`:** markup `src/components/DecisionCard.tsx:462` (held-out note) and `:498` (assumption note "Both Approve and Reject carry this note."). CSS `src/styles/app.css:2309` uses `--fs-hint` (11px), ui font, text-3.
- **low-contrast:** markup `src/views/ContractEditor.tsx:378-381`. The input is `disabled` when MicroVM is unavailable. CSS `src/styles/workbenches.css:428` sets `.editor-side .radio.disabled { opacity: 0.5 }`, and `.radio-desc` is text-3 (`app.css:1130`).
- **side-tab:** `src/styles/app.css:4788-4803` (the same rules the CLI flagged).
- **repeated-container-text:** `src/views/Learning.tsx:138` (ledger) and `:90-95` (per-row `SmBtn`s, visible text only).
- **straggler:** `src/views/Settings.tsx:377`. `.field-hint` at `app.css:1096` has no `text-wrap: pretty`.
- **flat-type-hierarchy:** comes from the type tokens in `src/styles/tokens.css:28-36`.

---

## 3. False-positive classification

Each finding below is either a false positive / intentional design-system choice, or a true positive. I give no design opinion beyond that classification.

**side-tab (CLI ×3, rendered ×1): false positive. It is an intentional, documented design-system mark.**
- The rule describes "a bar down one side of a rounded box". The flagged element is a table cell in the diff header row, not a rounded box.
- The 2px solid rule is Tower's human-provenance pen. The comments at `app.css:4785` and `:4793` say an accepted hunk gets "the solid 2px rule of a human stamp", and the current hunk gets the same pen one ink step lighter.
- `docs/12-visual-design-system.md` (table at line 226) defines `HumanStamp` as a left 2px **solid** border, and line 204 defines `--diff-human` as a 2px solid gutter line. It is a semantic encoding: solid means human, dashed means claim. It is not decoration.

**flat-type-hierarchy (12 page-level): the measurement is accurate, but this is an intentional compact type system, and one reported value is wrong.**
- The headings really are flat: the page h1 is 13px in the titlebar, and h2 is 13px (12px for overview/inbox group headers). A font-size count (`fs-*.txt`) confirms it.
- This is deliberate. `tokens.css:28-36` sets `--fs-section` and `--fs-body` both to 13px, and titles of 20px+ only on the goal page. `docs/12` §12.3.3 says hierarchy is carried by weight 500 **plus** an ink step (text-2 → text-1), "never by weight alone".
- Caveat 1: on overview the detector reports "body 11px". The character-weighted dominant size there is 13px (`document.body` is 13px; 11px is the `hint` role on kbd chips and IDs). The body value the rule prints on overview is a misread. The heading sizes are correct.
- Caveat 2: there is a documented-vs-implemented discrepancy. The `docs/12` type table says `title-section` is **14**/500, but `tokens.css` `--fs-section` is **13px**. That mismatch is the only part of this finding that is not plainly intentional.

**tiny-text (6 unique elements): true positive by the detector's threshold. The size is on-system but used outside the role the docs define for it.**
- Both elements use the 11px `hint` size (`--fs-hint`, or a literal 11px for `.ev-hf`).
- `docs/12` limits the `hint` role (11/500, mono, text-3) to shortcut hints, separators and other text the user does not need to read.
- The flagged content is different: explanatory sentences on decision cards ("A hint, or only the names of what failed, keeps the tests hidden…", "Both Approve and Reject carry this note.") and held-out test file names that serve as evidence on the goal page.
- Not an intentional false positive. Note that `.ev-hf` is a hard-coded `11px`, not the token.

**low-contrast (2 elements, disabled MicroVM radio): WCAG-exempt, so a false positive under WCAG 1.4.3.**
- The `<input>` is truly `disabled`, and SC 1.4.3 exempts text in inactive UI components. The ratio measurement itself is correct; the dimming comes from `opacity: 0.5` on top of text-3.
- Flag for Assessment A: the dimmed `.radio-desc` carries the reason the option is unavailable (the "requires…" text from `contract.microvmReq`). Whether that reason may sit at 2.2–2.8:1 is a judgment call, not a detector error.

**repeated-container-text (Approve/Edit/Reject ×3, en only): false positive.**
- These are per-row actions in a list of three memory proposals. Each button acts on its own row, and the repetition is inherent to a row-action list.
- The rule did not fire on the zh-CN pass (批准/编辑/驳回), so it is language-sensitive.
- Unrelated a11y fact: the buttons carry no row-specific accessible name, only the visible label.

**straggler (advisory, settings `#memory-hint`, en only): true positive, minor.**
- One word wraps to its own line. `.field-hint` lacks the `text-wrap: pretty` that `.decision-note` already uses.
- Advisory only: it does not count toward the exit code.

**Rules that were evaluated and found nothing on these 20 renders:** all remaining catalog rules. Among them: overused-font, gradient-text, ai-color-palette, nested-cards, bounce-easing, pulsing-dot, dark-glow, em-dash-overuse, text-overflow, clipped-overflow-container, line-length, cramped-padding, skipped-heading, undersized-ui-text, all-caps-body, wide-tracking and the design-system-* rules (no DESIGN.md is present, so the design-system rules had no reference).

---

## 4. Skipped, failed and limited steps

- **No CDP scan of the real app.** Tauri 2 on macOS uses WKWebView, which exposes no DevTools port, so `detect --cdp` is impossible.
- **No URL scan (`detect <url> --viewport`).** It was not attempted on purpose: the app needs Tauri IPC (`__TAURI_INTERNALS__`), so a plain Puppeteer visit renders nothing meaningful. Page injection into the IPC-stubbed WebKit harness replaced it, and it worked.
- **Engine fidelity:** Playwright WebKit is the same engine family as WKWebView, but it is not the shipped webview. Font rasterization and system-font fallback can differ slightly. Data comes from dumped supervisor views plus test enrichment (`enrichRich` and a copy of `enrichConsole`), not a live supervisor.
- **Only the default state of each route was scanned.** Not scanned: the peek drawer, command palette, sheets, accept sheet, readout, hover/focus states, the welcome/first-run screen, empty states, and 1800px widths. Content below the fold or inside inner scroll containers is in the DOM and was scanned by the element rules, but the screenshots show only the first viewport.
- **No `[Human]` presentation tab:** the run was headless Playwright, so there was no visible browser tab to present. The title was still set as the injection preflight.
- **Regex limits of the CLI source scan:** the source scan ran regex rules only, as the CLI itself warned. The element-level rules came only from the rendered scan.
- **Cleanup done:**
  - Deleted `e2e/zz-detect.spec.ts` and the helper `e2e/zz-detect-fs.spec.ts`, which counted font sizes to interpret flat-type-hierarchy.
  - Removed the Playwright `test-results/` dir it created and the scratch live-server dir.
  - Ran `live-server stop --keep-inject`; port 8400 is confirmed down. The Playwright-managed Vite on 1442 exited with the run.
  - `git status` in the checkout is clean. No product source files were modified.
