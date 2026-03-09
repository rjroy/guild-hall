/**
 * Thin wrapper around the croner library for cron expression handling.
 *
 * Isolates the third-party dependency so a library swap requires changing
 * only this file. All cron operations in the scheduler go through these
 * functions rather than importing croner directly.
 *
 * Uses UTC for all calculations to avoid timezone-dependent behavior
 * in the daemon process.
 */

import { Cron } from "croner";

/**
 * Returns the next time the cron expression fires after the given date.
 *
 * Returns null if the expression is invalid. All calculations use UTC.
 */
export function nextOccurrence(
  cronExpr: string,
  after: Date,
): Date | null {
  try {
    const job = new Cron(cronExpr, { timezone: "UTC" });
    return job.nextRun(after);
  } catch {
    return null;
  }
}

/**
 * Returns true if the cron expression is a valid 5-field standard cron.
 *
 * Rejects 6-field (with seconds) and 7-field expressions to keep the
 * scheduling interface simple and predictable for users.
 */
export function isValidCron(cronExpr: string): boolean {
  // Must be exactly 5 space-separated fields
  const fields = cronExpr.trim().split(/\s+/);
  if (fields.length !== 5) {
    return false;
  }

  try {
    new Cron(cronExpr, { timezone: "UTC" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the approximate interval in seconds between consecutive
 * occurrences of the cron expression.
 *
 * Calculates by taking two consecutive runs from a fixed reference point
 * and measuring the gap. This is approximate because some cron expressions
 * have variable intervals (e.g., "0 9 * * 1-5" fires Mon-Fri with a
 * 24-hour weekday gap but a 72-hour weekend gap). For those cases, the
 * returned value is the interval between the first two runs from the
 * reference point.
 *
 * Throws if the expression is invalid.
 */
export function intervalSeconds(cronExpr: string): number {
  const job = new Cron(cronExpr, { timezone: "UTC" });

  // Use a fixed reference point for deterministic results.
  // 2026-01-01 is a Thursday, giving a full week of variety.
  const reference = new Date("2026-01-01T00:00:00Z");
  const runs = job.nextRuns(2, reference);

  if (runs.length < 2) {
    throw new Error(
      `Cannot compute interval: cron expression "${cronExpr}" does not produce two consecutive runs`,
    );
  }

  return (runs[1].getTime() - runs[0].getTime()) / 1000;
}
