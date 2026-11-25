/** The review header's stat line, fitted so its verdict is the last thing it gives up. */
import { onCleanup, onMount } from "solid-js";

/**
 * Fits the stat line to its room, measured again when the line or the verification group changes size. Short of room,
 * in order and each only while the verdict still lacks it: the pin pair goes (the seal carries the verified pin);
 * comparing runs, the line and file counts (the pickers name the range); the gaps close up; comparing, the pickers'
 * pins (the runs' names stay); and, only if the verdict itself (the seal or a criteria segment) has no room, a gone
 * end's words, for a short word before its pin (its tooltip keeps the whole name), and last the buttons' key caps
 * (their tooltips keep the shortcuts). A part drops when the group wraps onto its hidden second line or the line runs
 * over.
 */
export function fitStats(stats: HTMLDivElement) {
  const fit = () => {
    // Found on every fit, never once up front: the ref runs while the line is not yet in the header.
    const head = stats.closest<HTMLElement>(".review-head");
    stats.classList.remove("pins-off", "counts-off", "tight", "short-picks", "gone-short");
    head?.classList.remove("keys-off");
    const verify = stats.querySelector<HTMLElement>(".review-verify");
    const seal = verify?.querySelector<HTMLElement>(".seal");
    // A part drops when the group wraps onto its hidden line, or when the criteria bar does inside itself.
    const wraps = (el: HTMLElement | null | undefined) => !!el && el.scrollHeight > el.clientHeight + 1;
    const bar = verify?.querySelector<HTMLElement>(".criteria-bar");
    // The verdict is out when its seal or its criteria segments are not whole on the line you see: cut at the end of a
    // box that clips them (the bar for the segments, which shrinks to its room; the group; the line), or wrapped below.
    const out = (el: HTMLElement | null | undefined, clips: (HTMLElement | null | undefined)[]) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return clips.some((c) => {
        if (!c) return false;
        const k = c.getBoundingClientRect();
        return r.right > k.right + 0.5 || r.bottom > k.bottom + 0.5;
      });
    };
    const verdictOut = () => !!verify && (out(seal, [verify, stats]) || out(bar?.querySelector<HTMLElement>(".segs"), [bar, verify, stats]));
    const drops = () => stats.scrollWidth > stats.clientWidth + 1 || wraps(verify) || wraps(bar) || verdictOut();
    const comparing = stats.classList.contains("comparing");
    // What gives way, in order, each only while the verdict still lacks room for it: the verdict goes last.
    type Step = [HTMLElement | null, string, () => boolean];
    const steps: Step[] = [
      [stats, "pins-off", drops],
      ...(comparing ? [[stats, "counts-off", drops] as Step] : []),
      [stats, "tight", drops],
      ...(comparing ? [[stats, "short-picks", drops] as Step] : []),
      ...(comparing ? [[stats, "gone-short", verdictOut] as Step] : []),
      [head, "keys-off", verdictOut],
    ];
    for (const [el, cls, short] of steps) {
      if (!short()) break;
      el?.classList.add(cls);
    }
  };
  const ro = new ResizeObserver(fit);
  ro.observe(stats);
  // The header too, once the line is in it: a window resize then reports the header with the line, so the line's own
  // change when the key caps go is reported again in the same frame, not left over as a loop.
  onMount(() => {
    const head = stats.closest(".review-head");
    if (head) ro.observe(head);
  });
  const watchVerify = new MutationObserver(() => {
    const verify = stats.querySelector(".review-verify");
    if (verify) ro.observe(verify);
    fit();
  });
  watchVerify.observe(stats, { childList: true, subtree: true, characterData: true });
  const verify = stats.querySelector(".review-verify");
  if (verify) ro.observe(verify);
  onCleanup(() => (ro.disconnect(), watchVerify.disconnect()));
}
