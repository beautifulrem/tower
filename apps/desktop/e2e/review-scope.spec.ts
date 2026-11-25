/**
 * Undo, edit and apply write to the workspace against the whole change (base → pin). In a narrower scope the
 * hunk indexes and file texts come from a different diff, so those actions must not be offered there.
 */
import { expect, test } from "@playwright/test";

import { enrichReview } from "./rich";
import { openTower, settled } from "./tauri";

test("undo is offered on all changes only: a narrower scope's hunk index would undo different code", async ({ page }) => {
  await openTower(page, "review/G-0003", {
    enrich: (F) => {
      enrichReview(F);
      const r = F["review-G-0003"];
      r.snapshots = [
        { rev: r.base_commit, kind: "base", label: "base", run_no: null, at: null },
        { rev: "1111111111111111111111111111111111111111", kind: "run_start", label: "R-01", run_no: 1, at: null },
        { rev: r.pin, kind: "pin", label: "Current", run_no: null, at: null },
      ];
    },
  });
  await expect(page.locator("table").first()).toBeVisible();
  const undo = page.locator(".undo-hunk");
  // In review, on all changes, every hunk can be undone.
  await expect(undo.first()).toBeVisible();

  await page.getByRole("tab", { name: "Last turn" }).click();
  await expect(page.getByRole("tab", { name: "Last turn" })).toHaveAttribute("aria-selected", "true");
  await expect(undo).toHaveCount(0);
  await page.locator(".review-diff").click({ position: { x: 4, y: 4 } });
  await page.keyboard.press("u");
  const calls = await page.evaluate(() => (window as any).__towerCalls.map(([c]: [string]) => c));
  expect(calls).not.toContain("revert_hunk");

  await page.getByRole("tab", { name: "All changes" }).click();
  await expect(undo.first()).toBeVisible();
});

// Review 10, R10-P3-02 and R10-P3-05: the "Compare to" face said "Latest" while its select held Base (options inserted
// after Solid set the value), two points at one rev answered to the first one's name, and a Chinese interface named the
// runs in the supervisor's English. Each point is its own option, worded here in the interface language from what it is,
// and the select chooses what its face says.
for (const [lang, names] of [
  ["en", ["Base", "Run 1 start", "Run 2 start", "Verification", "Latest"]],
  ["zh-CN", ["基线", "第 1 次运行开始", "第 2 次运行开始", "验证时", "最新"]],
] as const)
  test(`the run pickers say what their selects hold, one name per point, in the interface language (${lang})`, async ({ page }) => {
    await openTower(page, "review/G-0003", { lang });
    await settled(page, "review/G-0003");
    await page.locator(".review-stats .scope-switch .tab").last().click();
    const picks = page.locator(".review-stats .timeline-pick");
    await expect(picks).toHaveCount(2);
    const read = (i: number) =>
      picks.nth(i).evaluate((p) => {
        const sel = p.querySelector("select")!;
        const face = p.querySelector(".timeline-pick-face") as HTMLElement;
        return {
          chosen: sel.selectedOptions[0]?.textContent ?? "",
          face: [...face.querySelectorAll(":scope > span")].map((x) => x.textContent).join(" "),
          title: p.getAttribute("title"),
          options: [...sel.options].map((o) => o.textContent),
          keys: [...sel.options].map((o) => o.value),
        };
      });
    const [from, to] = [await read(0), await read(1)];
    // Every point, named in this language, then its pin; no two options share a value.
    expect(from.options.map((o) => o!.replace(/ @[0-9a-f]{7}$/, ""))).toEqual([...names]);
    expect(new Set(from.keys).size).toBe(from.keys.length);
    // The range's ends, as the face says and as the select (and a screen reader) holds them.
    expect(from.chosen).toMatch(new RegExp(`^${names[0]} @`));
    expect(to.chosen).toMatch(new RegExp(`^${names[4]} @`));
    for (const p of [from, to]) {
      expect(p.face).toBe(p.chosen);
      expect(p.title).toBe(p.chosen);
    }
    // A second point at the same rev keeps its own name once picked: run 2's start, the verifier's pin.
    await picks.nth(0).locator("select").selectOption({ label: from.options[2]! });
    await picks.nth(1).locator("select").selectOption({ label: to.options[3]! });
    const [from2, to2] = [await read(0), await read(1)];
    expect(from2.chosen).toBe(from.options[2]);
    expect(to2.chosen).toBe(to.options[3]);
    for (const p of [from2, to2]) expect(p.face).toBe(p.chosen);
    await expect(page.getByRole("combobox", { name: lang === "en" ? "Compare to" : "比较终点" })).toHaveValue(to2.keys[3]);
  });
