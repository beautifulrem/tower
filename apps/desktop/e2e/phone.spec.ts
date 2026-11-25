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

import { HELD_OUT_BODY, HELD_OUT_OPTIONS, HELD_OUT_TONES, enrichRich } from "./rich";
import { fixtures, settled } from "./tauri";

const PAGE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../../crates/tower-supervisor/src/remote.html"), "utf8");

/**
 * Opens the page with `state` answering `/api/state` (null: the supervisor cannot be reached). `remembered` is the
 * language the page last rendered in, as it keeps it; `serve` lets a test take the supervisor away mid-way.
 */
async function openPhone(
  page: Page,
  opts: { state?: object | null; lang?: string; width?: number; remembered?: string; serve?: { state: object | null }; rich?: boolean } = {},
) {
  const F = fixtures() as Record<string, any>;
  // The preview screens show the world the desktop's shots show (a held-out failure on G-0004, the cannot-run G-0005…).
  if (opts.rich) enrichRich(F);
  const state = opts.state === undefined ? { goals: F.goals, inbox: F.inbox, lang: opts.lang ?? "en", max_running: F.settings?.max_concurrent ?? 3 } : opts.state;
  const serve = opts.serve ?? { state };
  serve.state = state;
  await page.setViewportSize({ width: opts.width ?? 390, height: 844 });
  if (opts.remembered) await page.addInitScript((l) => localStorage.setItem("tower-lang", l), opts.remembered);
  await page.route("http://phone.test/", (r) => r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: PAGE }));
  await page.route("http://phone.test/api/state", (r) =>
    serve.state ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(serve.state) }) : r.abort("connectionfailed"),
  );
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
  // The put-aside times are measured too: open them on the first card.
  await page.locator(".strip .bell").first().click();
  await expect(page.locator(".later .btn").first()).toBeVisible();
  const heights = await page.locator(".btn, textarea").evaluateAll((els) => els.map((el) => `${el.className} "${el.textContent?.trim().slice(0, 20)}" ${el.getBoundingClientRect().height}`));
  expect(heights.length).toBeGreaterThan(0);
  // Every one, the card's choices, a row's inline Pause and the put-aside times alike: a finger, not a cursor.
  for (const h of heights) expect(Number(h.split(" ").pop()), h).toBeGreaterThanOrEqual(44);
  // And the page is one column: nothing runs past a 390pt screen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
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

test("offline, the page says so once, says where to look and offers one retry; the header is the gauges with the power off", async ({ page }) => {
  await openPhone(page, { state: null, remembered: "en" });
  const off = page.locator(".offline");
  await expect(off.locator(".error")).toHaveText("Can't reach Tower on your Mac");
  await expect(off).toContainText("Is the Mac awake, and is this phone on its Tailscale or Wi-Fi?");
  await expect(off).not.toContainText("Load failed");
  const retry = off.getByRole("button", { name: "Retry" });
  await expect(retry).toBeVisible();
  // The one way back is the screen's one primary, the column's whole width, 44pt.
  await expect(retry).toHaveClass(/primary/);
  const [b, col] = await Promise.all([retry.boundingBox(), off.boundingBox()]);
  expect(b!.height).toBeGreaterThanOrEqual(44);
  expect(Math.abs(b!.width - col!.width)).toBeLessThan(1);
  // The header: every reading a dash in the quietest grey, and the one lit reading saying why.
  await expect(page.locator("#conn")).toHaveClass(/off/);
  await expect(page.locator("#conn")).toHaveText("Offline");
  // Said once with the red mark, on the error line; the header's reading is the word in ink.
  expect(await page.locator("#conn svg").count()).toBe(0);
  await expect(page.locator(".offline .error svg")).toHaveCount(1);
  await expect(page.locator("#status .gauge.dead").first()).toHaveText("—/— running");
  const shown = (await page.locator("header").innerText()) + (await page.locator("main").innerText());
  expect(shown.match(/Can't reach Tower/g)?.length).toBe(1);
});

test("offline, the page keeps the language it last spoke: a Chinese desk's phone says it in Chinese", async ({ page }) => {
  const serve = { state: null as object | null };
  const F = await openPhone(page, { lang: "zh-CN", serve });
  await expect(page.locator("h2").first()).toHaveText(/需要你/);
  serve.state = null;
  await page.reload();
  await expect(page.locator(".offline .error")).toHaveText("连不上你 Mac 上的 Tower");
  await expect(page.locator(".offline")).toContainText("Tailscale");
  await expect(page.locator("#conn")).toHaveText("离线");
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("zh-CN");
  // Back online, the retry reads again and the page is whole.
  serve.state = { goals: F.goals, inbox: F.inbox, lang: "zh-CN", max_running: 3 };
  await page.getByRole("button", { name: "重试" }).click();
  await expect(page.locator(".offline")).toHaveCount(0);
  await expect(page.locator("#conn")).toBeEmpty();
});

test("the header is the desk's title bar: runs of slots, the silence once it is worth a look, the spend; freshness is a footnote", async ({ page }) => {
  const now = Date.now();
  const goal = (id: string, state: string, cost: number, heard: number, mode = "thinking") => ({
    id,
    title: id,
    state,
    mode,
    run_started_at: now - 600_000,
    updated_at: heard,
    live_line: { action: "bash", target: "npm test", at: heard },
    pause_reason: null,
    verified_pin: null,
    cost_usd: cost,
  });
  await openPhone(page, { state: { goals: [goal("G-1", "running", 0.05, now - 185_000), goal("G-2", "paused", 0.04, now - 900_000)], inbox: [], lang: "en", max_running: 4 } });
  const gauges = page.locator("#status .gauge");
  await expect(gauges.nth(0)).toHaveText("1/4 running");
  await expect(gauges.nth(0).locator("svg path")).toHaveCount(1);
  await expect(gauges.nth(1)).toHaveText("silent for 3m");
  // Silence is worth a look, not a failure (docs/12 §12.4.3, docs/08 §8.6.3): the hint mark in the reading's own ink, as
  // at the desk, never a red ring.
  const hint = gauges.nth(1).locator("svg");
  await expect(hint).toHaveCount(1);
  expect(await hint.locator("path").getAttribute("d")).toContain("M8 2.5a5.5 5.5");
  const ink = await gauges.nth(1).evaluate((g) => [getComputedStyle(g.querySelector("svg")!).color, getComputedStyle(g).color, g.querySelector("path")!.getAttribute("fill")]);
  expect(ink).toEqual([ink[1], ink[1], "currentColor"]);
  await expect(gauges.nth(2)).toHaveText("Spent $0.09");
  // The runs mark is the size of the marks beside it (review 15: it was 10px beside the 12px hint mark).
  expect(await gauges.nth(0).locator("svg").evaluate((s) => [s.getAttribute("width"), s.getAttribute("height")])).toEqual(["12", "12"]);
  // Polled: the box is read once the page's styles are in, not in the frame the text first lands.
  await expect.poll(async () => (await gauges.nth(2).locator(".sr").boundingBox())?.width ?? Infinity).toBeLessThanOrEqual(1);
  // No dot joins the readings; the refresh is said once, at the foot, while it is fresh.
  expect(await page.locator("header").innerText()).not.toMatch(/·|every 5 s/);
  await expect(page.locator("#fresh")).toContainText("again every 5 s");
  await expect(page.locator("#conn")).toBeEmpty();
  // Review 15 (record only): a tool in flight keeps the run busy, as the desk's heartbeat reads it — the tool and how long
  // it has run, no hint mark — never silent (a full test suite can take minutes without a word).
  await openPhone(page, { state: { goals: [goal("G-1", "running", 0.05, now - 185_000, "executing")], inbox: [], lang: "en", max_running: 4 } });
  await expect(gauges.nth(1)).toHaveText("bash running for 3m");
  await expect(gauges.nth(1).locator("svg")).toHaveCount(0);
  await expect(gauges.nth(0).locator("svg")).toHaveClass("spin");
  // A run heard from just now has no silence reading: the page reads every 5 s and does not count seconds.
  await openPhone(page, { state: { goals: [goal("G-1", "running", 0, Date.now())], inbox: [], lang: "zh-CN", max_running: 4 } });
  await expect(page.locator("#status .gauge:not(#conn)")).toHaveText(["1/4 运行", "累计 $0"]);
  // The live stream is said in words: green is the verifier's alone, never a connection's. The test has no stream to
  // serve, so it stops the page's own attempt (and its retry) before saying the stream is live, in one step.
  await page.evaluate(() => { (0, eval)("clearTimeout(sseRetryTimer); if (sseAbort) { sseAbort.abort(); sseAbort = null; } sseLive = true; showStatus()"); });
  await expect(page.locator("#conn")).toHaveText("实时");
  const green = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--st-verified").trim());
  const header = await page.locator("header").evaluate((h) => {
    const probe = document.createElement("i");
    document.body.append(probe);
    const paint = (v: string) => ((probe.style.color = v), getComputedStyle(probe).color);
    const marks = [...h.querySelectorAll("*")].flatMap((el) => {
      const s = getComputedStyle(el);
      return [s.color, s.backgroundColor, s.borderTopColor, el.getAttribute("fill") ? paint(el.getAttribute("fill")!) : ""];
    });
    probe.remove();
    return marks;
  });
  const greenPaint = await page.evaluate((v) => {
    const probe = document.createElement("i");
    document.body.append(probe);
    probe.style.color = v;
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }, green);
  expect(header.filter((c) => c === greenPaint), "a green in the header").toEqual([]);
});

test("a card's choices have one width rule: the primary across, the others equal on the next line, or each across when one would not fit", async ({ page }) => {
  const card = (id: string, options: string[], tones: string[]) => ({
    id,
    goal_id: "G-0002",
    goal_title: "Align discount rules",
    kind: "question",
    title: "",
    subject: "Which discount applies first?",
    body: "",
    options,
    tones,
    allow_text: false,
    created_at: Date.now(),
  });
  await openPhone(page, {
    state: {
      goals: [],
      inbox: [card("a", ["Fixed", "Percentage", "Skip"], ["neutral", "primary", "neutral"]), card("b", ["Continue", "Have the agent redo it from the start", "Abandon"], ["primary", "neutral", "destructive"])],
      lang: "en",
    },
  });
  const boxes = (i: number) =>
    page
      .locator(".opts")
      .nth(i)
      .locator(".btn")
      .evaluateAll((els) => els.map((el) => ({ y: el.getBoundingClientRect().y, w: el.getBoundingClientRect().width, text: el.textContent })));
  const width = async (i: number) => (await page.locator(".opts").nth(i).boundingBox())!.width;
  // The primary leads, whatever its place in the list, and takes the line.
  const a = await boxes(0);
  expect(a.map((b) => b.text)).toEqual(["Percentage", "Fixed", "Skip"]);
  expect(Math.abs(a[0].w - (await width(0)))).toBeLessThan(1);
  expect(Math.abs(a[1].y - a[2].y)).toBeLessThan(1);
  expect(Math.abs(a[1].w - a[2].w)).toBeLessThan(1);
  expect(a[1].y).toBeGreaterThan(a[0].y);
  // One label too long for half the line: every secondary takes a line of its own, the same width.
  const b = await boxes(1);
  for (const x of b) expect(Math.abs(x.w - (await width(1)))).toBeLessThan(1);
  expect(b[2].y).toBeGreaterThan(b[1].y);
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
  // The amber edge is a straight 2px rule, clear of the card's rounded corner (a border there bends round it).
  const edge = await strip.evaluate((el) => {
    const pen = getComputedStyle(el, "::before");
    return { width: pen.width, clear: parseFloat(pen.top) >= parseFloat(getComputedStyle(el.closest(".card")!).borderTopLeftRadius), border: getComputedStyle(el).borderLeftWidth };
  });
  expect(edge).toEqual({ width: "2px", clear: true, border: "0px" });
  const cards = page.locator(".card");
  const a = await cards.nth(0).boundingBox();
  const b = await cards.nth(1).boundingBox();
  expect(Math.round(b!.y - (a!.y + a!.height))).toBe(12);
  // How long it has run ends the title line (the desk's age column); a screen reader hears what the number is.
  const elapsed = page.locator(".row .head .elapsed");
  await expect(elapsed).toHaveText("running 1h 49m");
  expect((await elapsed.locator(".sr").boundingBox())!.width).toBeLessThanOrEqual(1);
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
  await expect(card.locator(".note")).toContainText("keeps the tests hidden");
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

test("the empty phone page is the list's own shape: hollow rows under each title, the titles in sentence case", async ({ page }) => {
  await openPhone(page, { state: { goals: [], inbox: [], lang: "en" } });
  await expect(page.locator(".empty").first()).toContainText("Nothing needs you");
  await expect(page.locator(".ghost .row")).toHaveCount(3);
  expect(await page.locator(".ghost").first().innerText()).toBe("");
  // Tracked capitals belong to the contract's masthead alone; a list title is a word, not a label.
  const h2 = page.locator("h2").first();
  expect(await h2.evaluate((el) => getComputedStyle(el).textTransform)).toBe("none");
  expect(await h2.innerText()).toMatch(/^Needs you/);
  expect(parseFloat(await h2.evaluate((el) => getComputedStyle(el).letterSpacing)) || 0).toBeLessThan(0.2);
});

for (const scheme of ["light", "dark"] as const) {
  test(`the phone page has no serious accessibility violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    for (const state of [undefined, HELD_OUT_STATE, null]) {
      await openPhone(page, state === undefined ? {} : { state });
      // Its state fetched (or failed) and drawn, not a fixed pause.
      await page.waitForLoadState("networkidle");
      await settled(page);
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
  { name: "phone-en-dark-430", lang: "en", theme: "dark" as const, width: 430 },
  { name: "phone-zh-light-430", lang: "zh-CN", theme: "light" as const, width: 430 },
  { name: "phone-heldout-en-light", lang: "en", theme: "light" as const, state: HELD_OUT_STATE },
  { name: "phone-offline-zh-dark", lang: "zh-CN", theme: "dark" as const, offline: true },
  { name: "phone-offline-en-light", lang: "en", theme: "light" as const, offline: true },
] as Array<{ name: string; lang: string; theme: "light" | "dark"; width?: number; state?: object; offline?: boolean }>) {
  test(`shot ${s.name}`, async ({ page }) => {
    test.skip(!process.env.SHOTS, "set SHOTS=<dir> to render the preview screens");
    await page.emulateMedia({ colorScheme: s.theme });
    await openPhone(page, s.offline ? { state: null, remembered: s.lang, width: s.width } : { lang: s.lang, width: s.width, state: s.state, rich: true });
    await page.waitForLoadState("networkidle");
    await settled(page);
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

test("a ready goal's id sits in its second line and the foot says how often the page refreshes", async ({ page }) => {
  await openPhone(page, { lang: "zh-CN" });
  const ready = page.locator(".row").filter({ hasText: "回到电脑上评审并验收" }).first();
  await expect(ready.locator(".live .id")).toHaveText(/G-\d+/);
  await expect(ready.locator(".btn")).toHaveCount(0);
  await expect(page.locator("#fresh")).toContainText("每 5 秒");
  await expect(page.locator("#status")).not.toContainText("每 5 秒");
  await expect(page.locator("#foot")).toContainText("由你电脑上的 Tower 提供");
});

test("a run's mark turns on the phone only while the run moves, as on the desk; the action and its target are told apart by a space, not a dot", async ({ page }) => {
  const now = Date.now();
  const run = (id: string, more: Record<string, unknown>) => ({
    id,
    title: id,
    state: "running",
    mode: "executing",
    needs_you: 0,
    run_started_at: now - 600_000,
    updated_at: now,
    live_line: { action: "bash", target: "npm test", at: now },
    pause_reason: null,
    verified_pin: null,
    ...more,
  });
  const moving = run("G-1", {});
  const waiting = run("G-2", { mode: "waiting_on_you", needs_you: 1 });
  const silent = run("G-3", { mode: "thinking", updated_at: now - 300_000, live_line: { action: "bash", target: "npm test", at: now - 300_000 } });
  // Five minutes inside one tool call: busy, not silent (review 15, record only — the desk's `heartbeatState`).
  const busy = run("G-4", { updated_at: now - 300_000, live_line: { action: "bash", target: "npm test", at: now - 300_000 } });
  // Flagged for you while its mode still says thinking, and quiet for five minutes: it waits on you, as the desk reads it.
  const flagged = run("G-5", { mode: "thinking", needs_you: 1, updated_at: now - 300_000, live_line: { action: "bash", target: "npm test", at: now - 300_000 } });
  await openPhone(page, { state: { goals: [moving, waiting, silent, busy, flagged], inbox: [], lang: "en", max_running: 4 } });
  const marks = page.locator(".row > svg.glyph");
  await expect(marks).toHaveCount(5);
  // Review 14: every running row turned, the one waiting on you and the silent one too.
  expect(await marks.evaluateAll((els) => els.map((e) => e.classList.contains("spin")))).toEqual([true, false, false, true, false]);
  // The badge says what the desk's live line says (review 15, record only): the amber ! and "Needs you" for a run that
  // waits on you, whatever its mode; "Silent" with the hint mark, never "Working" beside a still mark.
  const badges = page.locator(".row .meta .badge");
  await expect(badges).toHaveText(["Working", "Needs you", "Silent", "Working", "Needs you"]);
  const drawn = await badges.evaluateAll((bs) => bs.map((b) => b.querySelector("path")?.getAttribute("d")?.slice(0, 40) ?? ""));
  expect(drawn[0]).toBe("");
  expect(drawn[1], "the amber ! before Needs you").toContain("M8 1a7 7 0 1 1 0 14");
  expect(await badges.nth(1).locator("path").getAttribute("fill")).toBe("var(--st-attention)");
  expect(await badges.nth(2).locator("path").getAttribute("d"), "the hint mark before Silent").toContain("M8 2.5a5.5 5.5");
  expect(await badges.nth(2).locator("path").getAttribute("fill")).toBe("currentColor");
  expect(drawn[3]).toBe("");
  expect(drawn[4], "the amber ! before Needs you, flagged in any mode").toBe(drawn[1]);
  await expect(page.locator("#status .gauge.active svg")).toHaveClass("spin");
  // The detail: the action, then its target after a space, the target in the code face; no middle dot.
  const detail = page.locator(".row .meta .detail").first();
  await expect(detail).toHaveText("bash npm test");
  expect(await detail.locator(".target").evaluate((el) => parseFloat(getComputedStyle(el).marginLeft))).toBeGreaterThan(0);
  expect(await page.locator("#app").innerText()).not.toContain("·");
  // Nothing moving: the gauge's arc holds still too.
  await openPhone(page, { state: { goals: [waiting, silent], inbox: [], lang: "en", max_running: 4 } });
  await expect(page.locator("#status .gauge.active svg")).not.toHaveClass("spin");
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

test("the phone card's strip carries the desk's 12px ! (review 14: an old rule drew it at 9px)", async ({ page }) => {
  await openPhone(page);
  const mark = page.locator(".strip .mark").first();
  await expect(mark).toBeVisible();
  const box = (await mark.boundingBox())!;
  expect([Math.round(box.width), Math.round(box.height)]).toEqual([12, 12]);
});

// Review 15 (R15-P1-01): the phone drew every goal to accept with the verifier's green check, and the green seal with a
// pin, whether or not the verifier's pass counted. It follows the desk's rule now: green only for a pass with its pin
// that counts; a pass that does not count is the amber ! and says so; with no machine criterion the check is neutral
// and says "Not machine-verified".
for (const lang of ["en", "zh-CN"] as const)
  test(`a goal to accept on the phone is green only when the verifier's pass counts (${lang})`, async ({ page }) => {
    const now = Date.now();
    const goal = (id: string, progress: object) => ({ id, title: id, state: "in_review", mode: "idle", updated_at: now, live_line: null, pause_reason: null, verified_pin: "15085f29324c438b7cd1bbe7ba4933c7592caede", cost_usd: 0.04, progress });
    const card = (id: string) => ({ id: `rr-${id}`, goal_id: id, goal_title: `Goal ${id}`, kind: "review_ready", title: "", subject: "", body: "", options: [], tones: [], allow_text: false, created_at: now });
    const goals = [
      goal("G-1", { verified: 2, observed: 0, machine: 2, human_done: 0, human: 0 }),
      goal("G-2", { verified: 2, observed: 0, machine: 2, human_done: 0, human: 0, not_evidence: true }),
      goal("G-3", { verified: 0, observed: 0, machine: 0, human_done: 0, human: 1 }),
    ];
    await openPhone(page, { state: { goals, inbox: goals.map((g) => card(g.id)), lang, max_running: 3 } });
    const rows = page.locator(".row").filter({ hasText: /Goal G-/ });
    await expect(rows).toHaveCount(3);
    const read = (i: number) =>
      rows.nth(i).evaluate((row) => {
        const probe = document.createElement("i");
        document.body.append(probe);
        const paint = (v: string) => ((probe.style.color = v), getComputedStyle(probe).color);
        const green = paint("var(--st-verified)");
        const amber = paint("var(--st-attention)");
        const inks = [...row.querySelectorAll("*")].flatMap((el) => [getComputedStyle(el).color, el.getAttribute("stroke") ? paint(el.getAttribute("stroke")!) : "", el.getAttribute("fill") ? paint(el.getAttribute("fill")!) : ""]);
        probe.remove();
        return { green: inks.includes(green), amber: inks.includes(amber), seal: row.querySelector(".seal")?.textContent ?? "", mark: row.querySelector("svg")?.getAttribute("aria-label") ?? "" };
      });
    const words = lang === "en" ? { held: "Passed, doesn't count", human: "Not machine-verified" } : { held: "通过但不作数", human: "未经机器验证" };
    expect(await read(0)).toEqual(expect.objectContaining({ green: true, amber: false, seal: "@15085f2" }));
    expect(await read(1)).toEqual({ green: false, amber: true, seal: `${words.held}@15085f2`, mark: words.held });
    expect(await read(2)).toEqual(expect.objectContaining({ green: false, amber: false, seal: words.human }));
  });
