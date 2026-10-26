# Roadmap

Tower's direction comes from `docs/00` (vision) and `docs/16` (roadmap in the design). This page tracks what is next in practice. Items move to `CHANGELOG.md` when they ship.

## Now

- Signed, notarized releases and a Homebrew cask (`RELEASING.md`); automatic updates.
- Verification you can trust under pressure: more sentinel samples from real agent runs; red → green evidence on every criterion.
- Review: editing in the diff, and per-hunk notes that steer the agent.

## Next

- **More engines.** Claude Code runs through the Agent Client Protocol already; Codex next, through the same bridge.
- **Away from the desk.** A read-only phone view with approvals over your own network (Tailscale or LAN), so a question does not wait for you to get back.
- **Visual evidence** for UI work: screenshots of the running app attached to a verification, compared with the base.

## Later

- Scheduled goals (nightly dependency updates, flaky-test hunts) with the same contract and verification.
- Linux, with an equivalent sandbox (bubblewrap/Landlock).
- Merge queue across goals of one project.

Have a use case that does not fit? Open an issue describing the problem.
