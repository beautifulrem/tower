import { describe, expect, it, vi } from "vitest";

const settings = vi.hoisted(() => ({ language: "en" }));
vi.mock("../store", () => ({ state: { settings } }));

// The setup file loaded i18n on the real store; a fresh copy reads the language from this one.
vi.resetModules();
const { registerDict } = await import("../i18n");
registerDict("en", (await import("../locales/en.later")).enLater);
registerDict("zh-CN", (await import("../locales/zh-CN.later")).zhLater);
const { cronWords } = await import("../cron");

describe("a schedule in words", () => {
  it("says the shapes people write most, in UTC as written, and nothing for any other", () => {
    expect(cronWords("0 2 * * 1-5")).toBe("Weekdays 02:00");
    expect(cronWords("0 4 * * 0")).toBe("Every Sunday 04:00");
    expect(cronWords("30 9 * * 7")).toBe("Every Sunday 09:30");
    expect(cronWords("15 3 * * *")).toBe("Every day 03:15");
    expect(cronWords("0 6 1 * *")).toBe("Day 1 of every month 06:00");
    expect(cronWords("5 * * * *")).toBe("Every hour at :05");
    expect(cronWords("*/15 * * * *")).toBe("Every 15 minutes");
    for (const other of ["0 2 * 1 *", "0 2 * * 1,3", "0 */2 * * *", "0 2 1 * 1", "@daily", "0 2 * *"]) expect(cronWords(other)).toBeNull();
  });

  it("in Chinese too", () => {
    settings.language = "zh-CN";
    try {
      expect(cronWords("0 2 * * 1-5")).toBe("工作日 02:00");
      expect(cronWords("0 4 * * 0")).toBe("每星期日 04:00");
      expect(cronWords("0 6 1 * *")).toBe("每月 1 日 06:00");
    } finally {
      settings.language = "en";
    }
  });
});
