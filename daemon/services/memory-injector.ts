/**
 * Memory injection for worker activation.
 *
 * Reads a single markdown file per scope (global, project, worker) and
 * assembles them into a markdown block for injection into a worker's
 * system prompt. Budget enforcement drops sections (last in file first)
 * from the lowest-priority scope (worker, then project, then global).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { isNodeError } from "@/lib/types";
import { parseMemorySections, type MemorySection } from "@/daemon/services/memory-sections";

// -- Constants --

const DEFAULT_MEMORY_LIMIT = 16000;

export const MEMORY_GUIDANCE = [
  "You have a persistent memory system. Use the `edit_memory` tool to save information worth preserving across sessions.",
  "",
  "Scopes:",
  "- **global**: shared across all workers and projects",
  "- **project**: shared across all workers in the active project",
  "- **worker**: private to you, no other worker can access",
  "",
  "Memory is organized by sections within each scope file. Use `## Section Name` headers to organize.",
  "Suggested sections: **User**, **Feedback**, **Project**, **Reference**. You can create any section name.",
  "",
  "Operations:",
  "- `edit_memory` with `operation: \"upsert\"` to create or replace a section",
  "- `edit_memory` with `operation: \"append\"` to add to an existing section",
  "- `edit_memory` with `operation: \"delete\"` to remove a section",
  "- `read_memory` to view current memory (full file or specific section)",
  "",
  "You must call `read_memory` for a scope before editing it.",
  "",
  "What to save: stable patterns, key decisions, solutions to problems you solved, conventions you discovered, user preferences.",
  "What to skip: session-specific context, speculative conclusions, anything already in CLAUDE.md.",
  "",
  "If you see a budget warning after editing, consider condensing older entries.",
  "`write_memory` still works but is deprecated. Use `edit_memory` instead.",
].join("\n");

// -- Types --

export interface MemoryInjectorDeps {
  guildHallHome: string;
  /** Override the character limit. Defaults to DEFAULT_MEMORY_LIMIT (16000). */
  memoryLimit?: number;
}

export interface MemoryResult {
  memoryBlock: string;
}

// -- Scope directory resolution (used by migration) --

export type MemoryScope = "global" | "project" | "worker";

/**
 * Returns the filesystem path for a legacy memory scope directory.
 * Used by migration to find old-format directories.
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

/**
 * Returns the single-file path for a memory scope (REQ-MEM-1).
 * - Global: ~/.guild-hall/memory/global.md
 * - Project: ~/.guild-hall/memory/projects/{projectName}.md
 * - Worker: ~/.guild-hall/memory/workers/{workerName}.md
 */
export function memoryScopeFile(
  guildHallHome: string,
  scope: MemoryScope,
  scopeKey: string,
): string {
  const memoryRoot = path.join(guildHallHome, "memory");
  switch (scope) {
    case "global":
      return path.join(memoryRoot, "global.md");
    case "project":
      return path.join(memoryRoot, "projects", `${scopeKey}.md`);
    case "worker":
      return path.join(memoryRoot, "workers", `${scopeKey}.md`);
  }
}

// -- Migration (REQ-MEM-23-25) --

/**
 * Auto-migrates a legacy directory-based scope to a single file on first read.
 * - If scopeFile already exists, does nothing (REQ-MEM-24).
 * - If legacyDir doesn't exist or is empty, does nothing.
 * - Otherwise: reads all files, builds sections, writes scopeFile, renames
 *   legacyDir to {dir}.migrated (REQ-MEM-23).
 */
export async function migrateIfNeeded(
  scopeFile: string,
  legacyDir: string,
  deps?: { log?: (msg: string) => void },
): Promise<void> {
  // If single file already exists, skip (REQ-MEM-24)
  try {
    await fs.access(scopeFile);
    return;
  } catch {
    // File doesn't exist, continue checking legacy dir
  }

  // Check if legacy directory exists and has files
  let entries: Array<{ name: string; isFile: () => boolean }>;
  try {
    entries = await fs.readdir(legacyDir, { withFileTypes: true });
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") return;
    throw err;
  }

  const files = entries.filter((e) => e.isFile()).map((e) => String(e.name));
  if (files.length === 0) return;

  // Read all files
  const fileContents = new Map<string, string>();
  for (const filename of files) {
    const content = await fs.readFile(path.join(legacyDir, filename), "utf-8");
    fileContents.set(filename, content);
  }

  // Build the single file content (REQ-MEM-23):
  // - _compacted.md content becomes preamble (no ## header)
  // - MEMORY.md is skipped entirely (REQ-MEM-4)
  // - Each remaining file becomes ## {filename} section, alphabetical order
  const parts: string[] = [];

  const compacted = fileContents.get("_compacted.md");
  if (compacted !== undefined) {
    parts.push(compacted);
  }

  const sortedFiles = files
    .filter((f) => f !== "_compacted.md" && f !== "MEMORY.md")
    .sort();

  for (const filename of sortedFiles) {
    const content = fileContents.get(filename)!;
    parts.push(`## ${filename}\n\n${content}`);
  }

  if (parts.length === 0) return;

  const combined = parts.join("\n\n");

  // Atomic write to scope file (unique tmp path to handle concurrent migration)
  await fs.mkdir(path.dirname(scopeFile), { recursive: true });
  const tmpPath = `${scopeFile}.migrate-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await fs.writeFile(tmpPath, combined, "utf-8");
  try {
    await fs.rename(tmpPath, scopeFile);
  } catch {
    // Another caller may have written the file. Clean up our temp file.
    try { await fs.unlink(tmpPath); } catch { /* ignore */ }
  }

  // Rename legacy directory. Ignore ENOENT if another caller already renamed it.
  try {
    await fs.rename(legacyDir, `${legacyDir}.migrated`);
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") return;
    throw err;
  }

  deps?.log?.(`Migrated legacy memory directory ${legacyDir} to ${scopeFile}`);
}

// -- Internal helpers --

/**
 * Reads a single memory file. Returns empty string if the file doesn't exist.
 */
async function readScopeFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") return "";
    throw err;
  }
}

/**
 * Formats a scope's content under a ### heading.
 * Returns empty string if content is empty.
 */
function formatScope(heading: string, content: string): string {
  if (content === "") return "";
  return `### ${heading}\n\n${content}`;
}

/**
 * Drops sections from the end of content until the total fits within budget.
 * Returns the trimmed content and a flag indicating whether anything was dropped.
 * Sections are identified by `## ` headers. Dropping removes entire sections,
 * never truncates mid-section (REQ-MEM-18).
 */
function trimSections(content: string, budget: number): { trimmed: string; dropped: boolean } {
  if (content.length <= budget) return { trimmed: content, dropped: false };

  const sections = parseMemorySections(content);
  if (sections.length === 0) return { trimmed: "", dropped: false };

  // Drop sections from the end until we fit
  while (sections.length > 0) {
    const candidate = rebuildContent(sections);
    if (candidate.length <= budget) {
      return { trimmed: candidate, dropped: true };
    }
    sections.pop();
  }

  return { trimmed: "", dropped: true };
}

/** Rebuild raw content from sections (without scope heading). */
function rebuildContent(sections: MemorySection[]): string {
  const parts: string[] = [];
  for (const s of sections) {
    if (s.name !== "") {
      parts.push(s.content === "" ? `## ${s.name}` : `## ${s.name}\n${s.content}`);
    } else {
      parts.push(s.content);
    }
  }
  return parts.join("\n");
}

// -- Public API --

/**
 * Loads memory from single files (one per scope) and assembles them into
 * a markdown block suitable for system prompt injection (REQ-MEM-16).
 *
 * Budget enforcement (REQ-MEM-18): if combined content exceeds the limit,
 * sections are dropped from worker scope first (last in file first), then
 * project, then global. MEMORY_GUIDANCE is always included and not counted.
 */
export async function loadMemories(
  workerName: string,
  projectName: string,
  deps: MemoryInjectorDeps,
): Promise<MemoryResult> {
  const limit = deps.memoryLimit ?? DEFAULT_MEMORY_LIMIT;

  // Run migration for each scope if needed (REQ-MEM-23)
  await Promise.all([
    migrateIfNeeded(
      memoryScopeFile(deps.guildHallHome, "global", "global"),
      memoryScopeDir(deps.guildHallHome, "global", "global"),
    ),
    migrateIfNeeded(
      memoryScopeFile(deps.guildHallHome, "project", projectName),
      memoryScopeDir(deps.guildHallHome, "project", projectName),
    ),
    migrateIfNeeded(
      memoryScopeFile(deps.guildHallHome, "worker", workerName),
      memoryScopeDir(deps.guildHallHome, "worker", workerName),
    ),
  ]);

  // Read all three scope files in parallel (REQ-MEM-16)
  const [globalContent, projectContent, workerContent] = await Promise.all([
    readScopeFile(memoryScopeFile(deps.guildHallHome, "global", "global")),
    readScopeFile(memoryScopeFile(deps.guildHallHome, "project", projectName)),
    readScopeFile(memoryScopeFile(deps.guildHallHome, "worker", workerName)),
  ]);

  const hasContent = globalContent !== "" || projectContent !== "" || workerContent !== "";

  if (!hasContent) {
    return {
      memoryBlock: `## Memories\n\nNo memories saved yet.`,
    };
  }

  // Budget enforcement: drop sections from lowest-priority scope first
  // (worker, then project, then global). Within a scope, drop last sections first.
  const headerOverhead = "## Memories\n\n".length;
  const remainingBudget = limit - headerOverhead;

  // Scope formatting overhead per scope (### heading + newlines)
  const scopeOverhead = (heading: string) => `### ${heading}\n\n`.length;

  // Process scopes in priority order (global highest, worker lowest).
  // First pass: calculate total to see if trimming is needed.
  const scopes: Array<{ heading: string; content: string }> = [];
  if (globalContent !== "") {
    scopes.push({ heading: "Global", content: globalContent });
  }
  if (projectContent !== "") {
    scopes.push({ heading: `Project: ${projectName}`, content: projectContent });
  }
  if (workerContent !== "") {
    scopes.push({ heading: `Worker: ${workerName}`, content: workerContent });
  }

  const totalContent = scopes.reduce(
    (acc, s) => acc + scopeOverhead(s.heading) + s.content.length,
    0,
  );

  let formattedScopes: string[];

  if (totalContent <= remainingBudget) {
    // Everything fits
    formattedScopes = scopes
      .map((s) => formatScope(s.heading, s.content))
      .filter((s) => s !== "");
  } else {
    // Need to trim. Drop from worker first, then project, then global.
    // Reverse priority order for trimming.
    const trimOrder = [...scopes].reverse();
    let excess = totalContent - remainingBudget;

    for (const scope of trimOrder) {
      if (excess <= 0) break;

      const result = trimSections(scope.content, scope.content.length - excess);
      scope.content = result.trimmed;
      if (result.dropped) {
        excess = scopes.reduce(
          (acc, s) => acc + (s.content !== "" ? scopeOverhead(s.heading) + s.content.length : 0),
          0,
        ) - remainingBudget;
      }
    }

    formattedScopes = scopes
      .filter((s) => s.content !== "")
      .map((s) => formatScope(s.heading, s.content))
      .filter((s) => s !== "");
  }

  if (formattedScopes.length === 0) {
    return {
      memoryBlock: `## Memories\n\nNo memories fit within budget.`,
    };
  }

  const memoryBlock = `## Memories\n\n${formattedScopes.join("\n\n")}`;

  return { memoryBlock };
}
