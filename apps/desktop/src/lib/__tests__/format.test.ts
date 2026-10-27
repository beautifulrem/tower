import { describe, expect, it, vi } from "vitest";

const settings = vi.hoisted(() => ({ language: "en" }));
// The setup file has loaded i18n already (on the real store); format reads the locale through this one.
vi.mock("../i18n", async (actual) => ({ ...(await actual<typeof import("../i18n")>()), locale: () => (settings.language === "zh-CN" ? "zh-CN" : "en") }));
vi.mock("../store", () => ({ state: { settings } }));

const { ago, duration, usd, usdLimit, short, sameMinute } = await import("../format");

describe("formats", () => {
  it("rounds time quietly", () => {
    const now = 10 * 24 * 3600_000;
    expect(ago(null, now)).toBe("—");
    expect(ago(now - 10_000, now)).not.toMatch(/\d/);
    expect(ago(now - 5 * 60_000, now)).toMatch(/5/);
  });

  it("says every age in one format: the heartbeat's units under three hours, then whole hours and days", () => {
    const now = 10 * 24 * 3600_000;
    expect(ago(now - 10_000, now)).toBe("just now");
    expect(ago(now - 50_000, now)).toBe("1m ago");
    expect(ago(now - 5 * 60_000, now)).toBe("5m ago");
    expect(ago(now - 100 * 60_000, now)).toBe("1h 40m ago");
    expect(ago(now - 4 * 3600_000, now)).toBe("4h ago");
    expect(ago(now - 3 * 24 * 3600_000, now)).toBe("3 days ago");
  });

  it("knows when two moments share a clock minute", () => {
    const t = new Date(2026, 9, 27, 4, 29, 10).getTime();
    expect(sameMinute(t, t + 40_000)).toBe(true);
    expect(sameMinute(t, t + 60_000)).toBe(false);
  });

  it("shows durations with one unit system", () => {
    expect(duration(420)).toBe("420ms");
    expect(duration(420, false)).toBe("<1s");
    expect(duration(42_000)).toBe("42s");
    expect(duration(80 * 60_000)).toBe("1h 20m");
  });

  it("says a phrase's durations in Chinese words, and keeps a reading's letters", () => {
    settings.language = "zh-CN";
    try {
      expect(duration(4 * 60_000, false)).toBe("4 分钟");
      expect(duration(100 * 60_000, false)).toBe("1 小时 40 分");
      expect(duration(120 * 60_000, false)).toBe("2 小时");
      expect(duration(42_000, false)).toBe("42 秒");
      expect(duration(42_000)).toBe("42s");
    } finally {
      settings.language = "en";
    }
  });

  it("shows money without false precision", () => {
    expect(usd(0)).toBe("$0");
    expect(usd(0.004)).toBe("<$0.01");
    expect(usd(1.5)).toBe("$1.50");
    expect(usdLimit(5)).toBe("$5");
    expect(usdLimit(7.5)).toBe("$7.5");
    expect(short("abcdef123456")).toBe("abcdef1");
  });
});
