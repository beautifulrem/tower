/** Grows a textarea with its content between `min` and `max` lines. */
export function autogrow(el: HTMLTextAreaElement, min = 1, max = 8) {
  const line = parseFloat(getComputedStyle(el).lineHeight) || 20;
  const pad = parseFloat(getComputedStyle(el).paddingTop) + parseFloat(getComputedStyle(el).paddingBottom);
  const fit = () => {
    el.style.height = "auto";
    const lines = Math.min(max, Math.max(min, Math.ceil((el.scrollHeight - pad) / line)));
    el.style.height = `${lines * line + pad + 2}px`;
    el.style.overflowY = el.scrollHeight - pad > max * line ? "auto" : "hidden";
  };
  el.addEventListener("input", fit);
  queueMicrotask(fit);
  new ResizeObserver(fit).observe(el);
}
