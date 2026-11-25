/** The review header's stat line, fitted so its verdict is the last thing it gives up. */
import { onCleanup } from "solid-js";

/**
 * Fits the stat line to its room, measured again when the line or the verification group changes size. Short of room,
 * in order and each only while the verdict still lacks it: the pin pair goes (the seal carries the verified pin);
 * comparing runs, the line and file counts (the pickers name the range); the gaps close up; comparing, the pickers'
 * pins (the runs' names stay); and, only if the seal itself has no room, the buttons' key caps (their tooltips keep
 * the shortcuts). A part drops when the group wraps onto its hidden second line or the line runs over.
 */
export function fitStats(stats: HTMLDivElement) {
  const head = stats.closest<HTMLElement>(".review-head");
  const fit = () => {
    stats.classList.remove("pins-off", "counts-off", "tight", "short-picks");
    head?.classList.remove("keys-off");
    const verify = stats.querySelector<HTMLElement>(".review-verify");
    const seal = verify?.querySelector<HTMLElement>(".seal");
    // A part drops when the group wraps onto its hidden line, or when the criteria bar does inside itself.
    const wraps = (el: HTMLElement | null | undefined) => !!el && el.scrollHeight > el.clientHeight + 1;
    // The seal is out when it is not whole on the line you see: cut at the group's end or the line's, or wrapped below.
    const sealOut = () => {
      if (!seal || !verify) return false;
      const [s, v, l] = [seal.getBoundingClientRect(), verify.getBoundingClientRect(), stats.getBoundingClientRect()];
      return s.right > Math.min(v.right, l.right) + 0.5 || s.bottom > v.bottom + 0.5;
    };
    const drops = () => stats.scrollWidth > stats.clientWidth + 1 || wraps(verify) || wraps(verify?.querySelector<HTMLElement>(".criteria-bar")) || sealOut();
    const comparing = stats.classList.contains("comparing");
    // What gives way, in order, each only while the verdict still lacks room for it: the verdict goes last.
    type Step = [HTMLElement | null, string, () => boolean];
    const steps: Step[] = [
      [stats, "pins-off", drops],
      ...(comparing ? [[stats, "counts-off", drops] as Step] : []),
      [stats, "tight", drops],
      ...(comparing ? [[stats, "short-picks", drops] as Step] : []),
      [head, "keys-off", sealOut],
    ];
    for (const [el, cls, short] of steps) {
      if (!short()) break;
      el?.classList.add(cls);
    }
  };
  const ro = new ResizeObserver(fit);
  ro.observe(stats);
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
