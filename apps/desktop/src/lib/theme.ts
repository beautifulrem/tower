/** Appearance: follow the system, or a fixed light or dark theme; and the interface size. */
export type ThemeChoice = "system" | "light" | "dark";
export type SizeChoice = "compact" | "standard" | "large";

const KEY = "tower.theme";
const SIZE_KEY = "tower.size";
const media = window.matchMedia("(prefers-color-scheme: light)");

export function themeChoice(): ThemeChoice {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "system";
}

function apply() {
  const c = themeChoice();
  const light = c === "light" || (c === "system" && media.matches);
  // The attribute drives every token (styles/tokens.css).
  document.documentElement.dataset.theme = light ? "light" : "dark";
  document.documentElement.dataset.size = sizeChoice();
}

export function setThemeChoice(c: ThemeChoice) {
  localStorage.setItem(KEY, c);
  apply();
}

export function sizeChoice(): SizeChoice {
  const v = localStorage.getItem(SIZE_KEY);
  return v === "compact" || v === "large" ? v : "standard";
}

export function setSizeChoice(c: SizeChoice) {
  localStorage.setItem(SIZE_KEY, c);
  apply();
}

export function watchTheme() {
  apply();
  media.addEventListener("change", apply);
}
