/**
 * Settings' index: its seven clauses by name (they are not a sequence, so
 * not numbered), standing beside the page the way the contract's schedule
 * stands beside its clauses.
 * A click (or ↩ on a link) brings the clause to the top; the clause in view
 * carries the 2px pen — the same mark as the current hunk and the selected
 * row — so a long page always says where you are in it.
 */
import { For, createSignal, onCleanup, onMount } from "solid-js";

import { t } from "../lib/i18n";

type ClauseKey = "environment" | "engineDefaults" | "memory" | "projects" | "phone" | "attention" | "appearance";

export const SETTINGS_CLAUSES: { id: string; key: ClauseKey }[] = [
  { id: "set-environment", key: "environment" },
  { id: "set-engine", key: "engineDefaults" },
  { id: "set-memory", key: "memory" },
  { id: "set-projects", key: "projects" },
  { id: "set-phone", key: "phone" },
  { id: "set-attention", key: "attention" },
  { id: "set-appearance", key: "appearance" },
];

const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export function SettingsIndex() {
  const [current, setCurrent] = createSignal(SETTINGS_CLAUSES[0].id);
  let pinnedUntil = 0;
  onMount(() => {
    // The clause whose head has passed the top fifth of the window is the one you are in.
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        // A clause chosen in the index stays the marked one while the page scrolls to it (the last clauses can never
        // reach the top of the window, so the band would name the one under them).
        if (Date.now() < pinnedUntil) return;
        const first = SETTINGS_CLAUSES.find((c) => seen.get(c.id));
        if (first) setCurrent(first.id);
      },
      { rootMargin: "-12% 0px -68% 0px" },
    );
    // Some clauses wait for the settings to load: watch them as they appear.
    const watch = () => SETTINGS_CLAUSES.forEach((c) => document.getElementById(c.id) && io.observe(document.getElementById(c.id)!));
    watch();
    const mo = new MutationObserver(watch);
    const page = document.querySelector(".settings");
    if (page) mo.observe(page, { childList: true });
    onCleanup(() => (io.disconnect(), mo.disconnect()));
  });
  const go = (e: MouseEvent, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    pinnedUntil = Date.now() + 1000;
    el.scrollIntoView({ block: "start", behavior: reduced() ? "auto" : "smooth" });
    setCurrent(id);
    el.querySelector<HTMLElement>(".clause-title")?.focus({ preventScroll: true });
  };
  return (
    <nav class="settings-index halt" aria-label={t("settings.indexLabel")}>
      <ul>
        <For each={SETTINGS_CLAUSES}>
          {(c) => (
            <li>
              <a href={`#${c.id}`} aria-current={current() === c.id ? "location" : undefined} classList={{ current: current() === c.id }} onClick={(e) => go(e, c.id)}>
                {t(`settings.${c.key}`)}
              </a>
            </li>
          )}
        </For>
      </ul>
    </nav>
  );
}
