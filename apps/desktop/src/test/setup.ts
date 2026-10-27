/**
 * Test environment: jsdom plus a stubbed Tauri bridge. Every `invoke` resolves
 * to nothing and is recorded on `invoked`, so component tests can assert what
 * the interface asked the supervisor to do.
 */
import { cleanup } from "@solidjs/testing-library";
import { afterEach, vi } from "vitest";

export const invoked: { cmd: string; args: unknown }[] = [];

// Each test starts from an empty document.
afterEach(cleanup);

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: unknown) => {
    invoked.push({ cmd, args });
    return null;
  }),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("@tauri-apps/api/menu", () => ({
  Menu: { new: vi.fn(async () => ({ popup: vi.fn(async () => {}) })) },
  MenuItem: { new: vi.fn(async (o: unknown) => o) },
  CheckMenuItem: { new: vi.fn(async (o: unknown) => o) },
  PredefinedMenuItem: { new: vi.fn(async (o: unknown) => o) },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(async () => true), open: vi.fn(async () => null) }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(async () => {}), openPath: vi.fn(async () => {}) }));

// jsdom has no matchMedia; the theme and the review's width query read it at load.
if (!window.matchMedia) {
  window.matchMedia = (() => ({
    matches: false,
    media: "",
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
if (!("ResizeObserver" in window)) {
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

// The app loads one dictionary at a time; tests have both at once, synchronously. Imported after the shims above,
// since the dictionary module reaches the store and the theme, which read `matchMedia` as they load.
const [{ registerDict }, { en }, { zh }, { enLater }, { zhLater }] = await Promise.all([
  import("../lib/i18n"),
  import("../lib/locales/en"),
  import("../lib/locales/zh-CN"),
  import("../lib/locales/en.later"),
  import("../lib/locales/zh-CN.later"),
]);
registerDict("en", en);
registerDict("zh-CN", zh);
registerDict("en", enLater);
registerDict("zh-CN", zhLater);
