import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  triggerCompaction,
  isCompactionRunning,
  type CompactQueryFn,
  type CompactionDeps,
} from "@/daemon/services/memory-compaction";
import { memoryScopeDir } from "@/daemon/services/memory-injector";

let tmpDir: string;
let guildHallHome: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-memory-compact-"));
  guildHallHome = path.join(tmpDir, ".guild-hall");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// -- Helpers --

const COMPACTED_FILENAME = "_compacted.md";

async function writeMemoryFile(
  scope: "global" | "project" | "worker",
  filename: string,
  content: string,
  opts?: { projectName?: string; workerName?: string },
): Promise<void> {
  const projectName = opts?.projectName ?? "test-project";
  const workerName = opts?.workerName ?? "test-worker";

  const scopeKey =
    scope === "global" ? "global" : scope === "project" ? projectName : workerName;
  const dirPath = memoryScopeDir(guildHallHome, scope, scopeKey);

  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(path.join(dirPath, filename), content, "utf-8");
}

async function readFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Builds a mock assistant message yielded by an async generator. */
function makeAssistantMsg(text: string): never {
  return {
    type: "assistant",
    message: { content: [{ type: "text", text }] },
  } as never;
}

/**
 * Creates a mock compactFn that yields a single assistant message
 * with the given summary text.
 */
function createMockCompactFn(summaryText: string): CompactQueryFn {
  return async function* () {
    await Promise.resolve();
    yield makeAssistantMsg(summaryText);
  };
}

/**
 * Creates a mock compactFn that captures the prompt it receives,
 * then yields a summary.
 */
function createCapturingCompactFn(
  summaryText: string,
): { fn: CompactQueryFn; captured: { prompt: string; options: Record<string, unknown> }[] } {
  const captured: { prompt: string; options: Record<string, unknown> }[] = [];
  const fn: CompactQueryFn = async function* (params) {
    await Promise.resolve();
    captured.push({
      prompt: params.prompt,
      options: params.options as Record<string, unknown>,
    });
    yield makeAssistantMsg(summaryText);
  };
  return { fn, captured };
}

/**
 * Creates a mock compactFn that rejects with an error.
 */
function createFailingCompactFn(errorMessage: string): CompactQueryFn {
  // eslint-disable-next-line @typescript-eslint/require-await
  return async function* () {
    throw new Error(errorMessage);
  };
}

/**
 * Creates a mock compactFn that hangs until a resolve function is called.
 * Used for testing the concurrent guard.
 */
function createBlockingCompactFn(
  summaryText: string,
): { fn: CompactQueryFn; resolve: () => void } {
  let resolveBlock: (() => void) | undefined;
  const blockPromise = new Promise<void>((r) => {
    resolveBlock = r;
  });

  const fn: CompactQueryFn = async function* () {
    await blockPromise;
    yield makeAssistantMsg(summaryText);
  };

  return { fn, resolve: resolveBlock! };
}

function makeDeps(compactFn: CompactQueryFn): CompactionDeps {
  return { guildHallHome, compactFn };
}

// -- Basic compaction --

describe("triggerCompaction: basic flow", () => {
  test("compacts memory files into _compacted.md and removes originals", async () => {
    await writeMemoryFile("global", "pref.md", "Use dark mode");
    await writeMemoryFile("project", "conv.md", "Use camelCase");
    await writeMemoryFile("worker", "notes.md", "Worker-specific note");

    const compactFn = createMockCompactFn("Condensed summary of all memories");

    await triggerCompaction("test-worker", "test-project", makeDeps(compactFn));

    // _compacted.md should exist in all three scope dirs
    const globalDir = memoryScopeDir(guildHallHome, "global", "global");
    const projectDir = memoryScopeDir(guildHallHome, "project", "test-project");
    const workerDir = memoryScopeDir(guildHallHome, "worker", "test-worker");

    const globalCompacted = await readFile(path.join(globalDir, COMPACTED_FILENAME));
    const projectCompacted = await readFile(path.join(projectDir, COMPACTED_FILENAME));
    const workerCompacted = await readFile(path.join(workerDir, COMPACTED_FILENAME));

    expect(globalCompacted).toBe("Condensed summary of all memories");
    expect(projectCompacted).toBe("Condensed summary of all memories");
    expect(workerCompacted).toBe("Condensed summary of all memories");

    // Original files should be removed
    expect(await fileExists(path.join(globalDir, "pref.md"))).toBe(false);
    expect(await fileExists(path.join(projectDir, "conv.md"))).toBe(false);
    expect(await fileExists(path.join(workerDir, "notes.md"))).toBe(false);
  });

  test("passes all memory content to the compactFn prompt", async () => {
    await writeMemoryFile("global", "g.md", "Global content");
    await writeMemoryFile("worker", "w.md", "Worker content");

    const { fn, captured } = createCapturingCompactFn("Summary");

    await triggerCompaction("test-worker", "test-project", makeDeps(fn));

    expect(captured).toHaveLength(1);
    expect(captured[0].prompt).toContain("Global content");
    expect(captured[0].prompt).toContain("Worker content");
  });

  test("configures SDK call with correct options", async () => {
    await writeMemoryFile("global", "g.md", "Content");

    const { fn, captured } = createCapturingCompactFn("Summary");

    await triggerCompaction("test-worker", "test-project", makeDeps(fn));

    expect(captured).toHaveLength(1);
    const opts = captured[0].options;
    expect(opts.maxTurns).toBe(1);
    expect(opts.maxBudgetUsd).toBeUndefined();
    expect(opts.permissionMode).toBe("dontAsk");
  });

  test("explicitly disables tools and MCP servers in SDK options", async () => {
    await writeMemoryFile("global", "g.md", "Content");

    const { fn, captured } = createCapturingCompactFn("Summary");

    await triggerCompaction("test-worker", "test-project", makeDeps(fn));

    expect(captured).toHaveLength(1);
    const opts = captured[0].options;
    expect(opts.mcpServers).toEqual({});
    expect(opts.allowedTools).toEqual([]);
  });

  test("skips compaction when all scope directories are empty", async () => {
    // Create empty directories
    const globalDir = memoryScopeDir(guildHallHome, "global", "global");
    await fs.mkdir(globalDir, { recursive: true });

    const { fn, captured } = createCapturingCompactFn("Summary");

    await triggerCompaction("test-worker", "test-project", makeDeps(fn));

    // SDK should not have been called
    expect(captured).toHaveLength(0);
  });

  test("skips compaction when no scope directories exist", async () => {
    const { fn, captured } = createCapturingCompactFn("Summary");

    await triggerCompaction("test-worker", "test-project", makeDeps(fn));

    expect(captured).toHaveLength(0);
  });

  test("only compacts scopes that have files", async () => {
    // Only global has files; project and worker dirs don't exist
    await writeMemoryFile("global", "g.md", "Global note");

    const compactFn = createMockCompactFn("Compacted global");

    await triggerCompaction("test-worker", "test-project", makeDeps(compactFn));

    const globalDir = memoryScopeDir(guildHallHome, "global", "global");
    expect(await readFile(path.join(globalDir, COMPACTED_FILENAME))).toBe("Compacted global");
    expect(await fileExists(path.join(globalDir, "g.md"))).toBe(false);

    // Project and worker dirs should not have _compacted.md
    const projectDir = memoryScopeDir(guildHallHome, "project", "test-project");
    const workerDir = memoryScopeDir(guildHallHome, "worker", "test-worker");
    expect(await fileExists(path.join(projectDir, COMPACTED_FILENAME))).toBe(false);
    expect(await fileExists(path.join(workerDir, COMPACTED_FILENAME))).toBe(false);
  });
});

// -- _compacted.md replacement --

describe("triggerCompaction: _compacted.md handling", () => {
  test("replaces existing _compacted.md with new summary", async () => {
    const globalDir = memoryScopeDir(guildHallHome, "global", "global");
    await fs.mkdir(globalDir, { recursive: true });
    await fs.writeFile(
      path.join(globalDir, COMPACTED_FILENAME),
      "Old compacted content",
      "utf-8",
    );
    await fs.writeFile(path.join(globalDir, "new-memory.md"), "New memory", "utf-8");

    const compactFn = createMockCompactFn("Updated compacted content");

    await triggerCompaction("test-worker", "test-project", makeDeps(compactFn));

    const content = await readFile(path.join(globalDir, COMPACTED_FILENAME));
    expect(content).toBe("Updated compacted content");
    // new-memory.md should be removed (it was in the snapshot)
    expect(await fileExists(path.join(globalDir, "new-memory.md"))).toBe(false);
  });

  test("excludes _compacted.md from snapshot filenames (not deleted) but includes its content in prompt", async () => {
    const globalDir = memoryScopeDir(guildHallHome, "global", "global");
    await fs.mkdir(globalDir, { recursive: true });
    await fs.writeFile(
      path.join(globalDir, COMPACTED_FILENAME),
      "Existing compacted",
      "utf-8",
    );
    await fs.writeFile(path.join(globalDir, "active.md"), "Active memory", "utf-8");

    const { fn, captured } = createCapturingCompactFn("New compacted");

    await triggerCompaction("test-worker", "test-project", makeDeps(fn));

    // The prompt should contain the prior compacted content for incorporation
    expect(captured[0].prompt).toContain("Existing compacted");
    expect(captured[0].prompt).toContain("Previous compacted summary");
    // The new memory entries should also be in the prompt
    expect(captured[0].prompt).toContain("Active memory");
  });
});

// -- Prior compacted summary inclusion --

describe("triggerCompaction: prior compacted summary", () => {
  test("includes prior _compacted.md content in the SDK prompt", async () => {
    // Simulate a first compaction cycle having already run: _compacted.md
    // exists alongside new memory files that arrived after the first cycle.
    const globalDir = memoryScopeDir(guildHallHome, "global", "global");
    await fs.mkdir(globalDir, { recursive: true });
    await fs.writeFile(
      path.join(globalDir, COMPACTED_FILENAME),
      "Previously compacted: use dark mode, prefer camelCase",
      "utf-8",
    );
    await fs.writeFile(
      path.join(globalDir, "new-session.md"),
      "New session: switched to tabs over spaces",
      "utf-8",
    );

    const { fn, captured } = createCapturingCompactFn("Combined old + new summary");

    await triggerCompaction("test-worker", "test-project", makeDeps(fn));

    expect(captured).toHaveLength(1);
    const prompt = captured[0].prompt;

    // Prior compacted content should appear in the prompt
    expect(prompt).toContain("Previously compacted: use dark mode, prefer camelCase");
    expect(prompt).toContain("Previous compacted summary");

    // New memory entries should also appear
    expect(prompt).toContain("New session: switched to tabs over spaces");
    expect(prompt).toContain("New memory entries");
  });

  test("includes prior summaries from multiple scopes", async () => {
    const globalDir = memoryScopeDir(guildHallHome, "global", "global");
    const workerDir = memoryScopeDir(guildHallHome, "worker", "test-worker");

    await fs.mkdir(globalDir, { recursive: true });
    await fs.mkdir(workerDir, { recursive: true });

    await fs.writeFile(
      path.join(globalDir, COMPACTED_FILENAME),
      "Global prior summary",
      "utf-8",
    );
    await fs.writeFile(path.join(globalDir, "g.md"), "Global new", "utf-8");

    await fs.writeFile(
      path.join(workerDir, COMPACTED_FILENAME),
      "Worker prior summary",
      "utf-8",
    );
    await fs.writeFile(path.join(workerDir, "w.md"), "Worker new", "utf-8");

    const { fn, captured } = createCapturingCompactFn("Multi-scope summary");

    await triggerCompaction("test-worker", "test-project", makeDeps(fn));

    expect(captured).toHaveLength(1);
    const prompt = captured[0].prompt;

    expect(prompt).toContain("Global prior summary");
    expect(prompt).toContain("Worker prior summary");
    expect(prompt).toContain("Global new");
    expect(prompt).toContain("Worker new");
  });

  test("omits prior summary section when no _compacted.md exists", async () => {
    await writeMemoryFile("global", "fresh.md", "First-time content");

    const { fn, captured } = createCapturingCompactFn("First compaction");

    await triggerCompaction("test-worker", "test-project", makeDeps(fn));

    expect(captured).toHaveLength(1);
    const prompt = captured[0].prompt;

    // No prior summary section should appear
    expect(prompt).not.toContain("Previous compacted summary");
    expect(prompt).toContain("First-time content");
  });
});

// -- Concurrent guard --

describe("triggerCompaction: concurrent guard", () => {
  test("skips second compaction request for the same worker+project pair", async () => {
    await writeMemoryFile("global", "g.md", "Content");

    const { fn: blockingFn, resolve } = createBlockingCompactFn("Summary");
    let callCount = 0;
    const countingFn: CompactQueryFn = async function* (params) {
      callCount++;
      yield* blockingFn(params);
    };

    // Start first compaction (will block on the SDK call)
    const first = triggerCompaction("test-worker", "test-project", makeDeps(countingFn));

    // isCompactionRunning should be true
    expect(isCompactionRunning("test-worker", "test-project")).toBe(true);

    // Second call for the same pair should be skipped
    const second = triggerCompaction("test-worker", "test-project", makeDeps(countingFn));
    await second; // Resolves immediately (no-op)

    // Unblock the first compaction
    resolve();
    await first;

    // SDK should only have been called once
    expect(callCount).toBe(1);

    // Guard should be cleared
    expect(isCompactionRunning("test-worker", "test-project")).toBe(false);
  });

  test("allows compaction for different worker+project pairs concurrently", async () => {
    await writeMemoryFile("global", "g.md", "Content");
    await writeMemoryFile("worker", "w.md", "Worker A content", { workerName: "worker-a" });
    await writeMemoryFile("worker", "w.md", "Worker B content", { workerName: "worker-b" });

    let callCount = 0;
    const countingFn: CompactQueryFn = async function* () {
      await Promise.resolve();
      callCount++;
      yield makeAssistantMsg("Summary");
    };

    // Two different worker names: should both proceed
    await Promise.all([
      triggerCompaction("worker-a", "test-project", makeDeps(countingFn)),
      triggerCompaction("worker-b", "test-project", makeDeps(countingFn)),
    ]);

    expect(callCount).toBe(2);
  });

  test("clears guard on SDK failure (finally block)", async () => {
    await writeMemoryFile("global", "g.md", "Content");

    const failingFn = createFailingCompactFn("SDK exploded");

    // Should not throw (fire-and-forget error handling)
    await triggerCompaction("test-worker", "test-project", makeDeps(failingFn));

    // Guard should be cleared even after failure
    expect(isCompactionRunning("test-worker", "test-project")).toBe(false);
  });
});

// -- Snapshot isolation --

describe("triggerCompaction: snapshot isolation", () => {
  test("files written during compaction are not deleted", async () => {
    const globalDir = memoryScopeDir(guildHallHome, "global", "global");
    await fs.mkdir(globalDir, { recursive: true });
    await fs.writeFile(path.join(globalDir, "old.md"), "Old content", "utf-8");

    // compactFn that writes a new file during "SDK processing"
    const sneakyCompactFn: CompactQueryFn = async function* () {
      // Simulate a new memory file being written while compaction runs
      await fs.writeFile(path.join(globalDir, "new-during-compaction.md"), "Fresh memory", "utf-8");

      yield makeAssistantMsg("Summary");
    };

    await triggerCompaction("test-worker", "test-project", makeDeps(sneakyCompactFn));

    // old.md should be removed (was in snapshot)
    expect(await fileExists(path.join(globalDir, "old.md"))).toBe(false);

    // new-during-compaction.md should survive (not in snapshot)
    expect(await fileExists(path.join(globalDir, "new-during-compaction.md"))).toBe(true);
    const newContent = await readFile(path.join(globalDir, "new-during-compaction.md"));
    expect(newContent).toBe("Fresh memory");

    // _compacted.md should exist
    expect(await readFile(path.join(globalDir, COMPACTED_FILENAME))).toBe("Summary");
  });

  test("only snapshot files are included in the SDK prompt", async () => {
    const globalDir = memoryScopeDir(guildHallHome, "global", "global");
    await fs.mkdir(globalDir, { recursive: true });
    await fs.writeFile(path.join(globalDir, "snapshot-file.md"), "Snapshot content", "utf-8");

    const { fn, captured } = createCapturingCompactFn("Summary");

    // The compactFn doesn't write extra files, so the snapshot is deterministic
    await triggerCompaction("test-worker", "test-project", makeDeps(fn));

    expect(captured[0].prompt).toContain("Snapshot content");
    expect(captured[0].prompt).toContain("snapshot-file.md");
  });
});

// -- Error handling --

describe("triggerCompaction: error handling", () => {
  test("leaves files intact when SDK call fails", async () => {
    await writeMemoryFile("global", "keep.md", "Preserved content");

    const failingFn = createFailingCompactFn("SDK unavailable");

    // Should not throw
    await triggerCompaction("test-worker", "test-project", makeDeps(failingFn));

    // Original file should still exist
    const globalDir = memoryScopeDir(guildHallHome, "global", "global");
    const content = await readFile(path.join(globalDir, "keep.md"));
    expect(content).toBe("Preserved content");

    // No _compacted.md should have been written
    expect(await fileExists(path.join(globalDir, COMPACTED_FILENAME))).toBe(false);
  });

  test("leaves files intact when SDK returns empty summary", async () => {
    await writeMemoryFile("global", "keep.md", "Preserved content");

    // SDK returns no text content
    const emptyFn: CompactQueryFn = async function* () {
      await Promise.resolve();
      yield {
        type: "assistant",
        message: { content: [] },
      } as never;
    };

    await triggerCompaction("test-worker", "test-project", makeDeps(emptyFn));

    const globalDir = memoryScopeDir(guildHallHome, "global", "global");
    expect(await readFile(path.join(globalDir, "keep.md"))).toBe("Preserved content");
    expect(await fileExists(path.join(globalDir, COMPACTED_FILENAME))).toBe(false);
  });

  test("does not propagate SDK errors (fire-and-forget)", async () => {
    await writeMemoryFile("global", "g.md", "Content");

    const failingFn = createFailingCompactFn("Catastrophic failure");

    // triggerCompaction catches errors internally, so the returned
    // promise should resolve (not reject) even when the SDK throws.
    await expect(
      triggerCompaction("test-worker", "test-project", makeDeps(failingFn)),
    ).resolves.toBeUndefined();
  });
});

// -- Multiple files in scope --

describe("triggerCompaction: multiple files", () => {
  test("compacts multiple files from a single scope", async () => {
    await writeMemoryFile("global", "a.md", "Content A");
    await writeMemoryFile("global", "b.md", "Content B");
    await writeMemoryFile("global", "c.md", "Content C");

    const { fn, captured } = createCapturingCompactFn("Combined summary");

    await triggerCompaction("test-worker", "test-project", makeDeps(fn));

    // All three files should appear in the prompt
    expect(captured[0].prompt).toContain("Content A");
    expect(captured[0].prompt).toContain("Content B");
    expect(captured[0].prompt).toContain("Content C");

    // All three originals should be removed
    const globalDir = memoryScopeDir(guildHallHome, "global", "global");
    expect(await fileExists(path.join(globalDir, "a.md"))).toBe(false);
    expect(await fileExists(path.join(globalDir, "b.md"))).toBe(false);
    expect(await fileExists(path.join(globalDir, "c.md"))).toBe(false);

    // _compacted.md should exist
    expect(await readFile(path.join(globalDir, COMPACTED_FILENAME))).toBe("Combined summary");
  });
});
