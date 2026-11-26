import { onCleanup } from "solid-js";

/**
 * Runs a measured give-way again whenever what it measures may have moved: the element's box (the window, its column),
 * its text and children (a language, a reading that comes or goes), and once the fonts are in. Call it from a `ref`.
 * `later`: the give-way moves the element's own size (an approval's command, whose rows a word's give-way changes), so a
 * change of its box is answered in the next frame: answered in the same one, the observer finds the box it has just
 * reported changed again and reports a loop (review 13's rule; review 24). Its text and fonts are still answered at once,
 * so its first frame is already fitted.
 */
export function refit(el: HTMLElement, fit: () => void, later?: boolean): void {
  const ro = new ResizeObserver(later ? () => requestAnimationFrame(fit) : fit);
  const mo = new MutationObserver(fit);
  ro.observe(el);
  mo.observe(el, { subtree: true, characterData: true, childList: true });
  void document.fonts?.ready.then(fit);
  onCleanup(() => (ro.disconnect(), mo.disconnect()));
}
