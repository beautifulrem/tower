/**
 * The MicroVM sandbox tier is written but no run uses it: every goal runs under the OS sandbox (Seatbelt). The
 * interface therefore never offers the tier and never labels a goal with it, on a Mac that could run a MicroVM and
 * for settings and contracts stored with the tier.
 */
import { expect, test } from "@playwright/test";

import { openTower } from "./tauri";

const stored = (F: Record<string, any>) => {
  F.sandboxPosture = { backend_name: "macOS Seatbelt (S2)", microvm_available: true, warnings: [] };
  F.settings = { ...F.settings, default_sandbox_tier: "micro_vm" };
  F["goal-G-0001"].contract.sandbox_tier = "micro_vm";
  F["goal-G-0001"].summary.sandbox_tier = "micro_vm";
};

for (const [lang, name, reason] of [
  ["en", "Sandbox tier", "Every run uses the OS kernel sandbox. MicroVM is not connected to runs yet."],
  ["zh-CN", "沙箱档位", "每次运行都在系统内核沙箱里，MicroVM 尚未接入运行。"],
] as const)
  test(`Settings names the sandbox every run uses and offers no MicroVM default (${lang})`, async ({ page }) => {
    await openTower(page, "settings", { lang, enrich: stored });
    const field = page.locator(".settings .field", { hasText: name });
    await expect(field).toContainText("macOS Seatbelt (S2)");
    await expect(field).toContainText(reason);
    // Nothing to choose: a stored MicroVM default is not shown as the choice, and there is no picker to make it one.
    await expect(field.locator("button, input, select")).toHaveCount(0);
  });

test("a goal stored with the MicroVM tier reads as what it ran under: the rail says the OS sandbox", async ({ page }) => {
  await openTower(page, "goal/G-0001", { enrich: stored });
  const rail = page.locator(".rail");
  await expect(rail).toContainText("S2 Seatbelt");
  await expect(rail).not.toContainText("MicroVM");
});

test("the Operations posture line names only the sandbox that runs", async ({ page }) => {
  await openTower(page, "operations", { enrich: stored });
  await expect(page.locator(".ops-posture-line")).toContainText("macOS Seatbelt (S2)");
  await expect(page.locator(".ops-posture-line")).not.toContainText("MicroVM");
});
