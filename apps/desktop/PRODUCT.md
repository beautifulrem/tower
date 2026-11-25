# Product

<!-- impeccable:product-schema 1 -->

> Written during an autonomous design pass (2026-11-25). The owner asked for no interview, so every fact below is
> inferred from the repository (README, `docs/00`, `docs/04`, `docs/12`, `docs/19`, the shipped interface) and not
> separately confirmed. The design docs in `docs/` stay the long-form source; this file is the short product record.

## Platform

web

(The interface is a Vite + SolidJS page rendered in macOS WKWebView inside a Tauri 2 window. Its design language is
macOS-desktop, but it is built and tested as web UI; there is also a phone-width `serve` page reached over Tailscale.)

## Users

One engineer who runs several autonomous coding agents at the same time, often for an afternoon or overnight, on
their own repositories. They are not watching any single agent; they glance at Tower between other work, step in
only when something needs a human decision, and review what an agent produced before it lands. They are fluent in
git, diffs, test runners and the keyboard, and they distrust agents that say "all tests pass".

## Product Purpose

Tower supervises coding agents by **goal**, not by chat session. A goal is a contract (intent, acceptance criteria,
scope, budget, autonomy). The agent works in its own deny-by-default sandbox; when it claims it is done, Tower re-runs
the criteria itself in a fresh, credential-free checkout. The human reviews risk-ordered change units and seals the
result into a local branch. Success means: the user knows at a glance what needs them, never mistakes an agent's
claim for a proven fact, and reviews faster than agents produce code.

## Positioning

Chat-style agent tools show what an agent *says*. Tower shows what has been *proven*, and keeps four kinds of
statement apart everywhere: **Fact** (measured by Tower), **Observation** (seen inside the agent's sandbox),
**Claim** (written by the agent), **Human** (your contracts, approvals, seals). Green belongs only to a fresh,
untampered verifier pass. No neighbouring product can copy that rule without also building the verifier.

## Operating Context

- Glance-and-return: the five north-star questions (what needs me, what mode is each goal in, how far from done and
  on what evidence, what changed since I looked, what should I review first) must be answerable in about 3 seconds.
- Long sessions on a laptop or a half-screen window (1100–1800px wide), light or dark, English or Simplified Chinese.
- Keyboard first: ⌘K palette, `j/k`, `Space` quick peek, `⌘1–4` surfaces, `?` shortcut sheet, `1–9` on decisions.
- Away from the desk: an optional phone page (Tailscale) and ntfy pushes.
- Engines: Pi by default; Claude Code, Codex, Gemini CLI, OpenCode over ACP with explicit trust tiers.

## Capabilities and Constraints

- Surfaces: Overview board, Needs you (inbox of decisions), Goal page, Review (full window), New goal / contract
  editor, Learning (rules mined from review, per-model stats), Operations (schedules, merge queue, storage), Settings,
  Welcome (first run), command palette, shortcut sheet, peek drawer, accept/seal sheet, phone page.
- Terminology that is product truth: goal, contract, criteria (visible / held-out, `look` criteria), verifier, fact,
  observation, claim, sentinel, review unit, seal, needs you.
- Tower never pushes, opens PRs or merges remote branches; it writes one local commit authored by the user.
- Performance budgets: start-up JS ≤ 64 KB, total interface JS ≤ 160 KB, GoalPage ≤ 12 KB gzipped
  (`tools/bundle-budget.sh`); source files have a line limit (`tools/line-limit.sh`).
- Two locales ship (en, zh-CN), both must fit at 1100px.

## Brand Commitments

- Name: Tower (from an air-traffic control tower: one person supervising many autonomous objects, stepping in by
  exception). App icon in `assets/icon.png`.
- Voice: plain, exact, never cheerful about agent output. Agent text is labelled as the agent's ("Agent says"); the
  agent is never personified (no avatar, name or face).
- Colour rules are product rules, not styling: amber = needs a human decision (the only interrupting colour),
  green = verifier proof only, red = failure/danger; everything else is neutral.

## Evidence on Hand

- Real views dumped from a real supervisor running demo goals (`tools/e2e.sh`, `apps/desktop/e2e/rich.ts`).
- README screenshots in `assets/screenshots/`.
- No customer testimonials, usage numbers or benchmarks exist; do not invent them.

## Product Principles

1. Proof over prose: a statement's source is always visible, and colour follows proof, not mood.
2. Quiet until it needs you: normal work moves only in its own small, slow mark (a running goal's turning arc), never in colour; attention is spent only on human decisions.
3. The goal is the unit: every surface answers a question about goals, not about sessions or chats.
4. Keyboard and glance first, with a lossless way down: the full trace is always one key away.
5. Review capacity paces the work: review must stay faster than generation.

## Accessibility & Inclusion

Status must read without colour (shape first: glyphs and words carry the meaning). WCAG AA text contrast in both
themes, full keyboard reach, visible focus, reduced-motion and reduced-transparency respected, screen-reader names
on every control (`e2e/screenreader.spec.ts`, axe checks in e2e).
