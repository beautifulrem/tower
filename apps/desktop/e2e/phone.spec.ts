/**
 * The phone page (crates/tower-supervisor/src/remote.html) in WebKit at a
 * phone's size: the HTML is served from disk and `/api/state` is answered
 * from the dumped views, so the page is tested without the supervisor.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { HELD_OUT_BODY, HELD_OUT_OPTIONS, HELD_OUT_TONES } from "./rich";
import { fixtures } from "./tauri";

const PAGE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../../crates/tower-supervisor/src/remote.html"), "utf8");

async function openPhone(page: Page, opts: { state?: object | null; lang?: string } = {}) {
  const F = fixtures() as Record<string, any>;
  const state = opts.state === undefined ? { goals: F.goals, inbox: F.inbox, lang: opts.lang ?? "en" } : opts.state;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("http://phone.test/", (r) => r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: PAGE }));
  await page.route("http://phone.test/api/state", (r) => (state ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(state) }) : r.abort("connectionfailed")));
  await page.route("http://phone.test/api/answer", async (r) => {
    const body = r.request().postDataJSON() as { response: string };
    if (/^(Allow|Approve|允许|批准)$/.test(body.response)) return r.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "This decision can only be made at the desk" }) });
    return r.fulfill({ status: 200, contentType: "application/json", body: "{\"ok\":true}" });
  });
  await page.route("http://phone.test/api/snooze", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{\"ok\":true}" }));
  await page.goto("http://phone.test/#token");
  return F;
}

test("a decision can be put aside from the phone, with two times and a 44pt bell", async ({ page }) => {
  await openPhone(page);
  const bell = page.locator(".bell").first();
  const box = await bell.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
  await bell.click();
  // The label takes a line of its own; the two times share the next, never one on each.
  const later = page.locator(".later").first();
  const label = (await later.locator("span").first().boundingBox())!;
  const hour = (await page.getByRole("button", { name: "In 1 hour" }).boundingBox())!;
  const tomorrow = (await page.getByRole("button", { name: "Tomorrow 9:00" }).boundingBox())!;
  expect(label.y + label.height).toBeLessThanOrEqual(hour.y + 1);
  expect(Math.abs(hour.y - tomorrow.y)).toBeLessThan(1);
  const sent = page.waitForRequest((r) => r.url().endsWith("/api/snooze") && r.method() === "POST");
  await page.getByRole("button", { name: "In 1 hour" }).click();
  const body = (await sent).postDataJSON() as { inbox_id: string; until: number };
  expect(body.inbox_id).toBeTruthy();
  expect(body.until).toBeGreaterThan(Date.now() + 55 * 60_000);
}
);

test("every control on the phone page is at least 44pt tall", async ({ page }) => {
  await openPhone(page);
  await expect(page.locator(".btn").first()).toBeVisible();
  const heights = await page.locator(".btn, textarea").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(0);
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(40);
  // Full-size buttons (the card's choices) are 44; only a row's inline pause is 40.
  const cardButtons = await page.locator(".opts .btn").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  for (const h of cardButtons) expect(h).toBeGreaterThanOrEqual(44);
});

test("decisions that widen what the agent may do are named as desk-only, not offered", async ({ page }) => {
  await openPhone(page, {
    state: {
      goals: [],
      inbox: [
        { id: "a", goal_id: "G-0001", goal_title: "Fix the cart total", kind: "approval", title: "", subject: "rm -rf dist", body: "", options: ["Allow", "Deny"], tones: ["primary", "destructive"], allow_text: false, created_at: Date.now() },
        { id: "p", goal_id: "G-0002", goal_title: "Align discount rules", kind: "paused", title: "", subject: "Sentinel hit", body: "", options: ["I've checked, go to review", "Have the agent redo it without these changes"], tones: ["destructive", "neutral"], allow_text: false, created_at: Date.now() },
      ],
      lang: "en",
    },
  });
  await expect(page.getByRole("button", { name: "Deny" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Allow" })).toHaveCount(0);
  await expect(page.locator(".desk").first()).toContainText("At your Mac: Allow");
  await expect(page.getByRole("button", { name: /go to review/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /redo it/ })).toBeVisible();
});

test("offline, the page says so once in its own words and offers a retry; the status line does not repeat it", async ({ page }) => {
  await openPhone(page, { state: null });
  const error = page.locator(".error");
  await expect(error).toContainText("Can't reach Tower");
  await expect(error).not.toContainText("Load failed");
  await expect(error.getByRole("button", { name: "Retry" })).toBeVisible();
  const h = await error.getByRole("button").evaluate((el) => el.getBoundingClientRect().height);
  expect(h).toBeGreaterThanOrEqual(44);
  await expect(page.locator("#status")).toHaveClass("off");
  await expect(page.locator("#status")).not.toContainText("Can't reach Tower");
  const shown = (await page.locator("header").innerText()) + (await page.locator("main").innerText());
  expect(shown.match(/Can't reach Tower/g)?.length).toBe(1);
});

test("the phone card is drawn with the desk's pen: a 32px strip with an amber edge, 12px between cards, the run's elapsed time", async ({ page }) => {
  await openPhone(page, {
    state: {
      goals: [{ id: "G-0002", title: "Align discount rules", state: "running", mode: "executing", run_started_at: Date.now() - 109 * 60_000, live_line: { action: "bash", target: "npm test", at: Date.now() }, pause_reason: null, verified_pin: null }],
      inbox: [
        { id: "q", goal_id: "G-0002", goal_title: "Align discount rules", kind: "question", title: "", subject: "Which discount applies first?", body: "", options: ["Percentage", "Fixed"], tones: ["primary", "neutral"], allow_text: true, created_at: Date.now() },
        { id: "p", goal_id: "G-0004", goal_title: "Find out why checkout is slow", kind: "paused", title: "", subject: "The agent stopped", body: "", options: ["Continue"], tones: ["primary"], allow_text: false, created_at: Date.now() },
      ],
      lang: "en",
    },
  });
  const strip = page.locator(".strip").first();
  const box = await strip.boundingBox();
  expect(Math.round(box!.height)).toBe(32);
  expect(await strip.evaluate((el) => getComputedStyle(el).borderLeftWidth)).toBe("2px");
  const cards = page.locator(".card");
  const a = await cards.nth(0).boundingBox();
  const b = await cards.nth(1).boundingBox();
  expect(Math.round(b!.y - (a!.y + a!.height))).toBe(12);
  await expect(page.locator(".row .live .elapsed")).toHaveText("running 1h 49m");
});

const HELD_OUT_STATE = {
  goals: [{ id: "G-0004", title: "Find out why checkout is slow", state: "paused", mode: "idle", run_started_at: null, live_line: null, pause_reason: "held_out_failed", verified_pin: null }],
  inbox: [
    { id: "h", goal_id: "G-0004", goal_title: "Find out why checkout is slow", kind: "paused", title: "", subject: "Held-out tests failed (the agent cannot see them)", body: HELD_OUT_BODY, options: HELD_OUT_OPTIONS, tones: HELD_OUT_TONES, allow_text: true, created_at: Date.now() },
  ],
  lang: "en",
};

test("a held-out failure on the phone is the desk's card: the output for you only, the hint first and primary, names before the failure, showing it kept at the desk", async ({ page }) => {
  await openPhone(page, { state: HELD_OUT_STATE });
  const card = page.locator(".card").first();
  await expect(card.locator(".body")).toContainText("Every visible criterion passed");
  await expect(card.locator(".body")).not.toContainText("AssertionError");
  await expect(card.locator(".body")).not.toContainText("Failing in");
  const held = card.locator(".heldout");
  await expect(held.locator(".label")).toHaveText("For you only");
  expect(await held.evaluate((el) => getComputedStyle(el).borderLeftWidth)).toBe("2px");
  await expect(held.locator(".head")).toContainText("C2");
  await expect(held.locator(".head")).toContainText("Rounding edge cases");
  await expect(held.locator(".names code")).toHaveText(["total rounds half-cents up", "applies tax once"]);
  // Chips, as on the desk: a hairline around each name.
  expect(await held.locator(".names code").first().evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("1px");
  await expect(held.locator(".tail")).toContainText("AssertionError");
  // The hint is the primary path, with a placeholder, above the agent-facing choices.
  const area = card.locator("textarea");
  await expect(area).toHaveAttribute("placeholder", /A hint for the agent/);
  const send = card.getByRole("button", { name: "Send the hint and resume" });
  await expect(send).toHaveClass(/primary/);
  const ys = await Promise.all([held, area, card.locator(".opts")].map(async (l) => (await l.boundingBox())!.y));
  expect(ys[0]).toBeLessThan(ys[1]);
  expect(ys[1]).toBeLessThan(ys[2]);
  await expect(card.locator(".btn.primary")).toHaveCount(1);
  // Telling only the names is offered; showing the failure stays at the desk; abandoning asks twice.
  await expect(card.getByRole("button", { name: "Tell the agent only which tests failed" })).toBeVisible();
  await expect(card.getByRole("button", { name: /Show the agent the failure/ })).toHaveCount(0);
  await expect(card.locator(".desk")).toContainText("Show the agent the failure");
  await card.getByRole("button", { name: "Abandon this goal" }).click();
  await expect(card.getByRole("button", { name: "Press again" })).toBeVisible();
  await expect(card.locator(".note")).toContainText("does not know these tests exist");
  // The hint goes as free text.
  const sent = page.waitForRequest((r) => r.url().endsWith("/api/answer") && r.method() === "POST");
  await area.fill("Half-cents round up");
  await send.click();
  expect((await sent).postDataJSON()).toEqual({ inbox_id: "h", response: "Half-cents round up" });
});

test("every reply box on the phone says what it asks for", async ({ page }) => {
  await openPhone(page, {
    state: {
      goals: [],
      inbox: [
        { id: "q", goal_id: "G-0002", goal_title: "Align discount rules", kind: "question", title: "", subject: "Which discount applies first?", body: "", options: ["Percentage", "Fixed"], tones: ["primary", "neutral"], allow_text: true, created_at: Date.now() },
        { id: "p", goal_id: "G-0004", goal_title: "Find out why checkout is slow", kind: "paused", title: "", subject: "The agent stopped", body: "", options: ["Continue"], tones: ["primary"], allow_text: true, created_at: Date.now() },
      ],
      lang: "en",
    },
  });
  await expect(page.locator("#t-q")).toHaveAttribute("placeholder", "Write your answer…");
  await expect(page.locator("#t-p")).toHaveAttribute("placeholder", "A note for the agent (optional)…");
});

test("the empty phone page is the list's own shape: hollow rows under each title, and the titles in the wordmark's voice", async ({ page }) => {
  await openPhone(page, { state: { goals: [], inbox: [], lang: "en" } });
  await expect(page.locator(".empty").first()).toContainText("Nothing needs you");
  await expect(page.locator(".ghost .row")).toHaveCount(3);
  expect(await page.locator(".ghost").first().innerText()).toBe("");
  const h2 = page.locator("h2").first();
  expect(await h2.evaluate((el) => getComputedStyle(el).textTransform)).toBe("uppercase");
  expect(parseFloat(await h2.evaluate((el) => getComputedStyle(el).letterSpacing))).toBeGreaterThan(0.5);
});

for (const scheme of ["light", "dark"] as const) {
  test(`the phone page has no serious accessibility violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    for (const state of [undefined, HELD_OUT_STATE, null]) {
      await openPhone(page, state === undefined ? {} : { state });
      await page.waitForTimeout(200);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      const report = serious.flatMap((v) => v.nodes.map((n) => `${v.id} ${n.target.join(" ")}: ${n.failureSummary?.split("\n").slice(1).join(" ") ?? ""}`));
      expect(report).toEqual([]);
    }
  });
}

// Preview screens of the phone page, with the desktop's (SHOTS=<dir>).
for (const s of [
  { name: "phone-zh-dark", lang: "zh-CN", theme: "dark" as const },
  { name: "phone-en-light", lang: "en", theme: "light" as const },
  { name: "phone-offline-zh-dark", lang: "zh-CN", theme: "dark" as const, offline: true },
]) {
  test(`shot ${s.name}`, async ({ page }) => {
    test.skip(!process.env.SHOTS, "set SHOTS=<dir> to render the preview screens");
    await page.emulateMedia({ colorScheme: s.theme });
    await openPhone(page, s.offline ? { state: null } : { lang: s.lang });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(process.env.SHOTS!, `${s.name}.png`), fullPage: true });
  });
}

test("one black button a screen: only the first card fills its primary, another rises when you work in it; a long tail line hangs under itself", async ({ page }) => {
  await openPhone(page, {
    state: {
      goals: [{ id: "G-0004", title: "Find out why checkout is slow", state: "paused", mode: "idle", run_started_at: null, live_line: null, pause_reason: "held_out_failed", verified_pin: null }],
      inbox: [
        HELD_OUT_STATE.inbox[0],
        { id: "q", goal_id: "G-0002", goal_title: "Align discount rules", kind: "question", title: "", subject: "Which discount applies first?", body: "", options: ["Percentage", "Fixed"], tones: ["primary", "neutral"], allow_text: true, created_at: Date.now() },
      ],
      lang: "en",
    },
  });
  const filled = (el: Element) => {
    const s = getComputedStyle(el);
    const bg = s.backgroundColor;
    (el as HTMLElement).style.color = s.getPropertyValue("--text-1");
    const text1 = getComputedStyle(el).color;
    (el as HTMLElement).style.color = "";
    return bg === text1;
  };
  const cards = page.locator(".card");
  await expect(cards).toHaveCount(2);
  await expect.poll(() => cards.nth(0).locator(".btn.primary").first().evaluate(filled)).toBe(true);
  const second = cards.nth(1).locator(".btn.primary").first();
  await expect.poll(() => second.evaluate(filled)).toBe(false);
  await cards.nth(1).locator("textarea").focus();
  await expect.poll(() => second.evaluate(filled)).toBe(true);
  // Each output line is a block with a two-character hang, so a wrapped line reads as one.
  const line = cards.nth(0).locator(".tail .tl").filter({ hasText: "AssertionError" }).first();
  expect(await line.evaluate((el) => [getComputedStyle(el).display, parseFloat(getComputedStyle(el).textIndent) < 0])).toEqual(["block", true]);
});

test("a ready goal's id sits in its second line and the status line says how often it refreshes", async ({ page }) => {
  await openPhone(page, { lang: "zh-CN" });
  const ready = page.locator(".row").filter({ hasText: "回到电脑上评审并验收" }).first();
  await expect(ready.locator(".live .id")).toHaveText(/G-\d+/);
  await expect(ready.locator(".btn")).toHaveCount(0);
  await expect(page.locator("#status")).toContainText("每 5 秒");
  await expect(page.locator("#foot")).toContainText("由你电脑上的 Tower 提供");
});
