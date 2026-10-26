/** Appearance: follow the system, or a fixed light or dark theme. */
export type ThemeChoice = "system" | "light" | "dark";

const KEY = "tower.theme";
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
}

export function setThemeChoice(c: ThemeChoice) {
  localStorage.setItem(KEY, c);
  apply();
}

export function watchTheme() {
  apply();
  media.addEventListener("change", apply);
}
