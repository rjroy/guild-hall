/**
 * Shared helpers for reading and manipulating meeting artifact files.
 *
 * Meeting artifacts are markdown files with YAML frontmatter, written as
 * raw template literals (not gray-matter) to avoid reformatting noise.
 * All modifications use regex/string operations on the raw file content.
 *
 * Used by meeting-session.ts (lifecycle) and meeting-toolbox.ts (agent tools).
 *
 * PATH OWNERSHIP:
 * All functions in this file accept a `projectPath` parameter and do not
 * perform their own routing. Callers are responsible for passing the correct
 * path:
 *   - Open meetings: activity worktree path (meeting.worktreeDir)
 *   - Requested/closed/declined: integration worktree path
 *
 * Routing is enforced at two callsites:
 *   - meeting-session.ts passes worktreeDir directly for open-meeting writes
 *     and integrationWorktreePath() for all other states.
 *   - meeting-toolbox.ts (makeLinkArtifactHandler, makeSummarizeProgressHandler)
 *     uses MeetingToolboxDeps.worktreeDir ?? projectPath, with worktreeDir set
 *     to meeting.worktreeDir by toolbox-resolver.ts for active meetings.
 *
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { MeetingId, MeetingStatus } from "@/daemon/types";
import { parseLinkedArtifacts, insertLinkedArtifact } from "@/daemon/lib/toolbox-utils";

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
 */
export async function readLinkedArtifacts(
  projectPath: string,
  meetingId: MeetingId,
): Promise<string[]> {
  const artifactPath = meetingArtifactPath(projectPath, meetingId);
  const raw = await fs.readFile(artifactPath, "utf-8");
  return parseLinkedArtifacts(raw);
}

/**
 * Adds an artifact path to the linked_artifacts array in a meeting
 * artifact's frontmatter. Deduplicates: returns false if already present.
 */
export async function addLinkedArtifact(
  projectPath: string,
  meetingId: MeetingId,
  artifactRelPath: string,
): Promise<boolean> {
  const artifactPath = meetingArtifactPath(projectPath, meetingId);
  const raw = await fs.readFile(artifactPath, "utf-8");
  const { updated, added } = insertLinkedArtifact(raw, artifactRelPath);
  if (added) {
    await fs.writeFile(artifactPath, updated, "utf-8");
  }
  return added;
}
