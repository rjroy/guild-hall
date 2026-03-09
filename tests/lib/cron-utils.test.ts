import { describe, test, expect } from "bun:test";
import { describeCron } from "@/lib/cron-utils";

describe("describeCron", () => {
  describe("exact matches from the lookup table", () => {
    test("every minute", () => {
      expect(describeCron("* * * * *")).toBe("Every minute");
    });

    test("every 5 minutes", () => {
      expect(describeCron("*/5 * * * *")).toBe("Every 5 minutes");
    });

    test("every hour", () => {
      expect(describeCron("0 * * * *")).toBe("Every hour");
    });

    test("daily at midnight", () => {
      expect(describeCron("0 0 * * *")).toBe("Daily at midnight");
    });

    test("daily at 9 AM", () => {
      expect(describeCron("0 9 * * *")).toBe("Daily at 9:00 AM");
    });

    test("weekdays at 9 AM", () => {
      expect(describeCron("0 9 * * 1-5")).toBe("Weekdays at 9:00 AM");
    });

    test("every Monday at 9 AM", () => {
      expect(describeCron("0 9 * * 1")).toBe("Every Monday at 9:00 AM");
    });

    test("first of every month", () => {
      expect(describeCron("0 0 1 * *")).toBe("First of every month");
    });

    test("every January 1st", () => {
      expect(describeCron("0 0 1 1 *")).toBe("Every January 1st");
    });
  });

  describe("generated descriptions from field parsing", () => {
    test("daily at non-zero minute (e.g. 30 9 * * *)", () => {
      expect(describeCron("30 9 * * *")).toBe("Daily at 9:30");
    });

    test("daily at hour with single-digit minute pads to two digits", () => {
      expect(describeCron("5 14 * * *")).toBe("Daily at 14:05");
    });

    test("weekdays at non-zero minute", () => {
      expect(describeCron("15 8 * * 1-5")).toBe("Weekdays at 8:15");
    });

    test("daily at zero minute generates padded format", () => {
      expect(describeCron("0 17 * * *")).toBe("Daily at 17:00");
    });
  });

  describe("fallback to raw expression", () => {
    test("returns raw expression for complex patterns", () => {
      expect(describeCron("0 9 1,15 * *")).toBe("0 9 1,15 * *");
    });

    test("returns raw expression for non-standard field count", () => {
      expect(describeCron("0 9 * *")).toBe("0 9 * *");
    });

    test("returns raw expression when dom is not wildcard", () => {
      expect(describeCron("30 9 15 * *")).toBe("30 9 15 * *");
    });

    test("returns raw expression when month is not wildcard", () => {
      expect(describeCron("0 9 * 6 *")).toBe("0 9 * 6 *");
    });
  });
});
