/**
 * Shared utilities used across toolbox implementations.
 *
 * Extracted from base-toolbox.ts, meeting-toolbox.ts, and manager-toolbox.ts
 * where identical copies existed.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CommissionSessionForRoutes } from "@/daemon/services/commission/orchestrator";
import type { CommissionRecordOps } from "@/daemon/services/commission/record";
import type { GitOps } from "@/daemon/lib/git";
import type { AppConfig, DiscoveredPackage } from "@/lib/types";
import {
  integrationWorktreePath,
  commissionWorktreePath,
  meetingWorktreePath,
} from "@/lib/paths";

/**
 * Services needed by the manager toolbox. Separated from GuildHallToolboxDeps
 * because only the manager worker needs them; other toolboxes don't.
 *
 * scheduleLifecycle, recordOps, and packages are optional because they're
 * needed only for scheduled commission tools.
 */
export interface GuildHallToolServices {
  commissionSession: CommissionSessionForRoutes;
  gitOps: GitOps;
  config: AppConfig;
  scheduleLifecycle?: unknown;
  triggerEvaluator?: unknown;
  recordOps?: CommissionRecordOps;
  packages?: DiscoveredPackage[];
}

/**
 * Resolves a path within a base directory and verifies it doesn't escape.
 * Throws on path traversal attempts.
 */
export function validateContainedPath(basePath: string, userPath: string): string {
  const resolvedBase = path.resolve(basePath);
  const resolved = path.resolve(basePath, userPath);
  if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
    throw new Error(`Path traversal detected: ${userPath} escapes ${basePath}`);
  }
  return resolved;
}

/**
 * Sanitizes a name for use in git branch/ref names. Replaces any character
 * that isn't alphanumeric or hyphen, collapses runs, and trims edges.
 */
export function sanitizeForGitRef(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Formats a Date as YYYYMMDD-HHMMSS for use in artifact IDs and filenames.
 */
export function formatTimestamp(now: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

/**
 * Escapes a string for use as a YAML double-quoted value.
 * Handles backslashes, double quotes, and newlines so the value
 * stays on a single line. YAML parsers (including gray-matter's
 * js-yaml) interpret \n back to newlines on read.
 */
export function escapeYamlValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

/**
 * Extracts a human-readable message from an unknown caught value.
 * Replaces the `err instanceof Error ? err.message : String(err)` pattern.
 */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// -- Linked artifact YAML parsing (shared by commission and meeting helpers) --

/**
 * Parses a linked_artifacts YAML list from raw frontmatter content.
 * Pure function: no I/O, operates on the raw file string.
 */
export function parseLinkedArtifacts(raw: string): string[] {
  if (/^linked_artifacts: \[\]$/m.test(raw)) {
    return [];
  }

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
 * Inserts a linked artifact into raw frontmatter content. Returns the
 * updated content and whether the artifact was actually added (false if
 * already present or no linked_artifacts field exists).
 * Pure function: no I/O, operates on the raw file string.
 */
export function insertLinkedArtifact(
  raw: string,
  artifactRelPath: string,
): { updated: string; added: boolean } {
  const existing = parseLinkedArtifacts(raw);
  if (existing.includes(artifactRelPath)) {
    return { updated: raw, added: false };
  }

  // Case 1: empty array form `linked_artifacts: []`
  if (/^linked_artifacts: \[\]$/m.test(raw)) {
    const updated = raw.replace(
      /^linked_artifacts: \[\]$/m,
      `linked_artifacts:\n  - ${artifactRelPath}`,
    );
    return { updated, added: true };
  }

  // Case 2: existing list entries
  const linkedIndex = raw.indexOf("linked_artifacts:\n");
  if (linkedIndex === -1) {
    return { updated: raw, added: false };
  }

  const afterLinked = raw.slice(linkedIndex + "linked_artifacts:\n".length);
  const nextFieldMatch = afterLinked.match(/^[a-z_]/m);
  const insertionPoint = nextFieldMatch
    ? linkedIndex + "linked_artifacts:\n".length + (nextFieldMatch.index ?? 0)
    : raw.length;

  const updated =
    raw.slice(0, insertionPoint) +
    `  - ${artifactRelPath}\n` +
    raw.slice(insertionPoint);
  return { updated, added: true };
}

/**
 * Resolves the write target path for a toolbox.
 *
 * Active commissions/meetings have their own activity worktree where
 * artifact writes should land. If the worktree directory exists, we
 * use it. Otherwise we fall back to the integration worktree on the
 * `claude` branch.
 */
export async function resolveWritePath(
  guildHallHome: string,
  projectName: string,
  contextId: string,
  contextType: "meeting" | "commission",
): Promise<string> {
  const worktreePath = contextType === "commission"
    ? commissionWorktreePath(guildHallHome, projectName, contextId)
    : meetingWorktreePath(guildHallHome, projectName, contextId);

  try {
    await fs.access(worktreePath);
    return worktreePath;
  } catch {
    return integrationWorktreePath(guildHallHome, projectName);
  }
}
