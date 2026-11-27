# Design evidence

What the design work (`DESIGN_DELIVERY.md`) rests on, kept in the repository so it outlives `/tmp`.

- `*.before.webp` / `*.after.webp`: nine screens at `2fc8c54` and after the work, rendered by `e2e/shots.spec.ts`
  from the same dumped views.
- `marks-*.before.webp` / `marks-*.after.webp`: the status marks and motion redesign (D119), three screens at
  `872a863` and after it, from the same shots: the overview (en, light), a goal page (zh, dark) and the inbox.
- `reports/`: the independent reviews in order (`review-baseline`, `review-concept`, `review-milestone`,
  `review3`–`review13`), the external research (`research.md`), the two isolated Impeccable critiques and the first
  audit. Each review names the commit it read; the verdicts are tabled in `DESIGN_REVIEW.md`.
- `packaged-app/`: the debug `Tower.app` built from this branch, run on a demo seeded into its own `TOWER_HOME` with
  the scripted demo engine, captured through the accessibility tree (iteration 9). File names say which D-row each
  shows.

Working evidence that is too large to keep (every shot of every iteration, raw logs) stays under
`/tmp/tower-design/` and is not durable.

## Commit ids in the reports

`main` was rewritten on 2026-11-27 to correct the author address on 67 commits. Trees and dates are unchanged and
messages differ only in the ids they cite; the commit ids themselves are new. The reports are kept as the reviewers
wrote them, so they name the ids from before the rewrite, while `DESIGN_*.md` and this file name the ids as they are
now. Every id the reports cite:

| In the reports | Now |
|---|---|
| `bf22cad` | `2fc8c54` |
| `aa1026b` | `2b385e7` |
| `3faaf0c` | `42938a7` |
| `2a65eb1` | `dbb6776` |
| `815bd99` | `77eb888` |
| `d0dc2a1` | `30f9047` |
| `16ac40c` | `4698955` |
| `3145645` | `c1d1698` |
| `d6f07ef` | `bb976d3` |
| `4d0b9c4` | `d50f65e` |
| `7a23f45` | `66ac2aa` |
| `deef352` | `994b534` |
| `2f1d0c5` | `0498799` |
| `4ea4567` | `434d17e` |
| `886ab38` | `aecd02c` |
| `3ff2ebf` | `872a863` |
| `1c9af8a` | `8d79b1a` |
| `1ad1439` | `e21e4dd` |
| `ae1c049` | `352080f` |
| `2408609` | `80b9dce` |
| `2cd8b3d` | `11a9764` |
| `2d3eeb8` | `807dc40` |
| `f9dd353` | `48d5f3a` |
| `03999c0` | `dbae04c` |
| `54ba274` | `45be8f5` |
| `939be97` | `3dbc4c1` |
| `b6baa8a` | `5d6ee98` |
| `b59e68a` | `8842347` |
| `9397e07` | `97ee440` |
| `864d6c3` | `6b2c951` |
| `43576b0` | `9ac38f6` |
| `af6d189` | `b056c18` |
| `9c705a2` | `7b9d71f` |
| `744a71f` | `c7bad8b` |
