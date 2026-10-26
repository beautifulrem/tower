import { describe, expect, it, vi } from "vitest";

vi.mock("../store", () => ({ state: { settings: { language: "en" } } }));

const { ago, agoShort, duration, usd, usdLimit, short, sameMinute } = await import("../format");

describe("formats", () => {
  it("rounds time quietly", () => {
    const now = 10 * 24 * 3600_000;
    expect(ago(null, now)).toBe("—");
    expect(ago(now - 10_000, now)).not.toMatch(/\d/);
    expect(ago(now - 5 * 60_000, now)).toMatch(/5/);
  });

  it("gives the board the heartbeat's units under three hours, then words", () => {
    const now = 10 * 24 * 3600_000;
    expect(agoShort(now - 10_000, now)).toBe(ago(now - 10_000, now));
    expect(agoShort(now - 100 * 60_000, now)).toBe("1h 40m ago");
    expect(agoShort(now - 5 * 60_000, now)).toBe("5m ago");
    expect(agoShort(now - 4 * 3600_000, now)).toBe(ago(now - 4 * 3600_000, now));
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

  it("shows money without false precision", () => {
    expect(usd(0)).toBe("$0");
    expect(usd(0.004)).toBe("<$0.01");
    expect(usd(1.5)).toBe("$1.50");
    expect(usdLimit(5)).toBe("$5");
    expect(usdLimit(7.5)).toBe("$7.5");
    expect(short("abcdef123456")).toBe("abcdef1");
  });
});
