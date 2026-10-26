import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";

import { render } from "solid-js/web";

import { App } from "./App";
import { init } from "./lib/store";

// Follow the system appearance; the attribute drives every token.
const media = window.matchMedia("(prefers-color-scheme: light)");
const applyTheme = () => (document.documentElement.dataset.theme = media.matches ? "light" : "dark");
applyTheme();
media.addEventListener("change", applyTheme);

void init();
render(() => <App />, document.getElementById("root")!);
