/**
 * The sheets you read in (Accept, Verify, Request changes, the look comparison, Activity, the shortcut table) at the
 * smallest window Tower opens, 1040×640, and with the interface set large: each sheet stays inside the window, its body
 * scrolls, and its actions stay on screen and take the pointer — a sheet whose Accept is below the window's edge
 * cannot be answered with the mouse. They are opaque: the board does not show through what you read.
 */
import { expect, type Page, test } from "@playwright/test";

import { enrichLook, enrichRich } from "./rich";
import { openTower, settled } from "./tauri";

interface Sheet {
  name: string;
  route: string;
  enrich: (F: Record<string, any>) => void;
  open: (page: Page) => Promise<void>;
}

const keys =
  (...k: string[]) =>
  async (page: Page) => {
    for (const key of k) await page.keyboard.press(key);
  };

const sheets: Sheet[] = [
  { name: "Accept", route: "review/G-0001", enrich: enrichRich, open: keys("Meta+Shift+Enter") },
  { name: "Verify", route: "review/G-0001", enrich: enrichLook, open: keys("e") },
  { name: "Request changes", route: "review/G-0001", enrich: enrichRich, open: keys("c") },
  { name: "Look", route: "goal/G-0001", enrich: enrichLook, open: (page) => page.locator(".look-img-btn").first().click() },
  { name: "Activity", route: "overview", enrich: enrichRich, open: keys("Meta+Shift+L") },
  { name: "Shortcuts", route: "overview", enrich: enrichRich, open: keys("Shift+Slash") },
];

/** Every action button is inside the window and is what a click at its centre lands on. */
async function actionsReachable(page: Page) {
  return page.evaluate(() => {
    const dialog = [...document.querySelectorAll<HTMLElement>("[role=dialog]")].pop()!;
    const d = dialog.getBoundingClientRect();
    const out: string[] = [];
    if (d.top < 0 || d.bottom > innerHeight + 0.5) out.push(`sheet ${Math.round(d.top)}..${Math.round(d.bottom)} outside 0..${innerHeight}`);
    for (const b of dialog.querySelectorAll<HTMLElement>(".panel-actions button")) {
      const r = b.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (y < 0 || y > innerHeight || !hit || !b.contains(hit)) out.push(`"${b.textContent?.trim()}" at ${Math.round(y)} not reachable`);
    }
    return out;
  });
}

for (const size of ["standard", "large"] as const) {
  for (const s of sheets) {
    test(`at 1040×640 (${size}) the ${s.name} sheet fits the window and its actions take the pointer, scrolled or not`, async ({ page }) => {
      await page.setViewportSize({ width: 1040, height: 640 });
      await page.addInitScript((sz) => localStorage.setItem("tower.size", sz), size);
      await openTower(page, s.route, { lang: "en", enrich: s.enrich });
      await settled(page, s.route);
      await s.open(page);
      const dialog = page.getByRole("dialog").last();
      await expect(dialog).toBeVisible();
      await settled(page);
      expect(await actionsReachable(page)).toEqual([]);
      // Scrolled to its end, the last of the body is above the actions, not under them.
      await dialog.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      expect(await actionsReachable(page)).toEqual([]);
      const covered = await dialog.evaluate((el) => {
        const actions = el.querySelector(":scope > .panel-actions");
        const body = [...el.children].filter((c) => c !== actions).pop();
        if (!actions || !body) return 0;
        return body.getBoundingClientRect().bottom - actions.getBoundingClientRect().top;
      });
      expect(covered).toBeLessThanOrEqual(0.5);
    });
  }
}

for (const theme of ["light", "dark"] as const) {
  test(`the sheets you read in are opaque (${theme})`, async ({ page }) => {
    await openTower(page, "overview", { lang: "en", theme, enrich: enrichRich });
    await settled(page, "overview");
    await page.keyboard.press("Shift+Slash");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const alpha = await dialog.evaluate((el) => {
      const cv = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
      cv.fillStyle = getComputedStyle(el).backgroundColor;
      cv.fillRect(0, 0, 1, 1);
      return cv.getImageData(0, 0, 1, 1).data[3];
    });
    expect(alpha).toBe(255);
  });
}

// A sheet with more below says so: a fade above its actions while the body runs on under them, gone at the end. With
// overlay scrollbars nothing else shows there is more, and Accept sits right there.
for (const s of sheets.filter((x) => x.name !== "Look")) {
  test(`at 1040×640 (large) the ${s.name} sheet shows when there is more below its actions`, async ({ page }) => {
    await page.setViewportSize({ width: 1040, height: 640 });
    await page.addInitScript(() => localStorage.setItem("tower.size", "large"));
    await openTower(page, s.route, { lang: "en", enrich: s.enrich });
    await settled(page, s.route);
    await s.open(page);
    const dialog = page.getByRole("dialog").last();
    await expect(dialog).toBeVisible();
    await settled(page);
    const fade = () =>
      dialog.evaluate((el) => {
        const actions = el.querySelector(":scope > .panel-actions");
        const more = el.scrollHeight - el.scrollTop - el.clientHeight > 8;
        const shown = !!actions && getComputedStyle(actions, "::before").opacity === "1";
        return { more, shown };
      });
    const top = await fade();
    expect(top.shown).toBe(top.more);
    if (!top.more) return;
    await dialog.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await expect.poll(fade).toEqual({ more: false, shown: false });
  });
}

// Tab stays in the sheet: however WebKit walks the controls (plain Tab skips buttons unless macOS Full Keyboard Access
// is on), focus never lands on the board behind a modal sheet.
for (const s of sheets.filter((x) => x.name !== "Look")) {
  test(`Tab and Shift-Tab never leave the ${s.name} sheet`, async ({ page }) => {
    await openTower(page, s.route, { lang: "en", enrich: s.enrich });
    await settled(page, s.route);
    await s.open(page);
    const dialog = page.getByRole("dialog").last();
    await expect(dialog).toBeVisible();
    const outside: string[] = [];
    for (const key of [...Array(12).fill("Tab"), ...Array(12).fill("Shift+Tab")]) {
      await page.keyboard.press(key);
      const where = await page.evaluate(() => {
        const d = [...document.querySelectorAll("[role=dialog]")].pop()!;
        const a = document.activeElement;
        return a && d.contains(a) ? null : `${a?.tagName.toLowerCase()}.${a?.className}`;
      });
      if (where) outside.push(`${key}: ${where}`);
    }
    expect(outside).toEqual([]);
  });
}

// A sheet opened inside another (Look from Verify) walks its own controls once per Tab, every one of them, and never
// lets focus out to the sheet underneath.
test("Tab in the Look sheet opened from Verify walks every Look control and stays in it", async ({ page }) => {
  await openTower(page, "review/G-0001", { lang: "en", enrich: enrichLook });
  await settled(page, "review/G-0001");
  await page.keyboard.press("e");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.locator("[role=dialog] .look-img-btn").first().click();
  await expect(page.getByRole("dialog")).toHaveCount(2);
  const look = page.getByRole("dialog").last();
  const controls = await look.evaluate((d) =>
    [...d.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select, textarea, [href], [tabindex='0']")]
      .filter((el) => el.offsetParent !== null).length,
  );
  const seen = new Set<string>();
  const outside: string[] = [];
  for (const key of [...Array(controls + 2).fill("Tab"), ...Array(controls + 2).fill("Shift+Tab")]) {
    await page.keyboard.press(key);
    const at = await page.evaluate(() => {
      const d = [...document.querySelectorAll("[role=dialog]")].pop()!;
      const a = document.activeElement as HTMLElement | null;
      if (!a || !d.contains(a)) return { out: `${a?.tagName}.${a?.className}` };
      return { id: [...d.querySelectorAll("*")].indexOf(a).toString() };
    });
    if ("out" in at) outside.push(`${key}: ${at.out}`);
    else seen.add(at.id);
  }
  expect(outside).toEqual([]);
  expect(seen.size).toBe(controls);
});
