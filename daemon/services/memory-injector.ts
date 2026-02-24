/**
 * Memory injection for worker activation.
 *
 * Reads memory files from three scopes (global, project, worker), sorts by
 * mtime (most recent first), and assembles them into a markdown block for
 * injection into a worker's system prompt. Applies a soft cap: files are
 * included whole or not at all, never truncated mid-content.
 *
 * When the total exceeds the configured limit, older files are dropped and
 * needsCompaction is flagged so a future compaction pass can consolidate.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { isNodeError } from "@/lib/types";

// -- Constants --

const DEFAULT_MEMORY_LIMIT = 8000;

// -- Types --

export interface MemoryInjectorDeps {
  guildHallHome: string;
  /** Override the character limit. Defaults to DEFAULT_MEMORY_LIMIT (8000). */
  memoryLimit?: number;
}

export interface MemoryResult {
  memoryBlock: string;
  needsCompaction: boolean;
}

interface MemoryEntry {
  filename: string;
  content: string;
  mtime: Date;
}

// -- Internal helpers --

/**
 * Reads all files from a directory, returning their content and mtime.
 * Returns an empty array if the directory doesn't exist or is empty.
 * Only reads regular files (skips subdirectories).
 */
async function readMemoryDir(dirPath: string): Promise<MemoryEntry[]> {
  let filenames: string[];
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    // Filter to regular files only (skip subdirectories)
    filenames = entries.filter((e) => e.isFile()).map((e) => String(e.name));
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") return [];
    throw err;
  }

  const results: MemoryEntry[] = [];
  for (const filename of filenames) {
    const filePath = path.join(dirPath, filename);
    try {
      const [content, stat] = await Promise.all([
        fs.readFile(filePath, "utf-8"),
        fs.stat(filePath),
      ]);
      results.push({ filename, content, mtime: stat.mtime });
    } catch (err: unknown) {
      // Skip unreadable files
      if (isNodeError(err) && err.code === "ENOENT") continue;
      throw err;
    }
  }

  return results;
}

/**
 * Sorts entries by mtime descending (most recent first), then applies the
 * soft cap: includes files whole until adding the next would exceed the
 * limit. Returns the included entries and whether any were dropped.
 */
function applyBudget(
  entries: MemoryEntry[],
  budget: number,
): { included: MemoryEntry[]; dropped: boolean } {
  // Sort most recent first
  const sorted = [...entries].sort(
    (a, b) => b.mtime.getTime() - a.mtime.getTime(),
  );

  const included: MemoryEntry[] = [];
  let used = 0;

  for (const entry of sorted) {
    if (used + entry.content.length <= budget) {
      included.push(entry);
      used += entry.content.length;
    }
    // Soft cap: skip this file entirely (don't break, later smaller files
    // could still fit). But for simplicity and predictability of the "most
    // recent first" priority, we stop including once a file doesn't fit.
    // This matches the spec: "truncate older entries to fit."
    else {
      break;
    }
  }

  return {
    included,
    dropped: included.length < sorted.length,
  };
}

/**
 * Formats a scope's memory entries into a markdown section.
 * Returns empty string if no entries are included.
 */
function formatScope(
  heading: string,
  entries: MemoryEntry[],
): string {
  if (entries.length === 0) return "";

  const lines = [`### ${heading}\n`];
  for (const entry of entries) {
    lines.push(`**${entry.filename}**`);
    lines.push(entry.content);
    lines.push("");
  }
  return lines.join("\n");
}

// -- Scope directory resolution (shared with memory-compaction) --

export type MemoryScope = "global" | "project" | "worker";

/**
 * Returns the filesystem path for a memory scope directory.
 * Exported for use by memory-compaction.ts, which needs to read/write
 * the same directories that loadMemories reads from.
 */
export function memoryScopeDir(
  guildHallHome: string,
  scope: MemoryScope,
  scopeKey: string,
): string {
  const memoryRoot = path.join(guildHallHome, "memory");
  switch (scope) {
    case "global":
      return path.join(memoryRoot, "global");
    case "project":
      return path.join(memoryRoot, "projects", scopeKey);
    case "worker":
      return path.join(memoryRoot, "workers", scopeKey);
  }
}

// -- Public API --

/**
 * Loads memory files from global, project, and worker scopes and assembles
 * them into a markdown block suitable for system prompt injection.
 *
 * Files are sorted by mtime (most recent first) within each scope. The
 * total character count is checked against the limit (default 8000,
 * configurable via deps.memoryLimit). If the total exceeds the limit,
 * older files are dropped (soft cap: never cut a file mid-content) and
 * needsCompaction is set to true.
 *
 * @param workerName - The worker's identity name (for worker-scope memory)
 * @param projectName - The project name (for project-scope memory)
 * @param deps - Injected dependencies (guildHallHome, optional memoryLimit)
 */
export async function loadMemories(
  workerName: string,
  projectName: string,
  deps: MemoryInjectorDeps,
): Promise<MemoryResult> {
  const memoryRoot = path.join(deps.guildHallHome, "memory");
  const limit = deps.memoryLimit ?? DEFAULT_MEMORY_LIMIT;

  // Read all three scopes in parallel
  const [globalEntries, projectEntries, workerEntries] = await Promise.all([
    readMemoryDir(path.join(memoryRoot, "global")),
    readMemoryDir(path.join(memoryRoot, "projects", projectName)),
    readMemoryDir(path.join(memoryRoot, "workers", workerName)),
  ]);

  // If all scopes are empty, return empty block
  if (
    globalEntries.length === 0 &&
    projectEntries.length === 0 &&
    workerEntries.length === 0
  ) {
    return { memoryBlock: "", needsCompaction: false };
  }

  // Calculate overhead for the markdown structure (headers, etc.)
  // We account for the "## Memories" heading and scope headings in the
  // budget to ensure the total output stays under the limit.
  const headerOverhead = "## Memories\n".length;
  let remainingBudget = limit - headerOverhead;

  // Apply budget to each scope (most recent first within scope)
  // Process scopes in order: global, project, worker. Each scope gets
  // whatever budget remains after the previous scope consumed its share.
  let anyDropped = false;

  const globalResult = applyBudget(globalEntries, remainingBudget);
  const globalSection = formatScope("Global", globalResult.included);
  remainingBudget -= globalSection.length;
  anyDropped = anyDropped || globalResult.dropped;

  const projectResult = applyBudget(projectEntries, remainingBudget);
  const projectSection = formatScope(`Project: ${projectName}`, projectResult.included);
  remainingBudget -= projectSection.length;
  anyDropped = anyDropped || projectResult.dropped;

  const workerResult = applyBudget(workerEntries, remainingBudget);
  const workerSection = formatScope(`Worker: ${workerName}`, workerResult.included);
  anyDropped = anyDropped || workerResult.dropped;

  // Assemble the final markdown block
  const sections = [globalSection, projectSection, workerSection].filter(
    (s) => s.length > 0,
  );

  if (sections.length === 0) {
    // All entries were too large to fit even one. Flag compaction.
    return { memoryBlock: "", needsCompaction: true };
  }

  const memoryBlock = `## Memories\n${sections.join("\n")}`;

  return {
    memoryBlock,
    needsCompaction: anyDropped,
  };
}
