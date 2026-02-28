/**
 * Shared utilities used across toolbox implementations.
 *
 * Extracted from base-toolbox.ts, meeting-toolbox.ts, manager-toolbox.ts,
 * and commission-artifact-helpers.ts where identical copies existed.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  integrationWorktreePath,
  commissionWorktreePath,
  meetingWorktreePath,
} from "@/lib/paths";

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
