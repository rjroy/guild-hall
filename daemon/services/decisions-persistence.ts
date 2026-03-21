/**
 * Decisions persistence: reads JSONL decision logs and formats them
 * as markdown sections for appending to activity artifacts.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { isNodeError } from "@/lib/types";

export interface DecisionEntry {
  timestamp: string;
  question: string;
  decision: string;
  reasoning: string;
}

/**
 * Reads decisions from the JSONL file written by `makeRecordDecisionHandler`.
 * Path resolution matches the handler exactly:
 *   `{guildHallHome}/state/{resolvedSubdir}/{contextId}/decisions.jsonl`
 *
 * Returns empty array if the file doesn't exist or is empty.
 * Skips malformed lines (REQ-DSRF-1).
 */
export async function readDecisions(
  guildHallHome: string,
  _contextType: string,
  contextId: string,
  stateSubdir?: string,
): Promise<DecisionEntry[]> {
  const resolvedSubdir = stateSubdir ?? "commissions";
  const decisionsPath = path.join(
    guildHallHome,
    "state",
    resolvedSubdir,
    contextId,
    "decisions.jsonl",
  );

  let raw: string;
  try {
    raw = await fs.readFile(decisionsPath, "utf-8");
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") return [];
    throw err;
  }

  if (!raw.trim()) return [];

  const entries: DecisionEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as DecisionEntry;
      entries.push(parsed);
    } catch {
      // Skip malformed lines
    }
  }

  return entries;
}

/**
 * Formats decision entries as a markdown section (REQ-DSRF-2).
 * Returns empty string for empty array (REQ-DSRF-5).
 */
export function formatDecisionsSection(decisions: DecisionEntry[]): string {
  if (decisions.length === 0) return "";

  const parts = ["## Decisions", ""];

  for (const entry of decisions) {
    parts.push(`**${entry.question}**`);
    parts.push(entry.decision);
    parts.push(`*Reasoning: ${entry.reasoning}*`);
    parts.push("");
  }

  return parts.join("\n");
}

/**
 * Appends a decisions section to an artifact file.
 * Reads the raw file and appends the section at the end,
 * preserving all existing content byte-for-byte (REQ-DSRF-8).
 */
export async function appendDecisionsToArtifact(
  artifactPath: string,
  decisionsSection: string,
): Promise<void> {
  const existing = await fs.readFile(artifactPath, "utf-8");
  const updated = existing + "\n" + decisionsSection;
  await fs.writeFile(artifactPath, updated, "utf-8");
}
