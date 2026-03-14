/**
 * Server component helper for daemon API calls.
 *
 * Wraps daemonFetch() with JSON parsing and error handling
 * for use in Next.js server components. Returns a discriminated
 * union so pages can render DaemonError on failure.
 */
import { daemonFetch, isDaemonError } from "@/lib/daemon-client";

export type DaemonResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Fetches JSON from the daemon API.
 * Returns { ok: true, data } on success, { ok: false, error } on failure.
 */
export async function fetchDaemon<T>(
  path: string,
  options?: { method?: string; body?: string },
): Promise<DaemonResult<T>> {
  try {
    const result = await daemonFetch(path, options);
    if (isDaemonError(result)) {
      return { ok: false, error: result.message };
    }
    if (!result.ok) {
      const body = await result.text();
      try {
        const parsed = JSON.parse(body) as { error?: string };
        return { ok: false, error: parsed.error ?? `HTTP ${result.status}` };
      } catch {
        return { ok: false, error: `HTTP ${result.status}: ${body}` };
      }
    }
    const data = (await result.json()) as T;
    return { ok: true, data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}
