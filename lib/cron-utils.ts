import { Cron } from "croner";

/** Validates a 5-field cron expression. Returns true if croner can parse it. */
export function isValidCron(expr: string): boolean {
  try {
    // Croner constructor throws on invalid expressions.
    new Cron(expr);
    return true;
  } catch {
    return false;
  }
}

/** Returns the next occurrence after `after` for a cron expression, or null. */
export function nextOccurrence(cronExpr: string, after: Date): Date | null {
  try {
    const cron = new Cron(cronExpr);
    const next = cron.nextRun(after);
    return next ?? null;
  } catch {
    return null;
  }
}

/** Maps common cron expressions to human-readable descriptions. */
export function describeCron(cron: string): string {
  const common: Record<string, string> = {
    "* * * * *": "Every minute",
    "*/5 * * * *": "Every 5 minutes",
    "*/15 * * * *": "Every 15 minutes",
    "*/30 * * * *": "Every 30 minutes",
    "0 * * * *": "Every hour",
    "0 */2 * * *": "Every 2 hours",
    "0 */6 * * *": "Every 6 hours",
    "0 0 * * *": "Daily at midnight",
    "0 9 * * *": "Daily at 9:00 AM",
    "0 9 * * 1-5": "Weekdays at 9:00 AM",
    "0 9 * * 1": "Every Monday at 9:00 AM",
    "0 0 * * 0": "Every Sunday at midnight",
    "0 0 1 * *": "First of every month",
    "0 0 1 1 *": "Every January 1st",
  };

  if (common[cron]) return common[cron];

  // Try to generate a basic description from fields
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;

  const [min, hour, dom, mon, dow] = parts;

  if (hour !== "*" && dom === "*" && mon === "*") {
    const paddedMin = min.padStart(2, "0");
    if (dow === "*") {
      return `Daily at ${hour}:${paddedMin}`;
    } else if (dow === "1-5") {
      return `Weekdays at ${hour}:${paddedMin}`;
    }
  }

  return cron;
}
