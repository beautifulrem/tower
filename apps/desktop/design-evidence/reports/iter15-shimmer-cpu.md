# Iteration 15: the running goal page's CPU at rest (R14-P3-02)

Measured the way review 14 measured it: `goal/G-0002`, the running goal heard from just now, pointer moved away,
then the CPU time of every Playwright WebKit process summed over 6 s of rest (percent of one core). Three rounds,
one worker, the same machine and minutes. "old-shimmer" is this tree with `src/styles/app.css` swapped back to
`1ad1439` (the `background-clip: text` shimmer animating `background-position`); "new" is the transform-only band.
Headless WebKit, not the packaged WKWebView.

| Tree | Everything on | Shimmer stopped | Motion reduced |
|---|---|---|---|
| old-shimmer (`1ad1439` app.css) | 38.3, 33.0, 37.2 | 8.7, 10.0, 8.5 | 7.2, 8.0, 8.3 |
| new (iteration 15) | 11.0, 8.8, 9.2 | 8.8, 9.0, 8.8 | 7.3, 7.3, 7.3 |

The shimmer's own share falls from about 26–29 points of a core to 0–2. Raw log: `cpu.log` lines `old-shimmer` and
`new`, produced by a temporary spec (`e2e/tmp-iter15-cpu.spec.ts`, deleted after the run).
