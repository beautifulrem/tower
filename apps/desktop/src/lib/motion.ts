/**
 * Tower's durations for motion driven from script (docs/12 §12.7), zero when
 * the system asks for reduced motion — the same answer the CSS gives, so a
 * fold timed in JS and a fade timed in CSS stop together.
 */
export const reducedMotion = (): boolean => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The base duration (--dur-base, 160ms): a receipt rising, a slot folding, a gauge turning. */
export const baseMs = (): number => (reducedMotion() ? 0 : 160);

/** The spatial duration (--dur-space, 220ms): a row moving to its new group, entering review. */
export const spaceMs = (): number => (reducedMotion() ? 0 : 220);
