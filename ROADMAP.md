# Roadmap

Tower's direction comes from `docs/00` (vision), `docs/16` (roadmap in the design), and `docs/18-evolution-roadmap.md` (the 2026-11 competitive evolution roadmap). This page tracks what has shipped and what is next in practice.

## Shipped (2026-11 Evolution)

- **Anti-cheat verification & AST (`crates/tower-ast`)**: tree-sitter Rust/JS/TS/Python/Bash structural analysis; multi-process assertion-identity guard (`report.finished < report.started`), exit-listener hardening, and Node 22.15+/24 ESM `module.registerHooks()` guard; Rust inline `#[cfg(test)]` restoration in source-only re-runs; `rust_test_branch_cheat` sentinel; `Confined` bypass-around-bug escalation; human-approved synthetic holdout drafts; automatic 1× flaky-test rerun (`CriterionFlaky`).
- **Sandboxing & Operations**: persistent sandboxed filesystem helper (`--fs-helper`); Seatbelt prompt-poisoning & hard-link (`(deny file-link)`) hardening; cross-platform `SandboxBackend` trait with Linux (`bubblewrap` + Landlock + cgroups v2) and macOS 26+ Apple Containerization MicroVM support; per-goal 10-port loopback pool (`ports_pool`); CDP browser console-error capture + desktop/mobile visual evidence; disk inventory & safe cleanup (`Storage & Sandbox`).
- **Multi-Engine ACP & Policy**: generic ACP adapter (`Pi`, `Claude Code`, `Codex`, `Gemini CLI`, `OpenCode`) with explicit `EngineTrustLevel` (`FullS2` / `RestrictedS2` / `Experimental`) and fail-closed Trust Gate; POSIX shell parser (`shell_parse.ts`); `submit(outcome: "blocked")` & anti-probe early stall (`ProbeTracker`); multimodal image prompts; async non-blocking remote HTTP + `/api/events` SSE.
- **SQLite, Learning, Schedules & Merge Queue**: SQLite WAL concurrent read pool; Git snapshot timeline (`All Changes` / `Since Last Review` / `Last Turn` / `Compare Runs…`) & `merge-tree` conflict prediction; Learning console (tainted memory ratification queue with high-taint edit/`CONFIRM` gate + calibration scoreboard); Operations console (scheduled goals with unattended-strict one-way-door pause, merge queue, storage); cross-goal `depends_on`; layered model escalation; auto-updater (`tauri-plugin-updater`) + signed/notarized release workflow & Homebrew cask.
- **Anti-Chat Instrument Console (`docs/19-anti-chat-console-design.md`)**: Flight-Strip Overview Board + Space-key Quick Peek Drawer + 5-clause Contract Studio + Goal Command Deck (Six-Step verification bench, two-column Claim vs Fact Honesty Ledger, multimodal `@file` Steering Console) + Review Theater (Split-Geometry virtualized diff past 400 rows, AST `Moved unchanged`/`Formatting only` collapse, Acceptance Seal checklist).

## Next

- **Signed production release distribution**: enable Apple Developer notarization & Tauri updater signing keys in CI secrets (`RELEASING.md`).
- **Live adversarial corpus in CI**: run `tools/adversarial.sh` on scheduled releases with real models to continuously benchmark new bypass classes.
- **Remote & multi-machine execution**: optional `serve` daemon mode and remote workspace runners while keeping the same contract/verification invariants.

Have a use case that does not fit? Open an issue describing the problem.
