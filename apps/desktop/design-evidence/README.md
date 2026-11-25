# Design evidence

What the design work (`DESIGN_DELIVERY.md`) rests on, kept in the repository so it outlives `/tmp`.

- `*.before.webp` / `*.after.webp`: nine screens at `bf22cad` and after the work, rendered by `e2e/shots.spec.ts`
  from the same dumped views.
- `reports/`: the independent reviews in order (`review-baseline`, `review-concept`, `review-milestone`,
  `review3`–`review11`), the external research (`research.md`), the two isolated Impeccable critiques and the first
  audit. Each review names the commit it read; the verdicts are tabled in `DESIGN_REVIEW.md`.
- `packaged-app/`: the debug `Tower.app` built from this branch, run on a demo seeded into its own `TOWER_HOME` with
  the scripted demo engine, captured through the accessibility tree (iteration 9). File names say which D-row each
  shows.

Working evidence that is too large to keep (every shot of every iteration, raw logs) stays under
`/tmp/tower-design/` and is not durable.
