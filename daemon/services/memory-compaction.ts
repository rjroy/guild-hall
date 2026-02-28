/**
 * Fire-and-forget memory compaction.
 *
 * Triggered when loadMemories() detects that memory files exceed the
 * configured limit (needsCompaction: true). Reads all memory files from
 * the three scope directories, asks an SDK session to summarize them into
 * a condensed form, writes the summary as _compacted.md in each scope
 * directory, then removes the original files (snapshot-only, files written
 * during compaction are left alone).
 *
 * Designed for fire-and-forget use: the caller does not await the result.
 * If compaction fails, files are left as-is and the next activation will
 * retry implicitly (the truncated-memory path still works).
 *
 * Concurrency: only one compaction runs per worker+project pair at a time.
 * A second request for the same pair while the first is running is skipped.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { isNodeError } from "@/lib/types";
import { memoryScopeDir, type MemoryScope } from "@/daemon/services/memory-injector";
import type { QueryOptions } from "@/daemon/services/meeting-session";
import { collectSdkText } from "@/daemon/lib/sdk-text";
import { errorMessage } from "@/daemon/lib/toolbox-utils";

// -- Constants --

const COMPACTED_FILENAME = "_compacted.md";

// -- Types --

export type CompactQueryFn = (params: {
  prompt: string;
  options: QueryOptions;
}) => AsyncGenerator<SDKMessage>;

export interface CompactionDeps {
  guildHallHome: string;
  /** DI seam: tests inject a mock, production passes the real SDK query(). */
  compactFn: CompactQueryFn;
}

interface ScopeSnapshot {
  scope: MemoryScope;
  scopeKey: string;
  dirPath: string;
  /** Filenames captured at the start of compaction (excludes _compacted.md). */
  filenames: string[];
  /** Full text content of all files, concatenated for the prompt. */
  content: string;
  /** Content of existing _compacted.md, if any. Null when no prior compaction exists. */
  priorSummary: string | null;
}

// -- Concurrent guard --

/**
 * Tracks in-progress compaction by worker+project key. The value is a
 * promise that resolves when the compaction finishes (used in tests to
 * await completion). Production callers do not await it.
 */
const compactionInProgress = new Map<string, Promise<void>>();

function compactionKey(workerName: string, projectName: string): string {
  return `${workerName}::${projectName}`;
}

// -- Internal helpers --

/**
 * Snapshots a single scope directory: reads all regular files (excluding
 * _compacted.md and subdirectories), records their names, and concatenates
 * their content. Returns null if the directory doesn't exist or is empty.
 */
async function snapshotScope(
  guildHallHome: string,
  scope: MemoryScope,
  scopeKey: string,
): Promise<ScopeSnapshot | null> {
  const dirPath = memoryScopeDir(guildHallHome, scope, scopeKey);

  let entries: string[];
  try {
    const dirEntries = await fs.readdir(dirPath, { withFileTypes: true });
    entries = dirEntries
      .filter((e) => e.isFile() && e.name !== COMPACTED_FILENAME)
      .map((e) => String(e.name));
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") return null;
    throw err;
  }

  if (entries.length === 0) return null;

  const parts: string[] = [];
  for (const filename of entries) {
    try {
      const content = await fs.readFile(path.join(dirPath, filename), "utf-8");
      parts.push(`### ${filename}\n${content}`);
    } catch (err: unknown) {
      // Skip unreadable files (deleted between readdir and readFile)
      if (isNodeError(err) && err.code === "ENOENT") continue;
      throw err;
    }
  }

  if (parts.length === 0) return null;

  // Read prior compacted summary if it exists (not included in the snapshot
  // filenames, so it won't be deleted, but its content feeds the next prompt).
  let priorSummary: string | null = null;
  try {
    priorSummary = await fs.readFile(
      path.join(dirPath, COMPACTED_FILENAME),
      "utf-8",
    );
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") {
      // No prior compaction exists, that's fine
    } else {
      throw err;
    }
  }

  return {
    scope,
    scopeKey,
    dirPath,
    filenames: entries,
    content: parts.join("\n\n"),
    priorSummary,
  };
}

/**
 * Assembles the SDK prompt from all scope snapshots. The prompt instructs
 * the model to produce a condensed summary preserving key information.
 * When prior compacted summaries exist, they're included so the new
 * summary incorporates previously-compacted knowledge.
 */
function buildCompactionPrompt(snapshots: ScopeSnapshot[]): string {
  // Collect prior compacted summaries from any scope that has one
  const priorSummaries = snapshots
    .filter((s) => s.priorSummary)
    .map((s) => {
      const label =
        s.scope === "global"
          ? "Global"
          : s.scope === "project"
            ? `Project: ${s.scopeKey}`
            : `Worker: ${s.scopeKey}`;
      return `## ${label}\n${s.priorSummary}`;
    });

  const priorSection =
    priorSummaries.length > 0
      ? `# Previous compacted summary\nThe following is the summary from the last compaction cycle. Incorporate this knowledge into the new summary, updating or removing entries that are superseded by newer memory entries.\n\n${priorSummaries.join("\n\n")}\n\n`
      : "";

  const sections = snapshots.map((s) => {
    const label =
      s.scope === "global"
        ? "Global"
        : s.scope === "project"
          ? `Project: ${s.scopeKey}`
          : `Worker: ${s.scopeKey}`;
    return `## ${label}\n${s.content}`;
  });

  return `You are compacting memory files for an AI worker. The following memory entries were accumulated over multiple sessions. Summarize them into a single condensed document that preserves all important information: preferences, decisions, conventions, patterns, and lessons learned.

Remove redundancy and outdated entries. Preserve specific details (names, paths, config values) that would be needed in future sessions. Use markdown formatting. Be thorough but concise.

${priorSection}# New memory entries\n${sections.join("\n\n")}

Produce a single condensed summary of ALL the above memory entries.`;
}

/**
 * Writes _compacted.md to each scope directory and removes only the
 * files that were in the original snapshot. Files written after the
 * snapshot was taken are left untouched.
 */
async function writeAndCleanup(
  snapshots: ScopeSnapshot[],
  summary: string,
): Promise<void> {
  for (const snapshot of snapshots) {
    // Write _compacted.md
    const compactedPath = path.join(snapshot.dirPath, COMPACTED_FILENAME);
    await fs.writeFile(compactedPath, summary, "utf-8");

    // Remove only snapshot files (not _compacted.md, not newer files)
    for (const filename of snapshot.filenames) {
      const filePath = path.join(snapshot.dirPath, filename);
      try {
        await fs.unlink(filePath);
      } catch (err: unknown) {
        // File may have already been removed or renamed; skip
        if (isNodeError(err) && err.code === "ENOENT") continue;
        throw err;
      }
    }
  }
}

// -- Public API --

/**
 * Triggers memory compaction for a worker+project pair. Fire-and-forget:
 * the returned promise resolves when compaction finishes, but callers
 * typically do not await it. If compaction is already running for this
 * pair, the call is a no-op.
 *
 * Returns the promise so tests can await it for deterministic assertions.
 */
export function triggerCompaction(
  workerName: string,
  projectName: string,
  deps: CompactionDeps,
): Promise<void> {
  const key = compactionKey(workerName, projectName);

  // Concurrent guard: skip if compaction is already running for this pair
  if (compactionInProgress.has(key)) {
    return Promise.resolve();
  }

  const promise = runCompaction(workerName, projectName, deps).finally(() => {
    compactionInProgress.delete(key);
  });

  compactionInProgress.set(key, promise);
  return promise;
}

/**
 * Returns whether compaction is currently in progress for a given pair.
 * Exposed for testing the concurrent guard behavior.
 */
export function isCompactionRunning(
  workerName: string,
  projectName: string,
): boolean {
  return compactionInProgress.has(compactionKey(workerName, projectName));
}

/**
 * The actual compaction logic. Separated from triggerCompaction so the
 * concurrent guard and finally cleanup are cleanly isolated.
 */
async function runCompaction(
  workerName: string,
  projectName: string,
  deps: CompactionDeps,
): Promise<void> {
  // 1. Snapshot all three scopes
  const snapshots: ScopeSnapshot[] = [];

  const scopes: Array<{ scope: MemoryScope; key: string }> = [
    { scope: "global", key: "global" },
    { scope: "project", key: projectName },
    { scope: "worker", key: workerName },
  ];

  for (const { scope, key } of scopes) {
    const snapshot = await snapshotScope(deps.guildHallHome, scope, key);
    if (snapshot) {
      snapshots.push(snapshot);
    }
  }

  if (snapshots.length === 0) {
    // Nothing to compact (all dirs empty or nonexistent)
    return;
  }

  // 2. Build prompt and invoke SDK
  const prompt = buildCompactionPrompt(snapshots);

  let summary: string;
  try {
    const generator = deps.compactFn({
      prompt,
      options: {
        systemPrompt:
          "You are a memory compaction system. Condense the provided memory entries into a single summary preserving all important information.",
        maxTurns: 1,
        model: "sonnet",
        permissionMode: "dontAsk",
        settingSources: [],
        mcpServers: {},
        allowedTools: [],
      },
    });

    summary = await collectSdkText(generator);
  } catch (err: unknown) {
    // Compaction failure is non-fatal. Leave files as-is; next activation
    // retries implicitly via the truncated-memory path.
    console.warn(
      `[memory-compaction] SDK call failed for ${workerName}/${projectName}:`,
      errorMessage(err),
    );
    return;
  }

  if (!summary) {
    console.warn(
      `[memory-compaction] SDK returned empty summary for ${workerName}/${projectName}, skipping compaction`,
    );
    return;
  }

  // 3. Write _compacted.md and clean up snapshot files
  try {
    await writeAndCleanup(snapshots, summary);
  } catch (err: unknown) {
    console.warn(
      `[memory-compaction] Write/cleanup failed for ${workerName}/${projectName}:`,
      errorMessage(err),
    );
    return;
  }

  console.log(
    `[memory-compaction] Compacted ${snapshots.reduce((n, s) => n + s.filenames.length, 0)} file(s) for ${workerName}/${projectName}`,
  );
}
