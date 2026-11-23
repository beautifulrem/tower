// The saved theme and size on the first frame, before the bundle runs (lib/theme.ts applies the same, with the same
// storage keys, once it does): a light-theme window must not open dark. Classic and same-origin, so it runs in <head>
// under the CSP's default-src 'self'.
(function () {
  try {
    var d = document.documentElement;
    var c = localStorage.getItem("tower.theme");
    var s = localStorage.getItem("tower.size");
    d.dataset.theme = c === "light" || (c !== "dark" && matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark";
    d.dataset.size = s === "compact" || s === "large" ? s : "standard";
  } catch (e) {
    // No storage: the bundle decides, as before.
  }
})();
