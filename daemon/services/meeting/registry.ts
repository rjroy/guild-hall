/**
 * Active meeting registry.
 *
 * Holds the set of currently-active meeting entries and provides lookup,
 * counting, and a concurrent-close guard. This is a plain data structure
 * with no transition logic, no handler dispatch, and no artifact operations.
 */

import type { MeetingId, MeetingStatus, SdkSessionId } from "@/daemon/types";

/**
 * The entry type stored in the registry for each active meeting.
 */
export type ActiveMeetingEntry = {
  meetingId: MeetingId;
  projectName: string;
  workerName: string;
  /** Package name (e.g., "test-assistant") for worker lookups. */
  packageName: string;
  sdkSessionId: SdkSessionId | null;
  worktreeDir: string;
  branchName: string;
  abortController: AbortController;
  status: MeetingStatus;
  /** Git isolation model. "project" operates in the integration worktree; "activity" (default) gets its own branch/worktree. */
  scope: "project" | "activity";
  /** Most recent compact summary from PostCompact hook, consumed by iterateSession. */
  lastCompactSummary?: string;
};

export class MeetingRegistry {
  private readonly entries = new Map<MeetingId, ActiveMeetingEntry>();
  private readonly closingIds = new Set<MeetingId>();

  /**
   * Add an entry to the registry. Throws if the ID is already registered.
   */
  register(id: MeetingId, entry: ActiveMeetingEntry): void {
    if (entry.meetingId !== id) {
      throw new Error(
        `Entry meetingId "${entry.meetingId as string}" does not match registry key "${id as string}"`,
      );
    }
    if (this.entries.has(id)) {
      throw new Error(`Meeting "${id as string}" is already registered`);
    }
    this.entries.set(id, entry);
  }

  /**
   * Remove an entry from the registry. Also clears any close-in-progress
   * flag for safety. No-op if the ID is not registered (idempotent).
   */
  deregister(id: MeetingId): void {
    this.entries.delete(id);
    this.closingIds.delete(id);
  }

  /**
   * Look up an entry by ID.
   */
  get(id: MeetingId): ActiveMeetingEntry | undefined {
    return this.entries.get(id);
  }

  /**
   * Check whether an ID is registered.
   */
  has(id: MeetingId): boolean {
    return this.entries.has(id);
  }

  /**
   * Count active meetings for a given project.
   */
  countForProject(projectName: string): number {
    let count = 0;
    for (const entry of this.entries.values()) {
      if (entry.projectName === projectName) {
        count++;
      }
    }
    return count;
  }

  /**
   * List active meetings for a given project.
   */
  listForProject(projectName: string): ActiveMeetingEntry[] {
    const result: ActiveMeetingEntry[] = [];
    for (const entry of this.entries.values()) {
      if (entry.projectName === projectName) {
        result.push(entry);
      }
    }
    return result;
  }

  /**
   * Attempt to acquire the close guard for a meeting. Returns true if
   * acquired (no close was already in progress), false if a close is
   * already underway for this ID.
   */
  acquireClose(id: MeetingId): boolean {
    if (!this.entries.has(id)) {
      throw new Error(`Cannot acquire close guard for unregistered meeting "${id as string}"`);
    }
    if (this.closingIds.has(id)) {
      return false;
    }
    this.closingIds.add(id);
    return true;
  }

  /**
   * Number of entries currently in the registry.
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Release the close guard for a meeting.
   */
  releaseClose(id: MeetingId): void {
    this.closingIds.delete(id);
  }
}
