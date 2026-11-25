/**
 * The honesty grammar holds on every surface of one goal: a pass that is
 * not evidence is never drawn as the verifier's green check — not in the
 * title, not in the sidebar, not at the head of its criterion row.
 */
import { expect, type Page, test } from "@playwright/test";

import { enrichCanary, withoutHighFindings } from "./rich";
import { openTower, settled } from "./tauri";

const calls = (page: Page, cmd: string) => page.evaluate((cmd) => (window as unknown as { __towerCalls: Array<[string, unknown]> }).__towerCalls.filter(([c]) => c === cmd).length, cmd);

test("with a tampered pass the title's glyph, the sidebar's and the criterion's mark are the seal's amber ◆, never a green check", async ({ page }) => {
  // The high findings dealt with, so the other passes count beside the tampered one.
  await openTower(page, "goal/G-0001", { enrich: (F) => (enrichCanary(F), withoutHighFindings(F)) });
  const head = page.locator(".goal-head");
  await expect(head.locator(".seal-tampered")).toBeVisible();
  await expect(head.locator(".row > svg.glyph").first()).toHaveClass(/mark-attention/);
  await expect(head.locator(".row > svg.glyph").first()).toHaveAttribute("aria-label", /Passed, doesn.t count/);
  const side = page.locator(".side-goal").filter({ hasText: "Fix the cart total" });
  await expect(side.locator(".side-icon svg")).toHaveClass(/mark-attention/);
  // The tampered criterion's row: ◆ in its mark column; "passed" stays, it is a fact.
  const row = page.locator(".goal-page .criterion").filter({ hasText: "Rounding tests pass" }).first();
  await expect(row.locator(".criterion-row").first().locator(".result-tampered")).toBeVisible();
  await expect(row.locator(".criterion-row").first().locator(".result-pass")).toHaveCount(0);
  await expect(row.locator(".col-result").first()).toHaveText(/passed/);
  // The criteria that do count keep the verifier's check.
  await expect(page.locator(".goal-page .criterion .criterion-row .result-pass").first()).toBeVisible();
});

test("while a high finding of this verification stands, no pass keeps the verifier's check: each is the amber ◆, as the supervisor holds them", async ({ page }) => {
  await openTower(page, "goal/G-0001", { enrich: enrichCanary });
  await expect(page.locator(".goal-head .seal-tampered")).toBeVisible();
  const marks = page.locator(".goal-page .criterion .criterion-row > .result-tampered");
  await expect(page.locator(".goal-page .criterion .criterion-row .result-pass")).toHaveCount(0);
  expect(await marks.count()).toBeGreaterThanOrEqual(2);
  // "passed" stays on each row: it is a fact; only its standing as evidence is withheld.
  await expect(page.locator(".goal-page .criterion").filter({ has: page.locator(".num", { hasText: /^C1$/ }) }).first().locator(".col-result").first()).toHaveText(/passed/);
});

// Review 7, P3-03 (D91): the same claim from two runs was two identical rows. It is one row now, naming its runs, and a
// run that said it twice counts once.
for (const [lang, runs] of [["en", "said in runs 1 and 2"], ["zh-CN", "第 1、2 次运行都这样说"]] as const)
  test(`the same claim in two runs is one ledger row that names both runs (${lang})`, async ({ page }) => {
    await openTower(page, "goal/G-0003", {
      lang,
      enrich: (F) => {
        const claims = F["goal-G-0003"].claims;
        const again = claims.filter((c: { kind: string; criterion: string; run_no: number }) => c.kind === "criterion_met" && c.criterion === "C1" && c.run_no === 2);
        // The demo's premise: C1's claim was made in runs 1 and 2, in the same words.
        expect(again).toHaveLength(1);
        claims.push(structuredClone(again[0]));
      },
    });
    const rows = page.locator(".honesty-ledger .ledger-pair");
    await expect(rows).toHaveCount(2);
    const c1 = rows.filter({ has: page.locator(".num", { hasText: /^C1\s*$/ }) });
    await expect(c1.locator(".ledger-claim-cell .ledger-runs")).toHaveText(runs);
    // Provenance, not the agent's words (R9-P3-03): under the claim, in the grey of the criterion's number. In the light
    // theme those greys are 0.04 apart (R10-P3-03), so the note differs by form too: a size smaller, worded as a note.
    const [note, num, said] = await Promise.all(
      [".ledger-claim-cell .ledger-runs", ".ledger-claim-cell .num", ".ledger-claim-cell > span:not(.sr-only):not(.num):not(.ledger-runs)"].map((sel) =>
        c1.locator(sel).first().evaluate((e) => ({ color: getComputedStyle(e).color, size: parseFloat(getComputedStyle(e).fontSize), top: e.getBoundingClientRect().top, bottom: e.getBoundingClientRect().bottom })),
      ),
    );
    expect(note.color).toBe(num.color);
    expect(note.color).not.toBe(said.color);
    expect(note.size, "a size under the claim's").toBeLessThanOrEqual(said.size - 1);
    expect(note.top).toBeGreaterThanOrEqual(said.bottom - 1);
    // Said once, a claim names no runs.
    await expect(rows.filter({ has: page.locator(".num", { hasText: /^C2\s*$/ }) }).locator(".ledger-claim-cell .ledger-runs")).toHaveCount(0);
  });

/** G-0003's two passes counted, with caveats: the runner reached into and a pass on rerun (`progress.qualified`). */
const qualified = (F: Record<string, any>) => {
  for (const p of [F["goal-G-0003"].summary.progress, ...F.goals.filter((g: { id: string }) => g.id === "G-0003").map((g: { progress: unknown }) => g.progress)]) {
    expect(p.verified).toBeGreaterThan(0);
    p.qualified = { test_machinery: true, assertions_unchecked: false, flaky: true };
  }
  for (const c of F["goal-G-0003"].criteria) c.human_checked = true;
  F.environment.issues = F.environment.issues.filter((i: { kind: string }) => i.kind !== "git_identity_missing");
};

// D58, the owner's rule (docs/07 §7.10.3): a counted pass with caveats is "Verified, with caveats" wherever its seal is —
// the notched glyph, the seal's word, the review's verdict — and accepting it is a judgement: named, and two presses.
for (const [lang, word, why] of [
  ["en", "Verified, with caveats", "code reaches into the test runner, flaky: passed on rerun"],
  ["zh-CN", "已验证（有保留）", "代码触及测试运行器、不稳定：重跑后通过"],
] as const)
  test(`a counted pass with caveats says so on every seal, and accepting it takes two presses (${lang})`, async ({ page }) => {
    await openTower(page, "goal/G-0003", { lang, enrich: qualified });
    const head = page.locator(".goal-head");
    await expect(head.locator(".row > svg.glyph").first()).toHaveAttribute("aria-label", word);
    await expect(head.locator(".seal .seal-word")).toHaveText(word);
    await expect(head.locator(".seal")).toHaveAttribute("title", new RegExp(why));
    // Green stays the verifier's: the pass counts, the check is the verified one, never the amber ◆.
    await expect(head.locator(".seal-tampered")).toHaveCount(0);

    await openTower(page, "review/G-0003", { lang, enrich: qualified });
    await settled(page, "review/G-0003");
    await expect(page.locator(".review-verify .seal .seal-word")).toHaveText(word);
    await page.keyboard.press("Meta+Shift+Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(".stamp")).toContainText(word);
    await expect(dialog.locator(".open-judgement")).toContainText(why);
    const button = dialog.locator(".panel-actions .btn-primary");
    await expect(button).toHaveText(lang === "en" ? "Accept anyway" : "仍然验收");
    await button.click();
    await expect(dialog.locator(".panel-actions .btn.armed")).toBeVisible();
    expect(await calls(page, "accept")).toBe(0);
    await dialog.locator(".panel-actions .btn.armed").click();
    await expect.poll(() => calls(page, "accept")).toBe(1);
  });

// Accepted with them, the caveats stay on the goal: the stamp at its head says the qualified word, its title names them as
// what you accepted, and the solid seal of the lifecycle glyph keeps its cut (●*) on the board and in the sidebar.
for (const [lang, word, state, why, past] of [
  ["en", "Verified, with caveats", "Accepted", "code reaches into the test runner, flaky: passed on rerun", "You accepted it with them"],
  ["zh-CN", "已验证（有保留）", "已验收", "代码触及测试运行器、不稳定：重跑后通过", "你是带着这些保留验收的"],
] as const)
  test(`a goal accepted with caveats keeps them on its stamp and its glyph (${lang})`, async ({ page }) => {
    const accepted = (F: Record<string, any>) => {
      qualified(F);
      for (const g of F.goals) if (g.id === "G-0003") g.state = "accepted";
      F["goal-G-0003"].summary.state = "accepted";
      F.inbox = F.inbox.filter((i: { goal_id: string }) => i.goal_id !== "G-0003");
    };
    await openTower(page, "goal/G-0003", { lang, enrich: accepted });
    const stamp = page.locator(".goal-head .stamp.stamp-m");
    await expect(stamp.locator(".stamp-word")).toHaveText(word);
    await expect(stamp).toHaveAttribute("title", new RegExp(`${why}.*${past}`));
    // The stamp's disc is cut, not whole; the head glyph says both the state and the caveats.
    await expect(stamp.locator("svg.stamp-glyph path").first()).toHaveAttribute("d", /^M9\.25/);
    await expect(page.locator(".goal-head .row > svg.glyph").first()).toHaveAttribute("aria-label", `${state}, ${word}`);
    await expect(page.locator(`.sidebar svg.glyph[aria-label="${state}, ${word}"]`)).toHaveCount(1);
    await expect(page.locator(`.sidebar svg.glyph[aria-label="${state}, ${word}"] path`).first()).toHaveAttribute("d", /^M9\.25/);
  });

// Review 10, R10-P3-01: the goal page's stamp said "You accepted it with them" while the peek, the review's head and its
// verification readout still said to look at them before you accept, and a merged goal's ◉ dropped the cut. Every seal of
// a goal accepted or merged with caveats says they were taken with it, and the merged ring keeps the gap (◉*).
for (const [lang, word, past, before, names] of [
  ["en", "Verified, with caveats", "You accepted it with them", "before you accept", { accepted: "Accepted", integrated: "Merged" }],
  ["zh-CN", "已验证（有保留）", "你是带着这些保留验收的", "验收前先看", { accepted: "已验收", integrated: "已合入" }],
] as const)
  for (const done of ["accepted", "integrated"] as const)
    test(`every seal of a goal ${done} with caveats says they were taken with it (${lang})`, async ({ page }) => {
      const enrich = (F: Record<string, any>) => {
        qualified(F);
        for (const g of F.goals) if (g.id === "G-0003") g.state = done;
        F["goal-G-0003"].summary.state = done;
        F.inbox = F.inbox.filter((i: { goal_id: string }) => i.goal_id !== "G-0003");
      };
      const said = async (seal: import("@playwright/test").Locator, where: string) => {
        await expect(seal, where).toHaveAttribute("title", new RegExp(past));
        expect(await seal.getAttribute("title"), where).not.toContain(before);
      };
      await openTower(page, "overview", { lang, enrich });
      await settled(page, "overview");
      const row = page.locator('.board-rows .g-row[data-goal="G-0003"]');
      const glyph = row.locator(".g-glyph svg.glyph");
      await expect(glyph).toHaveAttribute("aria-label", `${names[done]}, ${word}`);
      if (done === "integrated") {
        // The ring's gap, as the in-review ring's, centred on the lower right; the core stays whole.
        await expect(glyph.locator("circle").first()).toHaveAttribute("stroke-dasharray", "22.61 3.78");
        await expect(glyph.locator("circle").nth(1)).not.toHaveAttribute("stroke-dasharray", /./);
      }
      await row.locator(".g-title").focus();
      await page.keyboard.press("Space");
      await said(page.locator(".peek-drawer .seal"), "peek");
      await page.keyboard.press("Escape");

      await openTower(page, "review/G-0003", { lang, enrich });
      await settled(page, "review/G-0003");
      await said(page.locator(".review-verify .seal"), "review head");
      await page.keyboard.press("e");
      await said(page.getByRole("dialog").locator(".verify-head .seal"), "verification readout");

      await openTower(page, "goal/G-0003", { lang, enrich });
      await said(page.locator(".goal-head .stamp").first(), "goal head stamp");
    });
