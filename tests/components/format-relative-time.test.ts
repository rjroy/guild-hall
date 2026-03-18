import { describe, test, expect } from "bun:test";
import { formatRelativeTime } from "@/web/components/dashboard/ManagerBriefing";

describe("formatRelativeTime", () => {
  // Fixed reference point: 2026-03-14T12:00:00Z
  const now = new Date("2026-03-14T12:00:00Z").getTime();

  test("returns 'just now' for timestamps less than 60 seconds ago", () => {
    const thirtySecondsAgo = new Date(now - 30_000).toISOString();
    expect(formatRelativeTime(thirtySecondsAgo, now)).toBe("just now");
  });

  test("returns 'just now' for the exact current time", () => {
    const exact = new Date(now).toISOString();
    expect(formatRelativeTime(exact, now)).toBe("just now");
  });

  test("returns minutes for timestamps 1-59 minutes ago", () => {
    const oneMinuteAgo = new Date(now - 60_000).toISOString();
    expect(formatRelativeTime(oneMinuteAgo, now)).toBe("1 minute ago");

    const fiveMinutesAgo = new Date(now - 5 * 60_000).toISOString();
    expect(formatRelativeTime(fiveMinutesAgo, now)).toBe("5 minutes ago");

    const fiftyNineMinutesAgo = new Date(now - 59 * 60_000).toISOString();
    expect(formatRelativeTime(fiftyNineMinutesAgo, now)).toBe("59 minutes ago");
  });

  test("returns hours for timestamps 1-23 hours ago", () => {
    const oneHourAgo = new Date(now - 60 * 60_000).toISOString();
    expect(formatRelativeTime(oneHourAgo, now)).toBe("1 hour ago");

    const threeHoursAgo = new Date(now - 3 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(threeHoursAgo, now)).toBe("3 hours ago");

    const twentyThreeHoursAgo = new Date(now - 23 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(twentyThreeHoursAgo, now)).toBe("23 hours ago");
  });

  test("returns days for timestamps 24+ hours ago", () => {
    const oneDayAgo = new Date(now - 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(oneDayAgo, now)).toBe("1 day ago");

    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(sevenDaysAgo, now)).toBe("7 days ago");
  });

  test("uses Date.now() when no second argument is provided", () => {
    // A timestamp from far in the past should always return days
    const result = formatRelativeTime("2020-01-01T00:00:00Z");
    expect(result).toMatch(/^\d+ days? ago$/);
  });
});
