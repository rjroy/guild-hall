/**
 * Pure-function logic for the triggered commission form fields.
 * Extracted from CommissionForm to keep rendering and data logic separate.
 */

/**
 * Maps each system event type to its available field keys.
 * Derived from SystemEvent variants in daemon/lib/event-bus.ts.
 * This is a static snapshot; update manually when event types change.
 */
export const EVENT_TYPE_FIELDS: Record<string, string[]> = {
  commission_status: ["commissionId", "status", "oldStatus", "projectName", "reason"],
  commission_result: ["commissionId", "summary", "artifacts"],
  commission_progress: ["commissionId", "summary"],
  commission_artifact: ["commissionId", "artifactPath"],
  commission_manager_note: ["commissionId", "content"],
  commission_queued: ["commissionId", "reason"],
  commission_dequeued: ["commissionId", "reason"],
  meeting_started: ["meetingId", "worker"],
  meeting_ended: ["meetingId"],
  schedule_spawned: ["scheduleId", "spawnedId", "projectName", "runNumber"],
  toolbox_replicate: ["action", "tool", "model", "files", "cost", "projectName", "contextId"],
};

/**
 * Builds an array of text segments for the match summary line.
 * Each segment is marked as plain text or code, so the render site
 * can wrap code segments in <code> elements.
 *
 * Returns an empty array when no event type is selected.
 */
export function buildMatchSummaryParts(
  matchType: string,
  projectFilter: string,
  fieldPatterns: { key: string; value: string }[],
): { text: string; isCode: boolean }[] {
  if (!matchType) return [];

  const nonEmpty = fieldPatterns.filter((fp) => fp.key.trim() && fp.value.trim());

  const parts: { text: string; isCode: boolean }[] = [];
  parts.push({ text: "This trigger will fire on ", isCode: false });

  if (!projectFilter.trim() && nonEmpty.length === 0) {
    parts.push({ text: "any ", isCode: false });
  }

  parts.push({ text: matchType, isCode: true });

  if (projectFilter.trim() && nonEmpty.length === 0) {
    parts.push({ text: " events from project ", isCode: false });
    parts.push({ text: projectFilter.trim(), isCode: true });
  } else if (!projectFilter.trim() && nonEmpty.length > 0) {
    parts.push({ text: " events where ", isCode: false });
    nonEmpty.forEach((fp, i) => {
      if (i > 0) parts.push({ text: " and ", isCode: false });
      parts.push({ text: fp.key.trim(), isCode: true });
      parts.push({ text: " matches ", isCode: false });
      parts.push({ text: fp.value.trim(), isCode: true });
    });
  } else if (projectFilter.trim() && nonEmpty.length > 0) {
    parts.push({ text: " events from project ", isCode: false });
    parts.push({ text: projectFilter.trim(), isCode: true });
    parts.push({ text: " where ", isCode: false });
    nonEmpty.forEach((fp, i) => {
      if (i > 0) parts.push({ text: " and ", isCode: false });
      parts.push({ text: fp.key.trim(), isCode: true });
      parts.push({ text: " matches ", isCode: false });
      parts.push({ text: fp.value.trim(), isCode: true });
    });
  } else {
    parts.push({ text: " event", isCode: false });
  }

  parts.push({ text: ".", isCode: false });
  return parts;
}

/**
 * Assembles the trigger-specific payload fields from form state.
 * Filters out field pattern rows where key or value is empty.
 */
export function buildTriggerPayloadFields(
  matchType: string,
  projectFilter: string,
  fieldPatterns: { key: string; value: string }[],
  approval: "confirm" | "auto",
  maxDepth: string,
): Record<string, unknown> {
  const match: Record<string, unknown> = { type: matchType };

  if (projectFilter.trim()) {
    match.projectName = projectFilter.trim();
  }

  const nonEmpty = fieldPatterns.filter((fp) => fp.key.trim() && fp.value.trim());
  if (nonEmpty.length > 0) {
    const fields: Record<string, string> = {};
    for (const fp of nonEmpty) {
      fields[fp.key.trim()] = fp.value.trim();
    }
    match.fields = fields;
  }

  const result: Record<string, unknown> = {
    type: "triggered",
    match,
  };

  if (approval !== "confirm") {
    result.approval = approval;
  }

  if (maxDepth.trim()) {
    const parsed = parseInt(maxDepth, 10);
    if (!isNaN(parsed) && parsed > 0) {
      result.maxDepth = parsed;
    }
  }

  return result;
}
