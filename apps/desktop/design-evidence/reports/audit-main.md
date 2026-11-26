# Audit A (main agent) + Audit B (Unslop) — baseline bf22cad

Evidence: /tmp/tower-design/baseline/shots (1440×900@2x unless noted).

## Main-agent findings (product / IA / workflow / engineering)

M1. Floating material leaks content (palette, peek drawer). Board text is legible through both layers and collides
    with their own text (final-palette-light.png: "buntu-latest, node 22)" over "Review G-0001"; final-peek-drawer-dark.png:
    "just now", "G-0004", "Spend/Updated/Identity" inside the drawer's criteria and budget blocks). Same in the shipped
    README image assets/screenshots/peek.png. The peek drawer is a sheet you read in (criteria, budget, cause); the
    project's own rule (docs/19 §19.6) keeps reading sheets opaque. Cause: --material-float alpha 0.84–0.86 relies on
    backdrop blur; where blur is not composited the layer is a 14–16% veil.
M2. Goal page buries the evidence. goal-G-0001: header (4 meta lines) → CI decision → Next → Cause (claim) →
    Sentinels (4 items with multi-line detail) → Criteria below the fold at 1440×900 and at 1800. North-star Q3 ("how far
    from done, on what evidence") needs a scroll; a claim (Cause) sits above the facts. G-0005 shows the error stack twice
    (decision card + criterion C1).
M3. Verdict copy "Passed, not evidence" (goal header, review header, accept seal, readout) is a contradiction to parse
    under load. The seal on the accept sheet sets it at display size in a dashed box with the SHA in a second dashed box.
M4. "To review" in the sidebar navigates to the same Needs-you route as "Needs you" (Sidebar.tsx:100) — two rows, one
    destination, no active state; the palette already has "Review every ready goal in turn ⇧R", the actual job.
M5. Contract editor: the executable criteria (the product's core) start below four free-text fields, two optional; a
    masthead in tracked uppercase ("CONTRACT SHOP NEW") contradicts the project's own anti-pattern list; clause numbers
    jump 01 → 02 (left) → 04 (right column) with 03 below the fold; the sticky action bar spans only the left column.
M6. Copy craft: lazy plurals "{n} high sentinel(s)", "{n} human check(s) left" (accept seal); jargon "Memory
    ratification", "Ratify and start", "Live telemetry", "Projection & budget", "Posture" as the header of a Ready/Conflict
    column (Operations), "Full S2 · All ops sandboxed by Tower S2" (Settings).
M7. Accept sheet repeats a "Sentinels" heading twice (high under "Not evidence…", low under "To look at") and lists the
    same blockers as chips above.
M8. Colour discipline leaks: Learning's calibration table draws 1st-pass rate as green bars and sentinel rate as red
    bars — status hues on statistics, against "green only for a fresh verifier pass".
M9. Overview: on the overview route the sidebar repeats the board (same goals, same groups) — two copies of one list
    side by side; 55–60% of the 1440×900 board is empty while goal titles truncate in the sidebar.
M10. Bundle budget has <2 KB headroom (162,742 / 163,840 B) — any new feature JS must be paid for.

## Unslop audit (signs.md), verdict: LIGHT SLOP → polish mode, direction kept from the existing brand

Surfaces/colour: no gradients, glows, blobs, neon borders. Status hues on statistics (M8). Translucent "glass" where
an opaque surface reads better (M1).
Type: one uppercase tracked label (contract masthead, app.css:3570). Weights 400/500 (one 580, two 600). No italic.
Icons: one line set, one stroke, text-role colours. No emoji.
Spacing: on the 4px grid; equal rows. Board leaves a dead band below a short list (M9).
Copy: lazy plurals, jargon (M6); "Passed, not evidence" (M3). No exclamation marks, no hype.
Components: dashed box-in-box seal (M3). Keycaps for shortcuts — consistent.
Motion: no infinite or decorative motion; 0ms keyboard layers.

Direction (five lines):
- Product: a desk where one engineer runs several coding agents and steps in only for decisions and review.
- Character: still, exact, sceptical.
- World: a control tower at night — flight strips, instrument readouts, a logbook.
- Moments: the evidence gauge (verified vs observed criteria) and the diff under review.
- Signature: the provenance gutter (Measured / Agent says / You) and the amber diamond that means "needs you".
