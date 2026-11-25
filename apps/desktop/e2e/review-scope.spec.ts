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

// Review 11, R11-P3-03: a picked name was lost when the same pin's verification was read again (its time was part of the
// point's key) and when another scope took the pickers away; and an end no point stood at any more, after a new pin, left
// the face blank over a select that fell back to Base. The review keeps the points you picked, keyed by what and where
// they are; an end that left the list is named so, as the select's chosen option.
test("the run pickers keep the points you picked across a refresh and another scope, and name an end that left the list", async ({ page }) => {
  await openTower(page, "review/G-0003");
  await settled(page, "review/G-0003");
  const tabs = page.locator(".review-stats .scope-switch .tab");
  await tabs.last().click();
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
        value: sel.value,
        options: [...sel.options].map((o) => o.textContent ?? ""),
      };
    });
  const both = async () => {
    const r = [await read(0), await read(1)];
    for (const p of r) {
      expect(p.face, "the face says what the select holds").toBe(p.chosen);
      expect(p.title).toBe(p.chosen);
    }
    return r.map((p) => p.chosen);
  };
  const { options } = await read(0);
  const run2 = options.find((o) => o.startsWith("Run 2 start @"))!;
  const verification = options.find((o) => o.startsWith("Verification @"))!;
  await page.getByRole("combobox", { name: "Compare from" }).selectOption({ label: run2 });
  await page.getByRole("combobox", { name: "Compare to" }).selectOption({ label: verification });
  expect(await both()).toEqual([run2, verification]);
  const reads = () => page.evaluate(() => (window as any).__towerCalls.filter(([c]: [string]) => c === "compare_snapshots").length);
  const pinned = async (change: string) => {
    const before = await reads();
    await page.evaluate((change) => {
      const snaps = (window as any).__towerFixtures["review-G-0003"].snapshots as { kind: string; rev: string; at: number | null }[];
      for (const s of snaps)
        if (change === "verified again" && s.kind === "verified") s.at = (s.at ?? 0) + 60_000;
        else if (change === "new pin" && (s.kind === "verified" || s.kind === "pin")) s.rev = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
      (window as any).__towerEmit("tower://update", { type: "traces", entries: [{ seq: 1, goal_id: "G-0003", at: Date.now(), source: "tower", event: { kind: "pinned", pin: "x", files: 1, additions: 1, deletions: 1 } }] });
    }, change);
    await expect.poll(reads).toBeGreaterThan(before);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  };
  // The same pin verified again: its time moved, the point you picked did not.
  await pinned("verified again");
  expect(await both()).toEqual([run2, verification]);
  // Another scope and back.
  await tabs.first().click();
  await expect(picks).toHaveCount(0);
  await tabs.last().click();
  await expect(picks).toHaveCount(2);
  expect(await both()).toEqual([run2, verification]);
  // A new pin moves every point off the range's end: the end is still where the range ends, and it says so.
  await pinned("new pin");
  const [from, to] = await both();
  expect(from).toBe(run2);
  expect(to).toBe(`No longer listed @${verification.slice(-7)}`);
  await expect(page.getByRole("combobox", { name: "Compare to" })).toHaveValue(/^gone:15085f2/);
  // Review 12: in a narrow header the pins go (`short-picks`), but this end's pin is its only name, so it stays.
  await page.setViewportSize({ width: 1100, height: 900 });
  await expect(page.locator(".review-stats")).toHaveClass(/short-picks/);
  await expect(picks.nth(0).locator(".timeline-pick-pin")).toBeHidden();
  await expect(picks.nth(1).locator(".timeline-pick-pin")).toBeVisible();
  expect((await both())[1]).toBe(to);
  // Review 13, R13-P3-02: at the narrowest windows that pin cost the verdict its criteria bar (en 1040–1052). The verdict
  // gives way last: the seal and every segment of its bar stay whole on the line you see, whatever goes before them.
  for (let width = 1040; width <= 1064; width++) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const v = await page.locator(".review-stats").evaluate((stats) => {
      const verify = stats.querySelector<HTMLElement>(".review-verify")!;
      const bar = verify.querySelector<HTMLElement>(".criteria-bar")!;
      // Whole inside every box that clips it: the line, the group, and for a segment its bar (which shrinks to its room).
      const whole = (el: Element | null, clips: Element[]) => {
        const r = el?.getBoundingClientRect();
        return !!r && r.width > 0 && clips.every((c) => {
          const k = c.getBoundingClientRect();
          return r.right <= k.right + 0.5 && r.bottom <= k.bottom + 0.5;
        });
      };
      const segs = [...bar.querySelectorAll(".seg")];
      return { segs: segs.length, cut: segs.filter((x) => !whole(x, [stats, verify, bar])).length, seal: whole(verify.querySelector(".seal"), [stats, verify]), steps: stats.className };
    });
    expect(v.segs, `the bar's segments at ${width}`).toBeGreaterThan(0);
    expect(v.cut, `segments cut at ${width}: ${JSON.stringify(v)}`).toBe(0);
    expect(v.seal, `the seal whole at ${width}: ${JSON.stringify(v)}`).toBe(true);
  }
  // Whatever went, the gone end still says it is gone, on its face (its words, or the short word) and with its pin.
  await expect(picks.nth(1)).toHaveAttribute("title", to);
  for (let width = 1040; width <= 1064; width += 4) {
    await page.setViewportSize({ width, height: 900 });
    expect(await goneFace(picks.nth(1)), `the gone end's face at ${width}`).toMatchObject({ pin: "@15085f2", word: expect.stringMatching(/^(No longer listed|Gone)$/) });
  }
});

/** What a gone end's face shows: the word you see (its words, or the short word drawn in their place) and its pin. */
const goneFace = (pick: import("@playwright/test").Locator) =>
  pick.evaluate((p) => {
    const run = p.querySelector<HTMLElement>(".timeline-pick-face > span:first-child")!;
    const pin = p.querySelector<HTMLElement>(".timeline-pick-pin");
    const words = (run.firstElementChild as HTMLElement | null) ?? run;
    const shown = (e: HTMLElement | null) => !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0;
    const short = getComputedStyle(run, "::before").content.replace(/^"|"$/g, "");
    return { word: shown(words) ? words.textContent!.trim() : short === "none" ? "" : short, pin: shown(pin) ? pin!.textContent!.trim() : "" };
  });

// Review 13 (record only): with both ends of the range gone, the verdict was pushed out at en 1024–1040; dropping a gone
// end's pin then left two faces that both read "No longer listed". The gone ends shorten their words and keep their
// pins, the verdict stays whole, and the key caps go only where the verdict would not fit with them.
for (const lang of ["en", "zh-CN"] as const)
  test(`with both ends of the range gone, each keeps its pin and the verdict stays whole (${lang})`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1400, height: 900 });
    await openTower(page, "review/G-0003", { lang });
    await settled(page, "review/G-0003");
    await page.locator(".review-stats .scope-switch .tab").last().click();
    const picks = page.locator(".review-stats .timeline-pick");
    const values = await page.locator(".review-stats select").first().evaluate((s: HTMLSelectElement) => [...s.options].map((o) => o.value));
    // The pin and the verification: two points a new pin moves off, so both ends of the range leave the list.
    await page.locator(".review-stats select").nth(0).selectOption(values.find((v) => /pin/.test(v))!);
    await page.locator(".review-stats select").nth(1).selectOption(values.find((v) => /verified/.test(v))!);
    await page.evaluate(() => {
      const snaps = (window as any).__towerFixtures["review-G-0003"].snapshots as { kind: string; rev: string }[];
      for (const s of snaps) if (s.kind === "verified" || s.kind === "pin") s.rev = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
      (window as any).__towerEmit("tower://update", { type: "traces", entries: [{ seq: 1, goal_id: "G-0003", at: Date.now(), source: "tower", event: { kind: "pinned", pin: "x", files: 1, additions: 1, deletions: 1 } }] });
    });
    await expect(picks.nth(0)).toHaveClass(/timeline-pick-gone/);
    await expect(picks.nth(1)).toHaveClass(/timeline-pick-gone/);
    const pins = await picks.evaluateAll((ps) => ps.map((p) => p.getAttribute("title")!.slice(-8)));
    for (let width = 1024; width <= 1120; width++) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const v = await page.locator(".review-stats").evaluate((stats) => {
        const head = stats.closest(".review-head")!;
        const verify = stats.querySelector<HTMLElement>(".review-verify")!;
        const bar = verify.querySelector<HTMLElement>(".criteria-bar")!;
        const whole = (el: Element | null, clips: Element[]) => {
          const r = el?.getBoundingClientRect();
          return !!r && r.width > 0 && clips.every((c) => {
            const k = c.getBoundingClientRect();
            return r.right <= k.right + 0.5 && r.bottom <= k.bottom + 0.5;
          });
        };
        const out = () => [...bar.querySelectorAll(".seg")].filter((x) => !whole(x, [stats, verify, bar])).length + (whole(verify.querySelector(".seal"), [stats, verify]) ? 0 : 1);
        const cut = out();
        // A step taken only where the verdict needs it: the key caps put back would cut it.
        let capsBackCut: number | null = null;
        if (head.classList.contains("keys-off")) {
          head.classList.remove("keys-off");
          capsBackCut = out();
          head.classList.add("keys-off");
        }
        return { cut, capsBackCut, steps: `${stats.className} ${head.className}` };
      });
      expect(v.cut, `the verdict cut at ${width}: ${JSON.stringify(v)}`).toBe(0);
      if (v.capsBackCut !== null) expect(v.capsBackCut, `key caps gone where they fit, ${width}: ${JSON.stringify(v)}`).toBeGreaterThan(0);
      if (width % 8 === 0)
        for (const [i, pick] of [picks.nth(0), picks.nth(1)].entries()) {
          const face = await goneFace(pick);
          expect(face.pin, `end ${i} keeps its pin at ${width}`).toBe(pins[i]);
          expect(face.word, `end ${i} says it is gone at ${width}`).toMatch(lang === "en" ? /^(No longer listed|Gone)$/ : /^(已不在列表中|已不在)$/);
        }
    }
  });
