/**
 * Output handling utilities for the Replicate toolbox.
 *
 * Manages output directory resolution, filename generation, extension
 * detection, and input file validation (REQ-RPL-17 through REQ-RPL-22).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { resolveWritePath, formatTimestamp } from "@/daemon/lib/toolbox-utils";
import { integrationWorktreePath } from "@/lib/paths";

export interface OutputDeps {
  guildHallHome: string;
  projectName: string;
  contextId: string;
  contextType: string;
}

/**
 * Builds the .lore/generated/ path for the current context (REQ-RPL-17).
 * Uses resolveWritePath for commissions/meetings (activity worktree with
 * integration worktree fallback). For mail/briefing contexts, falls back
 * directly to integration worktree.
 */
export async function resolveOutputDir(deps: OutputDeps): Promise<string> {
  let basePath: string;

  if (deps.contextType === "commission" || deps.contextType === "meeting") {
    basePath = await resolveWritePath(
      deps.guildHallHome,
      deps.projectName,
      deps.contextId,
      deps.contextType,
    );
  } else {
    basePath = integrationWorktreePath(deps.guildHallHome, deps.projectName);
  }

  const outputDir = path.join(basePath, ".lore", "generated");
  await fs.mkdir(outputDir, { recursive: true });
  return outputDir;
}

/**
 * Produces the output filename (REQ-RPL-18).
 * If userFilename is provided, returns it unchanged.
 * Otherwise generates {tool}-{timestamp}-{hash}.{ext}.
 */
export function generateFilename(
  toolName: string,
  predictionId: string,
  ext: string,
  userFilename?: string,
): string {
  if (userFilename) return userFilename;

  const timestamp = formatTimestamp(new Date());
  const hash = predictionId.slice(0, 6);
  return `${toolName}-${timestamp}-${hash}.${ext}`;
}

/**
 * Extracts the file extension from a Replicate output URL (REQ-RPL-20).
 * Falls back to "png" if detection fails.
 */
export function detectExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).slice(1).toLowerCase();
    if (ext && ["png", "jpg", "jpeg", "webp", "mp4", "gif"].includes(ext)) {
      return ext;
    }
  } catch {
    // URL parsing failed, try a simpler approach
    const match = url.match(/\.(\w{2,4})(?:\?|$)/);
    if (match) {
      const ext = match[1].toLowerCase();
      if (["png", "jpg", "jpeg", "webp", "mp4", "gif"].includes(ext)) {
        return ext;
      }
    }
  }
  return "png";
}

/**
 * Validates that a local file exists and is readable (REQ-RPL-22).
 * Throws a descriptive error on failure.
 */
export async function validateInputFile(filePath: string): Promise<void> {
  try {
    await fs.access(filePath, fs.constants.R_OK);
  } catch {
    throw new Error(
      `Input file not found or not readable: "${filePath}". Provide a valid local file path.`,
    );
  }
}
