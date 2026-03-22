import type { Artifact } from "@/lib/types";
import {
  ARTIFACT_STATUS_GROUP,
  UNKNOWN_STATUS_PRIORITY,
  compareArtifactsByStatusAndTitle,
} from "@/lib/types";
import { capitalize } from "@/lib/artifact-grouping";

export type SmartViewFilter = "whats-next" | "needs-discussion" | "ready-to-advance";

export const SMART_VIEW_FILTERS: { key: SmartViewFilter; label: string }[] = [
  { key: "whats-next", label: "What's Next" },
  { key: "needs-discussion", label: "Needs Discussion" },
  { key: "ready-to-advance", label: "Ready to Advance" },
];

/** Directories excluded from all smart views. These have dedicated tabs. */
const EXCLUDED_DIRECTORIES = new Set(["meetings", "commissions"]);

/** Maps first path segment to display label. REQ-SMARTVIEW-12. */
const TYPE_LABELS: Record<string, string> = {
  specs: "Spec",
  plans: "Plan",
  brainstorm: "Brainstorm",
  issues: "Issue",
  research: "Research",
  retros: "Retro",
  design: "Design",
  reference: "Reference",
  notes: "Notes",
  tasks: "Task",
  diagrams: "Diagram",
};

/** Returns the first path segment, or null for root-level files. */
export function artifactTypeSegment(relativePath: string): string | null {
  const slash = relativePath.indexOf("/");
  return slash === -1 ? null : relativePath.slice(0, slash);
}

/** Human-readable type label from the first path segment. REQ-SMARTVIEW-12. */
export function artifactTypeLabel(relativePath: string): string | null {
  const segment = artifactTypeSegment(relativePath);
  return segment ? (TYPE_LABELS[segment] ?? null) : null;
}

/** Domain label from the second path segment, if present. REQ-SMARTVIEW-13. */
export function artifactDomain(relativePath: string): string | null {
  const parts = relativePath.split("/");
  if (parts.length < 3) return null;
  return capitalize(parts[1]);
}

/** Excludes meetings/, commissions/, and root-level files from smart views. */
function isSmartViewCandidate(artifact: Artifact): boolean {
  const segment = artifactTypeSegment(artifact.relativePath);
  if (segment === null) return false;
  return !EXCLUDED_DIRECTORIES.has(segment);
}

/**
 * "What's Next": Group 0 (pending) OR Group 2 (blocked/failed/cancelled).
 * After REQ-SMARTVIEW-17, Group 0 includes approved.
 * REQ-SMARTVIEW-6.
 */
function isWhatsNext(artifact: Artifact): boolean {
  const group =
    ARTIFACT_STATUS_GROUP[artifact.meta.status.toLowerCase().trim()] ??
    UNKNOWN_STATUS_PRIORITY;
  return group === 0 || group === 2;
}

/**
 * "Needs Discussion": exploratory artifacts with active statuses.
 * brainstorms with status "open", issues with status "open",
 * research with status "active".
 * REQ-SMARTVIEW-7.
 */
function isNeedsDiscussion(artifact: Artifact): boolean {
  const segment = artifactTypeSegment(artifact.relativePath);
  const status = artifact.meta.status.toLowerCase().trim();
  if (segment === "brainstorm" && status === "open") return true;
  if (segment === "issues" && status === "open") return true;
  if (segment === "research" && status === "active") return true;
  return false;
}

/**
 * "Ready to Advance": artifacts ready for the next lifecycle stage.
 * Specs, plans, and designs with status "approved".
 * REQ-SMARTVIEW-8.
 */
function isReadyToAdvance(artifact: Artifact): boolean {
  const segment = artifactTypeSegment(artifact.relativePath);
  const status = artifact.meta.status.toLowerCase().trim();
  if (status !== "approved") return false;
  return segment === "specs" || segment === "plans" || segment === "design";
}

/**
 * Filters artifacts for a smart view and returns them sorted.
 * REQ-SMARTVIEW-10: views are independent cuts; an artifact may appear in multiple.
 * REQ-SMARTVIEW-16: sorted by compareArtifactsByStatusAndTitle.
 */
export function filterSmartView(
  artifacts: Artifact[],
  filter: SmartViewFilter,
): Artifact[] {
  const candidates = artifacts.filter(isSmartViewCandidate);

  let predicate: (a: Artifact) => boolean;
  switch (filter) {
    case "whats-next":
      predicate = isWhatsNext;
      break;
    case "needs-discussion":
      predicate = isNeedsDiscussion;
      break;
    case "ready-to-advance":
      predicate = isReadyToAdvance;
      break;
  }

  const result = candidates.filter(predicate);
  result.sort(compareArtifactsByStatusAndTitle);
  return result;
}

/**
 * Computes badge counts for all three filters.
 * REQ-SMARTVIEW-5: counts are computed from the full artifact list at render time.
 */
export function smartViewCounts(
  artifacts: Artifact[],
): Record<SmartViewFilter, number> {
  const candidates = artifacts.filter(isSmartViewCandidate);
  return {
    "whats-next": candidates.filter(isWhatsNext).length,
    "needs-discussion": candidates.filter(isNeedsDiscussion).length,
    "ready-to-advance": candidates.filter(isReadyToAdvance).length,
  };
}
