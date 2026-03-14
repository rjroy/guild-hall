/**
 * Meeting artifact record operations.
 *
 * Meeting artifacts are markdown files with YAML frontmatter, written as
 * raw template literals (not gray-matter) to avoid reformatting noise.
 * Field-level modifications delegate to shared utilities in record-utils.ts
 * for consistent YAML manipulation across commissions and meetings.
 *
 * Used by meeting/orchestrator.ts (lifecycle) and meeting-toolbox.ts (agent tools).
 *
 * PATH OWNERSHIP:
 * All functions in this file accept a `projectPath` parameter and do not
 * perform their own routing. Callers are responsible for passing the correct
 * path:
 *   - Open meetings: activity worktree path (meeting.worktreeDir)
 *   - Requested/closed/declined: integration worktree path
 *
 * Routing is enforced at two callsites:
 *   - meeting/orchestrator.ts passes worktreeDir directly for open-meeting writes
 *     and integrationWorktreePath() for all other states.
 *   - meeting-toolbox.ts (makeLinkArtifactHandler, makeSummarizeProgressHandler)
 *     uses MeetingToolboxDeps.worktreeDir ?? projectPath, with worktreeDir set
 *     to meeting.worktreeDir by toolbox-resolver.ts for active meetings.
 *
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { MeetingId, MeetingStatus } from "@/daemon/types";
import { parseLinkedArtifacts, insertLinkedArtifact, escapeYamlValue } from "@/daemon/lib/toolbox-utils";
import { readYamlField, replaceYamlField, appendLogEntry } from "@/daemon/lib/record-utils";
import type { Log } from "@/daemon/lib/log";
import { nullLog } from "@/daemon/lib/log";

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
  const value = readYamlField(raw, "status");
  return value ? (value as MeetingStatus) : null;
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
  const updated = replaceYamlField(raw, "status", newStatus);
  await fs.writeFile(artifactPath, updated, "utf-8");
}

// -- Rename operations --

/**
 * Updates the title field in a meeting artifact's frontmatter and appends
 * a renamed log entry. Both changes land in a single file write.
 *
 * Returns { renamed: true } if the write happened, { renamed: false } if
 * the new title matches the current stored title (no-op).
 */
export async function renameMeetingArtifact(
  projectPath: string,
  meetingId: MeetingId,
  newTitle: string,
): Promise<{ renamed: boolean }> {
  const artifactPath = meetingArtifactPath(projectPath, meetingId);
  let raw = await fs.readFile(artifactPath, "utf-8");

  // No-op: current stored title (quotes stripped) matches new title
  const currentTitle = readYamlField(raw, "title") ?? "";
  if (currentTitle === newTitle) {
    return { renamed: false };
  }

  // Update title field (quoted YAML string to match creation format)
  raw = replaceYamlField(raw, "title", `"${escapeYamlValue(newTitle)}"`);

  // Append renamed log entry before closing ---
  const now = new Date();
  const reason = `Renamed to: ${newTitle}`;
  const entry = `  - timestamp: ${now.toISOString()}\n    event: renamed\n    reason: "${escapeYamlValue(reason)}"`;
  raw = appendLogEntry(raw, entry);

  await fs.writeFile(artifactPath, raw, "utf-8");
  return { renamed: true };
}

// -- Meeting log operations --

/**
 * Appends a timestamped event entry to the meeting_log section of a
 * meeting artifact. Builds a meeting-specific log entry string
 * (timestamp, event, reason) and inserts it before the closing "---"
 * delimiter.
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
  const entry = `  - timestamp: ${now.toISOString()}\n    event: ${event}\n    reason: "${escapeYamlValue(reason)}"`;

  const updated = appendLogEntry(raw, entry);
  await fs.writeFile(artifactPath, updated, "utf-8");
}

// -- Artifact creation --

/**
 * Creates a new meeting artifact with YAML frontmatter and empty body.
 * Uses a template literal (not gray-matter stringify) to avoid
 * reformatting noise in git diffs.
 */
export async function writeMeetingArtifact(
  projectPath: string,
  meetingId: MeetingId,
  workerDisplayTitle: string,
  prompt: string,
  workerName: string,
  status: MeetingStatus = "open",
): Promise<void> {
  const artifactPath = meetingArtifactPath(projectPath, meetingId);
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });

  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const isoStr = now.toISOString();

  const initialEvent = status === "requested" ? "requested" : "opened";
  const initialReason = status === "requested"
    ? "Meeting requested"
    : "User started audience";

  // Write raw YAML frontmatter + empty body. Using template literal to
  // avoid gray-matter stringify reformatting (lesson from retros).
  const content = `---
title: "Audience with ${workerDisplayTitle}"
date: ${dateStr}
status: ${status}
tags: [meeting]
worker: ${workerName}
workerDisplayTitle: "${escapeYamlValue(workerDisplayTitle)}"
agenda: "${escapeYamlValue(prompt)}"
deferred_until: ""
linked_artifacts: []
meeting_log:
  - timestamp: ${isoStr}
    event: ${initialEvent}
    reason: "${initialReason}"
---
`;
  await fs.writeFile(artifactPath, content, "utf-8");
}

// -- Notes operations --

/**
 * Writes meeting notes to the artifact body (everything after the closing
 * frontmatter "---" delimiter). Replaces any existing body content.
 */
export async function writeNotesToArtifact(
  projectPath: string,
  meetingId: MeetingId,
  notes: string,
  log: Log = nullLog("meeting-record"),
): Promise<void> {
  const artifactPath = meetingArtifactPath(projectPath, meetingId);
  const raw = await fs.readFile(artifactPath, "utf-8");

  // Find the closing frontmatter delimiter. The artifact starts with "---\n"
  // and has a second "---" to close the frontmatter block.
  const firstDelim = raw.indexOf("---");
  if (firstDelim === -1) {
    log.error(`No frontmatter found in artifact for meeting ${meetingId}`);
    return;
  }
  const closingDelim = raw.indexOf("\n---", firstDelim + 3);
  if (closingDelim === -1) {
    log.error(`No closing frontmatter delimiter found in artifact for meeting ${meetingId}`);
    return;
  }

  // Replace everything after the closing "---" with the notes content.
  // Preserve the closing delimiter itself followed by a newline, then the body.
  const frontmatterWithDelim = raw.slice(0, closingDelim + 4); // includes "\n---"
  const updated = frontmatterWithDelim + "\n" + notes + "\n";
  await fs.writeFile(artifactPath, updated, "utf-8");
}

/**
 * Applies notes, status update, and log entry to a meeting artifact in a
 * single read-write cycle. Replaces the three separate operations
 * (writeNotesToArtifact + updateArtifactStatus + appendMeetingLog) that
 * the close flow previously called sequentially.
 */
export async function closeArtifact(
  projectPath: string,
  meetingId: MeetingId,
  notes: string,
  newStatus: MeetingStatus,
  logEvent: string,
  logReason: string,
  log: Log = nullLog("meeting-record"),
): Promise<void> {
  const artifactPath = meetingArtifactPath(projectPath, meetingId);
  let raw = await fs.readFile(artifactPath, "utf-8");

  // 1. Update status field in frontmatter
  raw = replaceYamlField(raw, "status", newStatus);

  // 2. Append log entry before the closing "---"
  const now = new Date();
  const entry = `  - timestamp: ${now.toISOString()}\n    event: ${logEvent}\n    reason: "${escapeYamlValue(logReason)}"`;
  raw = appendLogEntry(raw, entry);

  // 3. Replace body (everything after closing frontmatter delimiter)
  const firstDelim = raw.indexOf("---");
  if (firstDelim === -1) {
    log.error(`No frontmatter found in artifact for meeting ${meetingId}`);
    return;
  }
  const closingDelim = raw.indexOf("\n---", firstDelim + 3);
  if (closingDelim === -1) {
    log.error(`No closing frontmatter delimiter found in artifact for meeting ${meetingId}`);
    return;
  }
  const frontmatterWithDelim = raw.slice(0, closingDelim + 4);
  raw = frontmatterWithDelim + "\n" + notes + "\n";

  await fs.writeFile(artifactPath, raw, "utf-8");
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
