/**
 * Pure sorting functions for artifacts. Separated from artifacts.ts so
 * client-side code (artifact-grouping.ts) can import without pulling in
 * node:fs/promises.
 */

import type { Artifact } from "@/lib/types";

/**
 * Five-group status priority for artifact browsing views.
 * Groups are ordered by actionability: work needing attention surfaces first,
 * completed work sinks below, closed/negative is near the bottom.
 *
 * This intentionally differs from gem color grouping (statusToGem). For example,
 * "implemented" maps to the green gem (active) but sorts in the Terminal group
 * (priority 2) because it's done and needs no action.
 */
const ARTIFACT_STATUS_GROUP: Record<string, number> = {
  // Group 0: Active work (needs attention) [active gem]
  draft: 0,
  open: 0,
  pending: 0,
  requested: 0,
  blocked: 0,
  queued: 0,
  // Group 1: In progress [pending gem]
  approved: 1,
  active: 1,
  current: 1,
  in_progress: 1,
  dispatched: 1,
  sleeping: 1,
  // Group 3: Closed negative
  failed: 2,
  cancelled: 2,
  // Group 2: Terminal (done, no action needed)
  declined: 3,
  superseded: 3,
  outdated: 3,
  wontfix: 3,
  complete: 3,
  resolved: 3,
  implemented: 3,
  abandoned: 3,
};
const UNKNOWN_STATUS_PRIORITY = 4;

export function artifactStatusPriority(status: string): number {
  return ARTIFACT_STATUS_GROUP[status.toLowerCase().trim()] ?? UNKNOWN_STATUS_PRIORITY;
}

/**
 * Compare function for artifact browsing views (Surface 2: tree view).
 * Sorts by: status group (REQ-SORT-4), date descending, title/path alphabetical.
 * Missing fields sort after present ones (REQ-SORT-3).
 * Empty titles fall back to relativePath as tiebreaker (REQ-SORT-15).
 */
export function compareArtifactsByStatusAndTitle(a: Artifact, b: Artifact): number {
  // 1. Status group priority
  const statusDiff = artifactStatusPriority(a.meta.status) - artifactStatusPriority(b.meta.status);
  if (statusDiff !== 0) return statusDiff;

  // 2. Date descending (newer first). Empty dates sort last.
  const aDate = a.meta.date;
  const bDate = b.meta.date;
  if (aDate && !bDate) return -1;
  if (!aDate && bDate) return 1;
  if (aDate && bDate) {
    const dateCmp = bDate.localeCompare(aDate);
    if (dateCmp !== 0) return dateCmp;
  }

  // 3. Title alphabetical tiebreaker. Empty titles fall back to relativePath.
  const aTitle = a.meta.title || a.relativePath;
  const bTitle = b.meta.title || b.relativePath;
  return aTitle.localeCompare(bTitle);
}
