/**
 * The small onboarding actions shared by the welcome screen, the board and
 * Settings: adding a repository, starting the demo goal, opening Pi to log
 * in. They live apart from the welcome view so that view can load on first
 * run only and the start-up bundle stays small.
 */
import { open } from "@tauri-apps/plugin-dialog";

import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { installHint } from "../lib/labels";
import { go } from "../lib/nav";
import { act, refreshProjects, state, toast } from "../lib/store";
import { Button } from "./ui";

/**
 * Adds a repository. Nothing runs on its own: the toast offers to try the
 * tests on the base branch (in the sandbox, with the network for setup),
 * and Settings keeps the same offer.
 */
export async function pickProject() {
  const dir = await open({ directory: true, multiple: false, title: t("welcome.pickRepo") });
  if (typeof dir !== "string") return;
  const p = await act(() => api.addProject(dir));
  if (!p) return;
  await refreshProjects();
  toast("success", t("welcome.projectAdded"), {
    ttl: 8000,
    action: {
      label: t("settings.checkTests", { base: p.base_branch }),
      run: () => void act(() => api.checkProject(p.id)).then(() => refreshProjects()),
    },
  });
}

/** A demo goal on the bundled engine: asks, fixes, verifies, waits for review. */
export async function startDemo() {
  const g = await act(api.startDemo);
  if (!g) return;
  await refreshProjects();
  go({ name: "goal", id: g.id });
}

/** Opens Terminal running Pi, where `/login` connects a model account. */
export const openPiLogin = () => void act(api.openPiLogin);

/** Programs the demo needs and does not find (`EnvironmentStatus.demo_missing`). */
export const demoMissing = () => state.env?.demo_missing ?? [];

/**
 * The demo button, disabled with the reason and the install command when a
 * program it needs is missing. Primary when Pi is not usable.
 */
export function DemoButton(props: { size?: "s" | "m"; variant?: "primary" | "default" | "ghost" }) {
  const missing = () => demoMissing();
  const reason = () => (missing().length ? `${t("welcome.demoNeeds", { tools: missing().join(", ") })} ${missing().map(installHint).join(" · ")}` : t("welcome.demoHint"));
  return (
    <Button size={props.size} variant={props.variant} disabled={missing().length > 0} title={reason()} onClick={() => void startDemo()}>
      {t("welcome.tryDemo")}
    </Button>
  );
}
