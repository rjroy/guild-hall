export type Clock = () => number;

const defaultClock: Clock = () => Date.now();

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Formats an ISO 8601 timestamp as a human-readable relative time string.
 *
 * Accepts an optional clock function for deterministic testing.
 * Without a clock, uses Date.now().
 */
export function formatRelativeTime(
  isoString: string,
  clock: Clock = defaultClock,
): string {
  const then = new Date(isoString).getTime();
  const now = clock();
  const diff = now - then;

  if (diff < 0) {
    return "just now";
  }

  if (diff < MINUTE) {
    return "just now";
  }

  if (diff < HOUR) {
    const minutes = Math.floor(diff / MINUTE);
    return minutes === 1 ? "1 min ago" : `${minutes} min ago`;
  }

  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }

  if (diff < 2 * DAY) {
    return "yesterday";
  }

  const days = Math.floor(diff / DAY);
  return `${days} days ago`;
}
