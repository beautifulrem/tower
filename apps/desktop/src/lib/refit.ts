import { onCleanup } from "solid-js";

/**
 * Runs a measured give-way again whenever what it measures may have moved: the element's box (the window, its column),
 * its text and children (a language, a reading that comes or goes), and once the fonts are in. Call it from a `ref`.
 */
export function refit(el: HTMLElement, fit: () => void): void {
  const ro = new ResizeObserver(fit);
  const mo = new MutationObserver(fit);
  ro.observe(el);
  mo.observe(el, { subtree: true, characterData: true, childList: true });
  void document.fonts?.ready.then(fit);
  onCleanup(() => (ro.disconnect(), mo.disconnect()));
}
