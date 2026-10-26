import { describe, expect, it } from "vitest";

import { inQuietHours, minuteOfDay } from "../store";
import { DEFAULT_QUIET_HOURS, hhmm, parseHhmm } from "../../views/Settings";

/** A local time today, as ms since the epoch. */
const at = (h: number, m = 0) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.getTime();
};

describe("quiet hours", () => {
  it("reads the minute after local midnight", () => {
    expect(minuteOfDay(at(0, 0))).toBe(0);
    expect(minuteOfDay(at(22, 15))).toBe(22 * 60 + 15);
  });

  it("follows the supervisor's rule: a window may cross midnight, an empty one is never quiet", () => {
    const night = { start: 22 * 60, end: 8 * 60 };
    expect(inQuietHours(night, 23 * 60)).toBe(true);
    expect(inQuietHours(night, 3 * 60)).toBe(true);
    expect(inQuietHours(night, 8 * 60)).toBe(false);
    expect(inQuietHours(night, 12 * 60)).toBe(false);
    const lunch = { start: 12 * 60, end: 13 * 60 };
    expect(inQuietHours(lunch, 12 * 60 + 30)).toBe(true);
    expect(inQuietHours(lunch, 13 * 60)).toBe(false);
    expect(inQuietHours({ start: 600, end: 600 }, 600)).toBe(false);
    expect(inQuietHours(null, 600)).toBe(false);
  });

  it("writes and reads the time fields' HH:MM", () => {
    expect(hhmm(DEFAULT_QUIET_HOURS.start)).toBe("22:00");
    expect(hhmm(DEFAULT_QUIET_HOURS.end)).toBe("08:00");
    expect(hhmm(5)).toBe("00:05");
    expect(parseHhmm("07:30")).toBe(450);
    expect(parseHhmm("7:30")).toBe(450);
    expect(parseHhmm("")).toBeNull();
    expect(parseHhmm("25:00")).toBeNull();
  });
});
