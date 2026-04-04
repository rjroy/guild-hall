/**
 * Heartbeat file operations: reading, writing, and scaffolding the
 * per-project `.lore/heartbeat.md` file.
 *
 * The heartbeat file is the user-facing interface for standing orders.
 * This module owns the template content (instructional header + section
 * headings) and provides helpers for daemon and worker access.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { isNodeError } from "@/lib/types";

// -- Template --

const HEARTBEAT_HEADER = `# Heartbeat

This file controls what the guild does autonomously. Every hour (configurable),
a Guild Master session reads this file and decides which standing orders warrant
action: creating commissions, dispatching work, or starting meetings.

**Standing Orders** are lines starting with \`- \`. Write them in plain language.
If you want the guild to check with you before acting on an order, say so in the
order itself.

**Watch Items** are things to monitor. The guild reads these for context but won't
create commissions from them directly.

**Context Notes** are operational context the guild should know (merge freezes, priorities).

**Recent Activity** is managed by the daemon. Don't edit this section manually.
Workers can also add entries to this file during their sessions.

`;

const SECTION_HEADINGS = [
  "## Standing Orders",
  "## Watch Items",
  "## Context Notes",
  "## Recent Activity",
];

const TEMPLATE_CONTENT = HEARTBEAT_HEADER + SECTION_HEADINGS.join("\n\n") + "\n";

// -- Public API --

/**
 * Ensures a heartbeat.md file exists at the project's .lore/ directory.
 * If the file doesn't exist, creates it with the template content.
 * If it exists, repairs the header (everything before the first ##)
 * while preserving section content.
 */
export async function ensureHeartbeatFile(projectPath: string): Promise<void> {
  const filePath = heartbeatFilePath(projectPath);

  let existing: string | null = null;
  try {
    existing = await fs.readFile(filePath, "utf-8");
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") {
      // File doesn't exist, create it
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, TEMPLATE_CONTENT, "utf-8");
      return;
    }
    throw err;
  }

  // File exists: repair the header
  await repairHeartbeatHeader(projectPath, existing);
}

/**
 * Replaces everything before the first `##` with the template header,
 * preserving all section content.
 */
export async function repairHeartbeatHeader(
  projectPath: string,
  existingContent?: string,
): Promise<void> {
  const filePath = heartbeatFilePath(projectPath);
  const content = existingContent ?? await fs.readFile(filePath, "utf-8");

  const firstSectionIndex = content.indexOf("\n##");
  if (firstSectionIndex === -1) {
    // No sections at all: replace entire content with template
    await fs.writeFile(filePath, TEMPLATE_CONTENT, "utf-8");
    return;
  }

  // Keep everything from the first ## onward, prepend the template header
  const sectionContent = content.slice(firstSectionIndex + 1); // +1 to skip the leading \n
  const repaired = HEARTBEAT_HEADER + sectionContent;
  await fs.writeFile(filePath, repaired, "utf-8");
}

/**
 * Reads the heartbeat file content. Returns null if the file doesn't exist.
 */
export async function readHeartbeatFile(projectPath: string): Promise<string | null> {
  try {
    return await fs.readFile(heartbeatFilePath(projectPath), "utf-8");
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Returns true if the heartbeat file has any user content below the
 * instructional header (i.e., content in any of the sections).
 * Returns false if the file only contains the template or doesn't exist.
 */
export function hasContentBelowHeader(content: string): boolean {
  // Find the first ## heading
  const firstSectionMatch = content.match(/^## .+$/m);
  if (!firstSectionMatch || firstSectionMatch.index === undefined) return false;

  // Get everything after the first ## heading
  const afterFirstHeading = content.slice(firstSectionMatch.index + firstSectionMatch[0].length);

  // Check if there's any non-whitespace content that isn't just more section headings
  const lines = afterFirstHeading.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (trimmed.startsWith("## ")) continue;
    return true;
  }

  return false;
}

/**
 * Clears the ## Recent Activity section, replacing its contents with
 * nothing (just the heading remains).
 */
export async function clearRecentActivity(projectPath: string): Promise<void> {
  const filePath = heartbeatFilePath(projectPath);
  const content = await fs.readFile(filePath, "utf-8");

  const sectionStart = content.indexOf("## Recent Activity");
  if (sectionStart === -1) return;

  const afterHeading = sectionStart + "## Recent Activity".length;
  const cleared = content.slice(0, afterHeading) + "\n";
  await fs.writeFile(filePath, cleared, "utf-8");
}

/**
 * Appends a list item to the specified section in the heartbeat file.
 * If the section doesn't exist, creates it before ## Recent Activity
 * (or at the end of the file if Recent Activity doesn't exist).
 */
export async function appendToSection(
  projectPath: string,
  section: string,
  entry: string,
): Promise<void> {
  const filePath = heartbeatFilePath(projectPath);
  let content = await fs.readFile(filePath, "utf-8");

  const heading = `## ${section}`;
  const headingIndex = content.indexOf(heading);

  if (headingIndex === -1) {
    // Section doesn't exist: insert before ## Recent Activity, or at end
    const recentIndex = content.indexOf("## Recent Activity");
    const insertPoint = recentIndex !== -1 ? recentIndex : content.length;
    const newSection = `${heading}\n${entry}\n\n`;
    content = content.slice(0, insertPoint) + newSection + content.slice(insertPoint);
  } else {
    // Section exists: find the end of the heading line and insert after it
    const afterHeading = headingIndex + heading.length;
    const nextSectionIndex = content.indexOf("\n## ", afterHeading);
    const insertPoint = nextSectionIndex !== -1 ? nextSectionIndex : content.length;

    // Check if there's already content. If the section is empty (just heading + newline),
    // insert right after the heading. Otherwise insert before the next section.
    const sectionContent = content.slice(afterHeading, insertPoint);
    const trimmedSection = sectionContent.trimEnd();

    if (trimmedSection === "") {
      // Empty section: add newline + entry after heading
      content = content.slice(0, afterHeading) + "\n" + entry + content.slice(afterHeading);
    } else {
      // Has content: append entry after the last non-empty line in the section
      content = content.slice(0, insertPoint) + "\n" + entry + content.slice(insertPoint);
    }
  }

  await fs.writeFile(filePath, content, "utf-8");
}

// -- Internal --

function heartbeatFilePath(projectPath: string): string {
  return path.join(projectPath, ".lore", "heartbeat.md");
}
