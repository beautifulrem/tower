/**
 * A file's text in the review belongs to one snapshot. A read that the snapshot outran must not land in the next
 * one, where Edit and Apply would write it back over newer code; and a reload the engine starts must not close the
 * editor you are typing in.
 */
import { expect, type Page, test } from "@playwright/test";

import { openTower } from "./tauri";

const KEY = "G-0003:src/cart.js:new";

async function editCart(page: Page) {
  await page.getByRole("button", { name: "More file actions" }).first().click();
  await page.evaluate(() => (window as any).__towerMenu["Edit this file"].onmessage("click"));
}

const engineEvent = (page: Page, event: Record<string, unknown>) =>
  page.evaluate((event) => (window as any).__towerEmit("tower://update", { type: "traces", entries: [{ seq: 1, goal_id: "G-0003", at: Date.now(), source: "tower", event }] }), event);

test("a file read the next snapshot outran is dropped, so Edit opens the new text", async ({ page }) => {
  await openTower(page, "review/G-0003", { enrich: (F) => (F.files["G-0003:src/cart.js:new"] = "old text\n") });
  await expect(page.locator("table").first()).toBeVisible();
  await page.evaluate(() => {
    (window as any).__towerHold = new Promise((r) => ((window as any).__towerRelease = r));
  });
  await editCart(page);
  await expect.poll(async () => page.evaluate(() => (window as any).__towerCalls.filter(([c]: [string]) => c === "file_text").length)).toBe(1);

  // The engine pins a new snapshot while the read is still out.
  await page.evaluate((key) => ((window as any).__towerFixtures.files[key] = "new text\n"), KEY);
  await engineEvent(page, { kind: "pinned", pin: "x", files: 1, additions: 1, deletions: 1 });
  await page.evaluate(() => {
    (window as any).__towerHold = undefined;
    (window as any).__towerRelease();
  });

  await editCart(page);
  await expect(page.getByRole("textbox", { name: "Edit this file" })).toHaveValue(/^new text\n?$/);
});

test("an edit the engine records elsewhere keeps the file you are editing open, with what you typed", async ({ page }) => {
  await openTower(page, "review/G-0003");
  await expect(page.locator("table").first()).toBeVisible();
  await editCart(page);
  const editor = page.getByRole("textbox", { name: "Edit this file" });
  await expect(editor).toBeVisible();
  await editor.fill("my unsaved change");

  await engineEvent(page, { kind: "human_edited", files: ["src/other.js"] });
  await engineEvent(page, { kind: "pinned", pin: "y", files: 1, additions: 1, deletions: 0 });
  await expect(editor).toHaveValue("my unsaved change");
});

const cmds = (page: Page) => page.evaluate(() => (window as any).__towerCalls.map(([c]: [string]) => c) as string[]);

async function editThenPin(page: Page, newText: string | null) {
  await openTower(page, "review/G-0003", { enrich: (F) => (F.files["G-0003:src/cart.js:new"] = "old text\n") });
  await expect(page.locator("table").first()).toBeVisible();
  await editCart(page);
  const editor = page.getByRole("textbox", { name: "Edit this file" });
  await editor.fill("my change\n");
  if (newText !== null) await page.evaluate(([key, text]) => ((window as any).__towerFixtures.files[key] = text), [KEY, newText]);
  await engineEvent(page, { kind: "pinned", pin: "z", files: 1, additions: 1, deletions: 1 });
  await expect(editor).toHaveValue("my change\n");
  return editor;
}

test("saving an editor the engine's newer change moved under asks first: no writes nothing, yes writes", async ({ page }) => {
  const editor = await editThenPin(page, "the engine's newer text\n");
  await editor.press("Meta+Enter");
  await expect.poll(async () => (await cmds(page)).filter((c) => c === "plugin:dialog|message").length).toBe(1);
  expect(await cmds(page)).not.toContain("write_file");
  await expect(editor).toHaveValue("my change\n");
  await page.evaluate(() => ((window as any).__towerAsk = true));
  await editor.press("Meta+Enter");
  await expect.poll(async () => (await cmds(page)).includes("write_file")).toBe(true);
});

test("saving an editor whose file did not change under it writes without asking", async ({ page }) => {
  const editor = await editThenPin(page, null);
  await editor.press("Meta+Enter");
  await expect.poll(async () => (await cmds(page)).includes("write_file")).toBe(true);
  expect(await cmds(page)).not.toContain("plugin:dialog|message");
});

test("closing an editor the snapshot moved under drops its old text: Edit opens the new one", async ({ page }) => {
  const editor = await editThenPin(page, "new text\n");
  await editor.press("Escape");
  await expect(editor).toHaveCount(0);
  await editCart(page);
  await expect(editor).toHaveValue(/^new text\n?$/);
});
