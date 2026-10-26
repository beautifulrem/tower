import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";

import { render } from "solid-js/web";

import { App } from "./App";
import { init } from "./lib/store";

import { watchTheme } from "./lib/theme";

watchTheme();

void init();
render(() => <App />, document.getElementById("root")!);
