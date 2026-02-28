/**
 * Helpers for reading and manipulating commission artifact files.
 *
 * Commission artifacts are markdown files with YAML frontmatter, stored at
 * {projectPath}/.lore/commissions/{commissionId}.md. All modifications use
 * regex/string operations on the raw file content to avoid reformatting
 * noise from gray-matter (same approach as meeting-artifact-helpers.ts).
 *
 * PATH OWNERSHIP:
 * All functions in this module accept a `projectPath` parameter. Callers are
 * responsible for providing the correct path:
 * - Active commissions (dispatched/in_progress): pass the activity worktree
 *   path (commission-session.ts resolveArtifactBasePath returns this)
 * - All other states: pass the integration worktree path
 * Writing to the wrong path silently corrupts the wrong branch. The routing
 * logic lives in commission-session.ts (resolveArtifactBasePath for daemon
 * reads/writes) and toolbox-resolver.ts (context.workingDirectory for the
 * commission toolbox).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CommissionId, CommissionStatus } from "@/daemon/types";
import { parseActivityTimeline, type TimelineEntry } from "@/lib/commissions";
import { escapeYamlValue, parseLinkedArtifacts, insertLinkedArtifact } from "@/daemon/lib/toolbox-utils";
export { parseActivityTimeline } from "@/lib/commissions";
export type { TimelineEntry } from "@/lib/commissions";

/**
 * Replaces a top-level YAML frontmatter field that may span multiple lines.
 * Matches from "fieldName: " through all continuation lines (lines that don't
 * start a new top-level key) up to the next top-level field or closing ---.
 */
function replaceYamlField(raw: string, fieldName: string, newValue: string): string {
  const pattern = new RegExp(
    `^${fieldName}: .*$(?:\\n(?![a-z_]|---).*)*`,
    "m",
  );
  return raw.replace(pattern, `${fieldName}: ${newValue}`);
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

// -- Dependency operations --

/**
 * Reads the dependencies array from a commission artifact's frontmatter.
 * Returns an array of artifact paths, or an empty array if none are listed.
 */
export async function readCommissionDependencies(
  projectPath: string,
  commissionId: CommissionId,
): Promise<string[]> {
  const artifactPath = commissionArtifactPath(projectPath, commissionId);
  const raw = await fs.readFile(artifactPath, "utf-8");

  // Check for empty array form: `dependencies: []`
  if (/^dependencies: \[\]$/m.test(raw)) {
    return [];
  }

  // Parse list items under dependencies:
  const match = raw.match(
    /^dependencies:\n((?:  - .+\n)*)/m,
  );
  if (!match) return [];

  return match[1]
    .split("\n")
    .filter((line) => line.startsWith("  - "))
    .map((line) => line.replace(/^  - /, "").trim());
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
  let logEntry = `  - timestamp: ${now.toISOString()}\n    event: ${event}\n    reason: "${escapeYamlValue(reason)}"`;

  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      logEntry += `\n    ${key}: "${escapeYamlValue(value)}"`;
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
  const updated = replaceYamlField(raw, "current_progress", `"${escapeYamlValue(summary)}"`);
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
  raw = replaceYamlField(raw, "result_summary", `"${escapeYamlValue(summary)}"`);
  await fs.writeFile(artifactPath, raw, "utf-8");

  if (artifacts && artifacts.length > 0) {
    for (const artifact of artifacts) {
      await addLinkedArtifact(projectPath, commissionId, artifact);
    }
  }
}

// -- Linked artifacts operations --

/**
 * Reads the linked_artifacts array from a commission artifact's frontmatter.
 */
export async function readLinkedArtifacts(
  projectPath: string,
  commissionId: CommissionId,
): Promise<string[]> {
  const artifactPath = commissionArtifactPath(projectPath, commissionId);
  const raw = await fs.readFile(artifactPath, "utf-8");
  return parseLinkedArtifacts(raw);
}

/**
 * Adds an artifact path to the linked_artifacts array in a commission
 * artifact's frontmatter. Deduplicates: returns false if already present.
 */
export async function addLinkedArtifact(
  projectPath: string,
  commissionId: CommissionId,
  artifactRelPath: string,
): Promise<boolean> {
  const artifactPath = commissionArtifactPath(projectPath, commissionId);
  const raw = await fs.readFile(artifactPath, "utf-8");
  const { updated, added } = insertLinkedArtifact(raw, artifactRelPath);
  if (added) {
    await fs.writeFile(artifactPath, updated, "utf-8");
  }
  return added;
}

