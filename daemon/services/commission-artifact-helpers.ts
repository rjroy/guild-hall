/**
 * Helpers for reading and manipulating commission artifact files.
 *
 * Commission artifacts are markdown files with YAML frontmatter, stored at
 * {projectPath}/.lore/commissions/{commissionId}.md. All modifications use
 * regex/string operations on the raw file content to avoid reformatting
 * noise from gray-matter (same approach as meeting-artifact-helpers.ts).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CommissionId, CommissionStatus } from "@/daemon/types";

// -- Types --

export interface TimelineEntry {
  timestamp: string;
  event: string;
  reason: string;
  [key: string]: unknown;
}

// -- Path resolution --

/**
 * Returns the filesystem path for a commission artifact within a project.
 */
export function commissionArtifactPath(
  projectPath: string,
  commissionId: CommissionId,
): string {
  return path.join(projectPath, ".lore", "commissions", `${commissionId}.md`);
}

// -- Status operations --

/**
 * Reads the current status from a commission artifact's frontmatter.
 * Returns the status string or null if not found.
 */
export async function readCommissionStatus(
  projectPath: string,
  commissionId: CommissionId,
): Promise<CommissionStatus | null> {
  const artifactPath = commissionArtifactPath(projectPath, commissionId);
  const raw = await fs.readFile(artifactPath, "utf-8");
  const match = raw.match(/^status: (\S+)$/m);
  return match ? (match[1] as CommissionStatus) : null;
}

/**
 * Updates the status field in a commission artifact's frontmatter.
 */
export async function updateCommissionStatus(
  projectPath: string,
  commissionId: CommissionId,
  newStatus: CommissionStatus,
): Promise<void> {
  const artifactPath = commissionArtifactPath(projectPath, commissionId);
  const raw = await fs.readFile(artifactPath, "utf-8");
  const updated = raw.replace(/^status: \S+$/m, `status: ${newStatus}`);
  await fs.writeFile(artifactPath, updated, "utf-8");
}

// -- Timeline operations --

/**
 * Appends a timestamped entry to the activity_timeline section of a
 * commission artifact. Inserts the entry before the "current_progress:"
 * line, or before the closing "---" if current_progress is absent.
 *
 * The extra parameter allows adding arbitrary key-value pairs to the
 * timeline entry (e.g., question text, artifact paths).
 */
export async function appendTimelineEntry(
  projectPath: string,
  commissionId: CommissionId,
  event: string,
  reason: string,
  extra?: Record<string, string>,
): Promise<void> {
  const artifactPath = commissionArtifactPath(projectPath, commissionId);
  const raw = await fs.readFile(artifactPath, "utf-8");

  const now = new Date();
  let logEntry = `  - timestamp: ${now.toISOString()}\n    event: ${event}\n    reason: "${reason.replace(/"/g, '\\"')}"`;

  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      logEntry += `\n    ${key}: "${value.replace(/"/g, '\\"')}"`;
    }
  }

  // Insert before "current_progress:" line
  const progressIndex = raw.indexOf("current_progress:");
  if (progressIndex !== -1) {
    const updated =
      raw.slice(0, progressIndex) +
      logEntry +
      "\n" +
      raw.slice(progressIndex);
    await fs.writeFile(artifactPath, updated, "utf-8");
    return;
  }

  // Fallback: append before closing ---
  const closingIndex = raw.lastIndexOf("\n---");
  if (closingIndex !== -1) {
    const updated =
      raw.slice(0, closingIndex) + "\n" + logEntry + raw.slice(closingIndex);
    await fs.writeFile(artifactPath, updated, "utf-8");
    return;
  }

  throw new Error(
    `Cannot append timeline entry to ${artifactPath}: no "current_progress:" field or closing "---" delimiter found`,
  );
}

/**
 * Parses the activity_timeline section into an array of typed entries.
 * Handles the YAML list format used in commission artifact frontmatter.
 */
export async function readActivityTimeline(
  projectPath: string,
  commissionId: CommissionId,
): Promise<TimelineEntry[]> {
  const artifactPath = commissionArtifactPath(projectPath, commissionId);
  const raw = await fs.readFile(artifactPath, "utf-8");
  return parseActivityTimeline(raw);
}

/**
 * Pure function that parses the activity_timeline block from raw file
 * content into typed TimelineEntry objects.
 */
export function parseActivityTimeline(raw: string): TimelineEntry[] {
  // Find the activity_timeline block
  const timelineMatch = raw.match(
    /^activity_timeline:\n((?:  - .+\n(?:    .+\n)*)*)/m,
  );
  if (!timelineMatch) return [];

  const block = timelineMatch[1];
  const entries: TimelineEntry[] = [];
  let currentEntry: Record<string, unknown> | null = null;

  for (const line of block.split("\n")) {
    if (!line.trim()) continue;

    // New entry starts with "  - key: value"
    const entryStartMatch = line.match(/^  - (\w+): (.+)$/);
    if (entryStartMatch) {
      if (currentEntry) {
        entries.push(currentEntry as TimelineEntry);
      }
      currentEntry = { [entryStartMatch[1]]: stripQuotes(entryStartMatch[2]) };
      continue;
    }

    // Continuation line: "    key: value"
    const continuationMatch = line.match(/^    (\w+): (.+)$/);
    if (continuationMatch && currentEntry) {
      currentEntry[continuationMatch[1]] = stripQuotes(continuationMatch[2]);
    }
  }

  if (currentEntry) {
    entries.push(currentEntry as TimelineEntry);
  }

  return entries;
}

// -- Progress operations --

/**
 * Replaces the current_progress value in a commission artifact.
 * This is a replace-latest operation, not an append.
 */
export async function updateCurrentProgress(
  projectPath: string,
  commissionId: CommissionId,
  summary: string,
): Promise<void> {
  const artifactPath = commissionArtifactPath(projectPath, commissionId);
  const raw = await fs.readFile(artifactPath, "utf-8");
  const escaped = summary.replace(/"/g, '\\"');
  const updated = raw.replace(
    /^current_progress: .*$/m,
    `current_progress: "${escaped}"`,
  );
  await fs.writeFile(artifactPath, updated, "utf-8");
}

// -- Result operations --

/**
 * Sets the result_summary field and optionally appends artifacts to
 * linked_artifacts in a commission artifact.
 */
export async function updateResultSummary(
  projectPath: string,
  commissionId: CommissionId,
  summary: string,
  artifacts?: string[],
): Promise<void> {
  const artifactPath = commissionArtifactPath(projectPath, commissionId);
  let raw = await fs.readFile(artifactPath, "utf-8");

  // Update result_summary
  const escaped = summary.replace(/"/g, '\\"');
  raw = raw.replace(
    /^result_summary: .*$/m,
    `result_summary: "${escaped}"`,
  );

  await fs.writeFile(artifactPath, raw, "utf-8");

  // Append linked artifacts if provided
  if (artifacts && artifacts.length > 0) {
    for (const artifact of artifacts) {
      await addLinkedArtifact(projectPath, commissionId, artifact);
    }
  }
}

// -- Linked artifacts operations --

/**
 * Reads the linked_artifacts array from a commission artifact's frontmatter.
 * Returns an array of artifact paths, or an empty array if none are linked.
 */
export async function readLinkedArtifacts(
  projectPath: string,
  commissionId: CommissionId,
): Promise<string[]> {
  const artifactPath = commissionArtifactPath(projectPath, commissionId);
  const raw = await fs.readFile(artifactPath, "utf-8");

  // Check for empty array form: `linked_artifacts: []`
  if (/^linked_artifacts: \[\]$/m.test(raw)) {
    return [];
  }

  // Parse list items under linked_artifacts:
  const match = raw.match(
    /^linked_artifacts:\n((?:  - .+\n)*)/m,
  );
  if (!match) return [];

  return match[1]
    .split("\n")
    .filter((line) => line.startsWith("  - "))
    .map((line) => line.replace(/^  - /, "").trim());
}

/**
 * Adds an artifact path to the linked_artifacts array in a commission
 * artifact's frontmatter. Deduplicates: returns false if already present.
 *
 * Handles both the empty array form (`[]`) and existing list entries.
 */
export async function addLinkedArtifact(
  projectPath: string,
  commissionId: CommissionId,
  artifactRelPath: string,
): Promise<boolean> {
  const artifactPath = commissionArtifactPath(projectPath, commissionId);
  const raw = await fs.readFile(artifactPath, "utf-8");

  // Check if already linked
  const existing = await readLinkedArtifacts(projectPath, commissionId);
  if (existing.includes(artifactRelPath)) {
    return false;
  }

  let updated: string;

  // Case 1: empty array form `linked_artifacts: []`
  if (/^linked_artifacts: \[\]$/m.test(raw)) {
    updated = raw.replace(
      /^linked_artifacts: \[\]$/m,
      `linked_artifacts:\n  - ${artifactRelPath}`,
    );
  } else {
    // Case 2: existing list entries. Find the end of the linked_artifacts block.
    const linkedIndex = raw.indexOf("linked_artifacts:\n");
    if (linkedIndex === -1) {
      return false;
    }

    // Find where the linked_artifacts block ends (next field at column 0)
    const afterLinked = raw.slice(linkedIndex + "linked_artifacts:\n".length);
    const nextFieldMatch = afterLinked.match(/^[a-z_]/m);
    const insertionPoint = nextFieldMatch
      ? linkedIndex + "linked_artifacts:\n".length + (nextFieldMatch.index ?? 0)
      : raw.length;

    updated =
      raw.slice(0, insertionPoint) +
      `  - ${artifactRelPath}\n` +
      raw.slice(insertionPoint);
  }

  await fs.writeFile(artifactPath, updated, "utf-8");
  return true;
}

// -- Helpers --

/**
 * Strips surrounding quotes from a YAML string value.
 */
function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
