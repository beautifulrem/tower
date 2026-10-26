/**
 * The floating layers' open state — the command palette, the shortcut
 * sheet, the activity log — kept apart from the layers themselves, which
 * load on first open. The title bar, the menu bar and the keys open them
 * through these; nothing here pulls a layer's code into start-up.
 */
import { createSignal } from "solid-js";

import { markActivitySeen } from "./store";

const [paletteOpen, setPaletteOpen] = createSignal<false | "keyboard" | "mouse">(false);
/** Open the palette; from the keyboard it appears at once, from the mouse it lifts. */
export const openPalette = (how: "keyboard" | "mouse" = "keyboard") => setPaletteOpen(how);
export const closePalette = () => setPaletteOpen(false);
export const togglePalette = () => setPaletteOpen((o) => (o ? false : "keyboard"));
export { paletteOpen };

const [shortcutsOpen, setShortcutsOpen] = createSignal(false);
export const openShortcuts = () => setShortcutsOpen(true);
export const closeShortcuts = () => setShortcutsOpen(false);
export const toggleShortcuts = () => setShortcutsOpen((o) => !o);
export { shortcutsOpen };

const [activityOpen, setActivityOpen] = createSignal(false);
export const openActivity = () => {
  markActivitySeen();
  setActivityOpen(true);
};
export const closeActivity = () => setActivityOpen(false);
export const toggleActivity = () => (activityOpen() ? setActivityOpen(false) : openActivity());
export { activityOpen };
