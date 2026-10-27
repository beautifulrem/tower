/**
 * The `?` sheet: every shortcut that works right now, read from the live
 * key registry (`lib/keys.ts`) rather than a hand-kept list, so it cannot
 * drift from what the views actually bind. Scopes nearest to the view come
 * first; "Everywhere" last. Loaded on first open; the key lives in App.
 */
import { For, createMemo } from "solid-js";

import { t } from "../lib/i18n";
import { type Binding, activeScopes } from "../lib/keys";
import { closeShortcuts } from "../lib/layers";
import { Kbd, Overlay } from "./ui";

export function ShortcutSheet() {
  const groups = createMemo(() => {
    const by = new Map<string, Binding[]>();
    for (const s of activeScopes()) {
      const described = s.bindings.filter((b) => b.desc && (!b.when || b.when()));
      if (!described.length) continue;
      const name = s.name();
      by.set(name, [...(by.get(name) ?? []), ...described]);
    }
    const everywhere = t("keys.everywhere");
    // The view's own keys first (registered last), the global ones at the end.
    return [...by.entries()]
      .map(([name, bindings]) => ({ name, bindings }))
      .reverse()
      .sort((a, b) => Number(a.name === everywhere) - Number(b.name === everywhere));
  });
  return (
    <Overlay onClose={closeShortcuts} label={t("keys.title")} title={t("keys.title")} instant class="panel panel-wide panel-tracked">
      <div class="keys-sheet">
        <For each={groups()}>
          {(g) => (
            <section class="keys-group">
              <h3 class="keys-group-title halt">{g.name}</h3>
              <For each={g.bindings}>
                {(b) => (
                  <div class="keys-row">
                    <span class="keys-desc">{b.desc!()}</span>
                    <span class="keys-keys">
                      <Kbd k={b.hint ?? b.key} />
                    </span>
                  </div>
                )}
              </For>
            </section>
          )}
        </For>
      </div>
      <p class="meta t3 keys-note">
        {t("keys.note")} {t("keys.tabNote")}
      </p>
    </Overlay>
  );
}
