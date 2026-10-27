/** Grows a textarea with its content between `min` and `max` lines. */
export function autogrow(el: HTMLTextAreaElement, min = 1, max = 8) {
  // Its own limits: the every-textarea fit in main.tsx leaves it alone.
  el.dataset.autogrow = "";
  const fit = () => {
    // Measured when it is on the page: a textarea not yet attached has no computed style (Solid's ref runs before insertion).
    if (!el.isConnected) return;
    const style = getComputedStyle(el);
    const line = parseFloat(style.lineHeight) || 20;
    const pad = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    el.style.height = "auto";
    const lines = Math.min(max, Math.max(min, Math.ceil((el.scrollHeight - pad) / line)));
    el.style.height = `${lines * line + pad + 2}px`;
    el.style.overflowY = el.scrollHeight - pad > max * line ? "auto" : "hidden";
  };
  el.addEventListener("input", fit);
  queueMicrotask(fit);
  // A new width rewraps the text; a new height is fit's own doing, and answering it would loop.
  let width = -1;
  new ResizeObserver(([entry]) => {
    if (entry.contentRect.width === width) return;
    width = entry.contentRect.width;
    fit();
  }).observe(el);
}
