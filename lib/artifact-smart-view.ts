import type { Artifact } from "@/lib/types";
import {
  compareArtifactsByStatusAndTitle,
  statusToPriority,
  artifactTypeSegment,
} from "@/lib/types";
import { capitalize } from "@/lib/artifact-grouping";

export type SmartViewFilter = "whats-next" | "needs-discussion" | "ready-to-advance";

export const SMART_VIEW_FILTERS: { key: SmartViewFilter; label: string }[] = [
  { key: "whats-next", label: "What's Next" },
  { key: "needs-discussion", label: "Needs Discussion" },
  { key: "ready-to-advance", label: "Ready to Advance" },
];

/** Directories excluded from all smart views. These have dedicated tabs. */
const EXCLUDED_DIRECTORIES = new Set(["Meeting", "Commission"]);

/** Set of types which are generative investigation artifacts. */
const GENERATIVE_INVESTIGATION_SEGMENTS = new Set(["Brainstorm", "Research", "Issue"]);

/** Set of types which are work items. */
const WORK_ITEM_SEGMENTS = new Set(["Spec", "Plan", "Design"]);

/** Returns true if the artifact is a generative investigation artifact. REQ-SMARTVIEW-14. */
export function isGenerativeInvestigation(artifact: Artifact): boolean {
  const segment = artifactTypeSegment(artifact.relativePath);
  return segment !== null && GENERATIVE_INVESTIGATION_SEGMENTS.has(segment);
}

/** Returns true if the artifact is a work item. REQ-SMARTVIEW-15. */
export function isWorkItem(artifact: Artifact): boolean {
  const segment = artifactTypeSegment(artifact.relativePath);
  return segment !== null && WORK_ITEM_SEGMENTS.has(segment);
}

/** Human-readable type label from the first path segment. REQ-SMARTVIEW-12. */
export function artifactTypeLabel(relativePath: string): string | null {
  return artifactTypeSegment(relativePath);
}

/** Domain label from the second path segment, if present. REQ-SMARTVIEW-13. */
export function artifactDomain(relativePath: string): string | null {
  const parts = relativePath.split("/");
  if (parts.length < 3) return null;
  return capitalize(parts[1]);
}

/** Excludes meetings/ and commissions/ from smart views. */
function isSmartViewCandidate(artifact: Artifact): boolean {
  const segment = artifactTypeSegment(artifact.relativePath);
  if (segment === null) return true;
  return !EXCLUDED_DIRECTORIES.has(segment);
}

/**
 * "What's Next": Group 0 (pending) OR Group 2 (blocked/failed/cancelled).
 * After REQ-SMARTVIEW-17, Group 0 includes approved.
 * REQ-SMARTVIEW-6.
 */
function isWhatsNext(artifact: Artifact): boolean {
  const group = statusToPriority(artifact.meta.status);
  return group === 0 || group === 2;
}

/**
 * "Needs Discussion": exploratory artifacts with active statuses.
 * brainstorms with status "open", issues with status "open",
 * research with status "active".
 * REQ-SMARTVIEW-7.
 */
function isNeedsDiscussion(artifact: Artifact): boolean {
  const group = statusToPriority(artifact.meta.status);
  if (group >= 3) return false;
  return isGenerativeInvestigation(artifact);
}

/**
 * "Ready to Advance": artifacts ready for the next lifecycle stage.
 * Specs, plans, and designs with status "approved".
 * REQ-SMARTVIEW-8.
 */
function isReadyToAdvance(artifact: Artifact): boolean {
  const status = artifact.meta.status.toLowerCase().trim();
  if (status !== "approved") return false;
  return isWorkItem(artifact);
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
