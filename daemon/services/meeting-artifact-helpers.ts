/**
 * Shared helpers for reading and manipulating meeting artifact files.
 *
 * Meeting artifacts are markdown files with YAML frontmatter, written as
 * raw template literals (not gray-matter) to avoid reformatting noise.
 * All modifications use regex/string operations on the raw file content.
 *
 * Used by meeting-session.ts (lifecycle) and meeting-toolbox.ts (agent tools).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { MeetingId, MeetingStatus } from "@/daemon/types";

// -- Path resolution --

/**
 * Returns the filesystem path for a meeting artifact within a project.
 */
export function meetingArtifactPath(
  projectPath: string,
  meetingId: MeetingId,
): string {
  return path.join(projectPath, ".lore", "meetings", `${meetingId}.md`);
}

// -- Status operations --

/**
 * Reads the current status from a meeting artifact's frontmatter.
 * Returns the status string or null if not found.
 */
export async function readArtifactStatus(
  projectPath: string,
  meetingId: MeetingId,
): Promise<MeetingStatus | null> {
  const artifactPath = meetingArtifactPath(projectPath, meetingId);
  const raw = await fs.readFile(artifactPath, "utf-8");
  const match = raw.match(/^status: (\w+)$/m);
  return match ? (match[1] as MeetingStatus) : null;
}

/**
 * Updates the status field in a meeting artifact's frontmatter.
 */
export async function updateArtifactStatus(
  projectPath: string,
  meetingId: MeetingId,
  newStatus: MeetingStatus,
): Promise<void> {
  const artifactPath = meetingArtifactPath(projectPath, meetingId);
  const raw = await fs.readFile(artifactPath, "utf-8");
  const updated = raw.replace(/^status: \w+$/m, `status: ${newStatus}`);
  await fs.writeFile(artifactPath, updated, "utf-8");
}

// -- Meeting log operations --

/**
 * Appends a timestamped event entry to the meeting_log section of a
 * meeting artifact. Inserts the entry before the "notes_summary:" line,
 * or before the closing "---" if notes_summary is absent.
 */
export async function appendMeetingLog(
  projectPath: string,
  meetingId: MeetingId,
  event: string,
  reason: string,
): Promise<void> {
  const artifactPath = meetingArtifactPath(projectPath, meetingId);
  const raw = await fs.readFile(artifactPath, "utf-8");

  const now = new Date();
  const logEntry = `  - timestamp: ${now.toISOString()}\n    event: ${event}\n    reason: "${reason.replace(/"/g, '\\"')}"`;

  // Insert the new log entry before "notes_summary:" line
  const notesSummaryIndex = raw.indexOf("notes_summary:");
  if (notesSummaryIndex === -1) {
    // Fallback: append before closing ---
    const closingIndex = raw.lastIndexOf("\n---");
    if (closingIndex !== -1) {
      const updated =
        raw.slice(0, closingIndex) + "\n" + logEntry + raw.slice(closingIndex);
      await fs.writeFile(artifactPath, updated, "utf-8");
    }
    return;
  }

  const updated =
    raw.slice(0, notesSummaryIndex) +
    logEntry +
    "\n" +
    raw.slice(notesSummaryIndex);
  await fs.writeFile(artifactPath, updated, "utf-8");
}

// -- Linked artifacts operations --

/**
 * Reads the linked_artifacts array from a meeting artifact's frontmatter.
 * Returns an array of artifact paths, or an empty array if none are linked.
 */
export async function readLinkedArtifacts(
  projectPath: string,
  meetingId: MeetingId,
): Promise<string[]> {
  const artifactPath = meetingArtifactPath(projectPath, meetingId);
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
 * Adds an artifact path to the linked_artifacts array in a meeting
 * artifact's frontmatter. Handles both the empty array form (`[]`) and
 * existing list entries.
 *
 * Returns true if the path was added, false if it was already present.
 */
export async function addLinkedArtifact(
  projectPath: string,
  meetingId: MeetingId,
  artifactRelPath: string,
): Promise<boolean> {
  const artifactPath = meetingArtifactPath(projectPath, meetingId);
  const raw = await fs.readFile(artifactPath, "utf-8");

  // Check if already linked
  const existing = await readLinkedArtifacts(projectPath, meetingId);
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
    // Case 2: existing list entries. Find the last `  - <path>` line
    // under linked_artifacts: and append after it.
    // Look for the next field that starts at column 0 after linked_artifacts:
    const linkedIndex = raw.indexOf("linked_artifacts:\n");
    if (linkedIndex === -1) {
      // No linked_artifacts field at all; this shouldn't happen for meeting
      // artifacts, but handle gracefully by returning false.
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
