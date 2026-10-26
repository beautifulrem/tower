import "@fontsource-variable/inter/opsz.css";
import "@fontsource-variable/jetbrains-mono";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";

import { render } from "solid-js/web";

import { App } from "./App";
import { ensureLocale, syncDocumentLang, systemLocale } from "./lib/i18n";
import { init } from "./lib/store";

import { watchTheme } from "./lib/theme";

watchTheme();
syncDocumentLang();

// Every textarea grows with its content (no web-style drag handles).
const fit = (el: HTMLTextAreaElement) => {
  const rows = Number(el.getAttribute("rows") ?? 1);
  const line = parseFloat(getComputedStyle(el).lineHeight) || 20;
  const pad = parseFloat(getComputedStyle(el).paddingTop) + parseFloat(getComputedStyle(el).paddingBottom);
  el.style.height = "auto";
  const lines = Math.min(10, Math.max(rows, Math.ceil((el.scrollHeight - pad) / line)));
  el.style.height = `${lines * line + pad + 2}px`;
};
document.addEventListener("input", (e) => e.target instanceof HTMLTextAreaElement && fit(e.target));
new MutationObserver((records) => {
  for (const r of records)
    for (const n of r.addedNodes)
      if (n instanceof HTMLElement) n.querySelectorAll("textarea").forEach((t) => requestAnimationFrame(() => fit(t)));
}).observe(document.body, { childList: true, subtree: true });

// The system language's words arrive before the first frame (a local file, one round trip); the setting's, if
// it names the other language, before the replica is shown (`init` waits for them).
void init();
void ensureLocale(systemLocale).then(() => render(() => <App />, document.getElementById("root")!));
