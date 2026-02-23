/**
 * Per-project mutex for serializing git operations on claude/main.
 *
 * Prevents concurrent modifications to the integration branch (e.g., sync
 * running while a commission squash-merge is in progress). Operations on
 * different projects run independently; operations on the same project
 * are serialized in FIFO order.
 *
 * The lock is cooperative and in-process only. It does not coordinate
 * across multiple daemon instances (which shouldn't exist thanks to
 * the PID file guard in daemon/lib/socket.ts).
 */

const projectLocks = new Map<string, Promise<void>>();

/**
 * Executes `fn` while holding the lock for `projectName`. If another
 * operation is already holding (or queued for) the same project, `fn`
 * waits until all preceding operations complete. Operations on different
 * projects run concurrently.
 *
 * Errors in `fn` do not break the chain: subsequent queued operations
 * still execute regardless of whether earlier ones succeeded or failed.
 */
export async function withProjectLock<T>(
  projectName: string,
  fn: () => Promise<T>,
): Promise<T> {
  const current = projectLocks.get(projectName) ?? Promise.resolve();
  // Chain fn after the current lock holder. The .catch(() => {}) ensures
  // that a rejection in fn doesn't prevent the next queued operation from
  // starting (the chain always resolves to void).
  const next = current.then(() => fn());
  projectLocks.set(projectName, next.catch(() => {}) as Promise<void>);
  return next;
}

/**
 * Clears all project locks. Only intended for test cleanup.
 */
export function clearProjectLocks(): void {
  projectLocks.clear();
}
