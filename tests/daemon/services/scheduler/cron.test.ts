/**
 * Tests for the cron expression wrapper (daemon/services/scheduler/cron.ts).
 *
 * Covers:
 * - Standard cron expressions parse correctly
 * - nextOccurrence returns correct dates for various patterns
 * - nextOccurrence returns null for invalid expressions
 * - isValidCron accepts valid 5-field expressions and rejects invalid ones
 * - isValidCron rejects 6-field (seconds) and 7-field expressions
 * - intervalSeconds returns correct cadence for fixed-interval patterns
 * - intervalSeconds throws for invalid expressions
 * - UTC timezone consistency across all operations
 */

import { describe, test, expect } from "bun:test";
import {
  nextOccurrence,
  isValidCron,
  intervalSeconds,
} from "@/daemon/services/scheduler/cron";

// -- nextOccurrence --

describe("nextOccurrence", () => {
  test("Monday 9am UTC: returns next Monday after reference", () => {
    // 2026-03-09 is a Monday
    const after = new Date("2026-03-09T00:00:00Z");
    const result = nextOccurrence("0 9 * * 1", after);

    expect(result).not.toBeNull();
    expect(result!.toISOString()).toBe("2026-03-09T09:00:00.000Z");
  });

  test("Monday 9am UTC: skips to next week when after is past Monday 9am", () => {
    const after = new Date("2026-03-09T10:00:00Z"); // Monday 10am, past 9am
    const result = nextOccurrence("0 9 * * 1", after);

    expect(result).not.toBeNull();
    expect(result!.toISOString()).toBe("2026-03-16T09:00:00.000Z");
  });

  test("first of month midnight UTC", () => {
    const after = new Date("2026-01-15T00:00:00Z");
    const result = nextOccurrence("0 0 1 * *", after);

    expect(result).not.toBeNull();
    expect(result!.toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });

  test("every 5 minutes: next occurrence is within 5 minutes", () => {
    const after = new Date("2026-03-09T12:00:00Z");
    const result = nextOccurrence("*/5 * * * *", after);

    expect(result).not.toBeNull();
    expect(result!.toISOString()).toBe("2026-03-09T12:05:00.000Z");
  });

  test("every 5 minutes: strictly after the reference time", () => {
    // When 'after' is exactly on a 5-minute boundary, should return next one
    const after = new Date("2026-03-09T12:05:00Z");
    const result = nextOccurrence("*/5 * * * *", after);

    expect(result).not.toBeNull();
    expect(result!.toISOString()).toBe("2026-03-09T12:10:00.000Z");
  });

  test("daily at noon UTC", () => {
    const after = new Date("2026-06-15T13:00:00Z"); // past noon
    const result = nextOccurrence("0 12 * * *", after);

    expect(result).not.toBeNull();
    expect(result!.toISOString()).toBe("2026-06-16T12:00:00.000Z");
  });

  test("returns null for invalid expression", () => {
    const result = nextOccurrence("invalid cron", new Date());
    expect(result).toBeNull();
  });

  test("returns null for empty string", () => {
    const result = nextOccurrence("", new Date());
    expect(result).toBeNull();
  });
});

// -- isValidCron --

describe("isValidCron", () => {
  test("accepts standard 5-field expressions", () => {
    expect(isValidCron("0 9 * * 1")).toBe(true);       // Monday 9am
    expect(isValidCron("0 0 1 * *")).toBe(true);       // 1st of month
    expect(isValidCron("*/5 * * * *")).toBe(true);     // every 5 min
    expect(isValidCron("0 12 * * *")).toBe(true);      // daily noon
    expect(isValidCron("30 4 1,15 * *")).toBe(true);   // 1st and 15th at 4:30
    expect(isValidCron("0 0 * * 0")).toBe(true);       // Sunday midnight
    expect(isValidCron("0 9 * * 1-5")).toBe(true);     // weekdays 9am
  });

  test("rejects invalid expressions", () => {
    expect(isValidCron("invalid cron")).toBe(false);
    expect(isValidCron("")).toBe(false);
    expect(isValidCron("99 99 99 99 99")).toBe(false);
    expect(isValidCron("not a cron")).toBe(false);
  });

  test("rejects 6-field expressions (with seconds)", () => {
    // croner supports seconds as a 6th field, but we restrict to 5-field
    expect(isValidCron("0 0 9 * * 1")).toBe(false);
    expect(isValidCron("*/30 * * * * *")).toBe(false);
  });

  test("rejects 7-field expressions", () => {
    expect(isValidCron("0 0 9 * * 1 2026")).toBe(false);
  });

  test("rejects expressions with too few fields", () => {
    expect(isValidCron("* * *")).toBe(false);
    expect(isValidCron("0 9")).toBe(false);
    expect(isValidCron("*")).toBe(false);
  });

  test("handles whitespace gracefully", () => {
    // Extra whitespace between fields should still work
    expect(isValidCron("0  9  *  *  1")).toBe(true);
    // Leading/trailing whitespace
    expect(isValidCron("  0 9 * * 1  ")).toBe(true);
  });
});

// -- intervalSeconds --

describe("intervalSeconds", () => {
  test("every 5 minutes returns 300 seconds", () => {
    expect(intervalSeconds("*/5 * * * *")).toBe(300);
  });

  test("every minute returns 60 seconds", () => {
    expect(intervalSeconds("* * * * *")).toBe(60);
  });

  test("every hour returns 3600 seconds", () => {
    expect(intervalSeconds("0 * * * *")).toBe(3600);
  });

  test("daily returns 86400 seconds", () => {
    expect(intervalSeconds("0 12 * * *")).toBe(86400);
  });

  test("every 15 minutes returns 900 seconds", () => {
    expect(intervalSeconds("*/15 * * * *")).toBe(900);
  });

  test("weekly (Monday 9am) returns 7 days in seconds", () => {
    // Reference is 2026-01-01 (Thursday), so first two Monday runs
    // are Jan 5 and Jan 12, which is 7 days apart
    expect(intervalSeconds("0 9 * * 1")).toBe(7 * 24 * 3600);
  });

  test("monthly (1st at midnight) returns roughly 31 days for Jan-Feb gap", () => {
    // Reference is 2026-01-01. First run is Jan 1 00:05 or similar,
    // actually the first nextRun after Jan 1 00:00 is Feb 1.
    // nextRuns(2) from Jan 1 gives Feb 1 and Mar 1.
    // Feb has 28 days in 2026, so interval is 28 days.
    const result = intervalSeconds("0 0 1 * *");
    expect(result).toBe(28 * 24 * 3600); // Feb 1 to Mar 1 = 28 days
  });

  test("throws for invalid expression", () => {
    expect(() => intervalSeconds("invalid")).toThrow();
  });

  test("throws for empty string", () => {
    expect(() => intervalSeconds("")).toThrow();
  });
});

// -- UTC consistency --

describe("UTC consistency", () => {
  test("nextOccurrence results are in UTC regardless of system timezone", () => {
    // All returned dates should have consistent UTC behavior.
    // We verify by checking the ISO string format (ends with Z).
    const result = nextOccurrence("0 9 * * *", new Date("2026-03-09T00:00:00Z"));
    expect(result).not.toBeNull();
    expect(result!.toISOString()).toMatch(/Z$/);
    expect(result!.getUTCHours()).toBe(9);
    expect(result!.getUTCMinutes()).toBe(0);
  });

  test("intervalSeconds is deterministic across calls", () => {
    const first = intervalSeconds("*/5 * * * *");
    const second = intervalSeconds("*/5 * * * *");
    expect(first).toBe(second);
  });
});
