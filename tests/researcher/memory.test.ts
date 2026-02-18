import { describe, expect, it, mock } from "bun:test";

import { createMemoryStore } from "@/guild-members/researcher/memory";
import type { MemoryStoreFs, MemoryStoreDeps } from "@/guild-members/researcher/memory";
import type { QueryFn } from "@/lib/agent";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

// -- Mock SDK message factories --

function makeSuccessResult(resultText: string, sessionId = "compact-session-1"): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    duration_ms: 500,
    duration_api_ms: 400,
    is_error: false,
    num_turns: 1,
    result: resultText,
    stop_reason: "end_turn",
    total_cost_usd: 0.02,
    usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    modelUsage: {},
    permission_denials: [],
    uuid: "00000000-0000-0000-0000-000000000001",
    session_id: sessionId,
  } as unknown as SDKMessage;
}

function makeInitMessage(sessionId = "compact-session-1"): SDKMessage {
  return {
    type: "system",
    subtype: "init",
    session_id: sessionId,
    uuid: "00000000-0000-0000-0000-000000000002",
    agents: [],
    apiKeySource: "user",
    betas: [],
    claude_code_version: "2.1.45",
    cwd: "/tmp",
    tools: [],
    mcp_servers: [],
    model: "claude-sonnet-4-5-20250929",
    permissionMode: "bypassPermissions",
  } as unknown as SDKMessage;
}

// -- Mock query function --

function createMockQueryFn(messages: SDKMessage[]): QueryFn {
  return () => {
    async function* generator() {
      for (const msg of messages) {
        yield await Promise.resolve(msg);
      }
    }
    const gen = generator();
    (gen as unknown as Record<string, unknown>).interrupt = () => Promise.resolve();
    (gen as unknown as Record<string, unknown>).close = () => {};
    return gen as ReturnType<QueryFn>;
  };
}

/**
 * Creates a capturing mock query function that records the options passed.
 */
function createCapturingQueryFn(messages: SDKMessage[]): {
  queryFn: QueryFn;
  calls: Array<{ prompt: string; options: Record<string, unknown> }>;
} {
  const calls: Array<{ prompt: string; options: Record<string, unknown> }> = [];

  const queryFn: QueryFn = (params) => {
    calls.push({
      prompt: params.prompt,
      options: (params.options ?? {}) as Record<string, unknown>,
    });
    return createMockQueryFn(messages)(params);
  };

  return { queryFn, calls };
}

function createErrorQueryFn(errorMessage: string): QueryFn {
  return () => {
    async function* generator(): AsyncGenerator<SDKMessage> {
      throw new Error(errorMessage);
    }
    const gen = generator();
    (gen as unknown as Record<string, unknown>).interrupt = () => Promise.resolve();
    (gen as unknown as Record<string, unknown>).close = () => {};
    return gen as ReturnType<QueryFn>;
  };
}

// -- Mock filesystem --

type MockFileEntry = { content: string; mtimeMs: number; size: number };

/**
 * Creates a mock filesystem that stores files in memory.
 * Tracks all operations for assertion.
 */
function createMockFs(initialFiles: Record<string, MockFileEntry> = {}) {
  const files = new Map<string, MockFileEntry>();
  const dirs = new Set<string>();

  // Populate initial files
  for (const [path, entry] of Object.entries(initialFiles)) {
    files.set(path, { ...entry });
  }

  const removedFiles: string[] = [];

  const fs: MemoryStoreFs = {
    mkdir: mock(async (path: string) => {
      dirs.add(path);
    }),

    writeFile: mock(async (path: string, content: string) => {
      files.set(path, {
        content,
        mtimeMs: Date.now(),
        size: Buffer.byteLength(content, "utf-8"),
      });
    }),

    readFile: mock(async (path: string) => {
      const entry = files.get(path);
      if (!entry) throw new Error(`ENOENT: no such file: ${path}`);
      return entry.content;
    }),

    readdir: mock(async (dirPath: string) => {
      const entries: string[] = [];
      const prefix = dirPath.endsWith("/") ? dirPath : `${dirPath}/`;
      for (const path of files.keys()) {
        if (path.startsWith(prefix)) {
          const relative = path.slice(prefix.length);
          // Only direct children (no deeper slashes)
          if (!relative.includes("/")) {
            entries.push(relative);
          }
        }
      }
      if (entries.length === 0 && !dirs.has(dirPath)) {
        throw new Error(`ENOENT: no such directory: ${dirPath}`);
      }
      return entries;
    }),

    rm: mock(async (path: string) => {
      removedFiles.push(path);
      files.delete(path);
    }),

    stat: mock(async (path: string) => {
      const entry = files.get(path);
      if (!entry) throw new Error(`ENOENT: no such file: ${path}`);
      return { mtimeMs: entry.mtimeMs, size: entry.size };
    }),
  };

  return { fs, files, dirs, removedFiles };
}

// -- Helpers --

function makeDeps(mockFs: MemoryStoreFs, queryFn?: QueryFn): MemoryStoreDeps {
  return {
    fs: mockFs,
    queryFn,
    logger: { error: mock(() => {}) },
  };
}

const MEMORY_DIR = "/test/researcher/memory";

// -- Tests --

describe("MemoryStore", () => {
  describe("loadMemories", () => {
    it("returns empty string when no memory files exist", async () => {
      const { fs: mockFs } = createMockFs();
      const store = createMemoryStore(MEMORY_DIR, makeDeps(mockFs));

      const result = await store.loadMemories();

      expect(result).toBe("");
    });

    it("returns concatenated content from all memory files", async () => {
      const { fs: mockFs } = createMockFs({
        [`${MEMORY_DIR}/alpha.md`]: { content: "Alpha content", mtimeMs: 1000, size: 13 },
        [`${MEMORY_DIR}/beta.md`]: { content: "Beta content", mtimeMs: 2000, size: 12 },
      });
      const store = createMemoryStore(MEMORY_DIR, makeDeps(mockFs));

      const result = await store.loadMemories();

      expect(result).toContain("Alpha content");
      expect(result).toContain("Beta content");
    });

    it("sorts by mtime (most recent first)", async () => {
      const { fs: mockFs } = createMockFs({
        [`${MEMORY_DIR}/old.md`]: { content: "Old content", mtimeMs: 1000, size: 11 },
        [`${MEMORY_DIR}/new.md`]: { content: "New content", mtimeMs: 3000, size: 11 },
        [`${MEMORY_DIR}/mid.md`]: { content: "Mid content", mtimeMs: 2000, size: 11 },
      });
      const store = createMemoryStore(MEMORY_DIR, makeDeps(mockFs));

      const result = await store.loadMemories();

      const newIdx = result.indexOf("New content");
      const midIdx = result.indexOf("Mid content");
      const oldIdx = result.indexOf("Old content");

      expect(newIdx).toBeLessThan(midIdx);
      expect(midIdx).toBeLessThan(oldIdx);
    });

    it("truncates to cap when total exceeds limit (includes complete files only)", async () => {
      // Each file is 100 chars. Cap is 250 chars, so only 2 files fit
      // (2 files = 200 chars content + 5 chars separator = 205, third would be 310).
      const longContent = "x".repeat(100);
      const { fs: mockFs } = createMockFs({
        [`${MEMORY_DIR}/a.md`]: { content: longContent, mtimeMs: 3000, size: 100 },
        [`${MEMORY_DIR}/b.md`]: { content: longContent, mtimeMs: 2000, size: 100 },
        [`${MEMORY_DIR}/c.md`]: { content: longContent, mtimeMs: 1000, size: 100 },
      });
      const store = createMemoryStore(MEMORY_DIR, makeDeps(mockFs));

      const result = await store.loadMemories(250);

      // Should contain exactly 2 copies of the content joined by separator
      const parts = result.split("\n---\n");
      expect(parts).toHaveLength(2);
    });

    it("never cuts a file mid-content", async () => {
      const { fs: mockFs } = createMockFs({
        [`${MEMORY_DIR}/big.md`]: { content: "A".repeat(200), mtimeMs: 2000, size: 200 },
        [`${MEMORY_DIR}/small.md`]: { content: "B".repeat(50), mtimeMs: 1000, size: 50 },
      });
      const store = createMemoryStore(MEMORY_DIR, makeDeps(mockFs));

      // Cap is 100, but the first file is 200 chars. First file is always included.
      // Second file would exceed cap, so it's excluded.
      const result = await store.loadMemories(100);

      expect(result).toBe("A".repeat(200));
      expect(result).not.toContain("B");
    });

    it("separates files with ---", async () => {
      const { fs: mockFs } = createMockFs({
        [`${MEMORY_DIR}/first.md`]: { content: "First", mtimeMs: 2000, size: 5 },
        [`${MEMORY_DIR}/second.md`]: { content: "Second", mtimeMs: 1000, size: 6 },
      });
      const store = createMemoryStore(MEMORY_DIR, makeDeps(mockFs));

      const result = await store.loadMemories();

      expect(result).toBe("First\n---\nSecond");
    });
  });

  describe("storeMemory", () => {
    it("writes file with correct content", async () => {
      const { fs: mockFs, files } = createMockFs();
      const store = createMemoryStore(MEMORY_DIR, makeDeps(mockFs));

      await store.storeMemory("api-limits", "Rate limit is 100 req/min");

      const entry = files.get(`${MEMORY_DIR}/api-limits.md`);
      expect(entry).toBeDefined();
      expect(entry!.content).toBe("Rate limit is 100 req/min");
    });

    it("overwrites existing file", async () => {
      const { fs: mockFs, files } = createMockFs({
        [`${MEMORY_DIR}/notes.md`]: { content: "Old notes", mtimeMs: 1000, size: 9 },
      });
      const store = createMemoryStore(MEMORY_DIR, makeDeps(mockFs));

      await store.storeMemory("notes", "New notes");

      const entry = files.get(`${MEMORY_DIR}/notes.md`);
      expect(entry!.content).toBe("New notes");
    });

    it("creates directory if it doesn't exist", async () => {
      const { fs: mockFs, dirs } = createMockFs();
      const store = createMemoryStore(MEMORY_DIR, makeDeps(mockFs));

      await store.storeMemory("test-key", "content");

      expect(dirs.has(MEMORY_DIR)).toBe(true);
    });

    it("validates key is filename-safe (rejects invalid keys)", async () => {
      const { fs: mockFs } = createMockFs();
      const store = createMemoryStore(MEMORY_DIR, makeDeps(mockFs));

      const invalidKeys = ["invalid key!", "path/traversal", "dots.not.allowed", ""];
      for (const key of invalidKeys) {
        let caught: Error | null = null;
        try {
          await store.storeMemory(key, "content");
        } catch (err) {
          caught = err as Error;
        }
        expect(caught).not.toBeNull();
        expect(caught!.message).toContain("Invalid memory key");
      }
    });

    it("accepts valid filename-safe keys", async () => {
      const { fs: mockFs } = createMockFs();
      const store = createMemoryStore(MEMORY_DIR, makeDeps(mockFs));

      // These should all succeed without throwing
      await store.storeMemory("valid-key", "content");
      await store.storeMemory("valid_key", "content");
      await store.storeMemory("ValidKey123", "content");
      await store.storeMemory("a", "content");
    });
  });

  describe("getTotalMemorySize", () => {
    it("returns sum of all memory file sizes", async () => {
      const { fs: mockFs } = createMockFs({
        [`${MEMORY_DIR}/a.md`]: { content: "Hello", mtimeMs: 1000, size: 5 },
        [`${MEMORY_DIR}/b.md`]: { content: "World!", mtimeMs: 2000, size: 6 },
      });
      const store = createMemoryStore(MEMORY_DIR, makeDeps(mockFs));

      const total = await store.getTotalMemorySize();

      expect(total).toBe(11);
    });

    it("returns 0 when no memory files exist", async () => {
      const { fs: mockFs } = createMockFs();
      const store = createMemoryStore(MEMORY_DIR, makeDeps(mockFs));

      const total = await store.getTotalMemorySize();

      expect(total).toBe(0);
    });
  });

  describe("compactMemories", () => {
    it("spawns query with all memory content in prompt", async () => {
      const { fs: mockFs } = createMockFs({
        [`${MEMORY_DIR}/finding-1.md`]: { content: "Finding one", mtimeMs: 1000, size: 11 },
        [`${MEMORY_DIR}/finding-2.md`]: { content: "Finding two", mtimeMs: 2000, size: 11 },
      });

      const { queryFn, calls } = createCapturingQueryFn([
        makeInitMessage(),
        makeSuccessResult("Condensed summary of findings"),
      ]);

      const store = createMemoryStore(MEMORY_DIR, makeDeps(mockFs, queryFn));

      await store.compactMemories();

      expect(calls).toHaveLength(1);
      expect(calls[0].prompt).toContain("Finding one");
      expect(calls[0].prompt).toContain("Finding two");
    });

    it("writes condensed output to compacted.md", async () => {
      const { fs: mockFs, files } = createMockFs({
        [`${MEMORY_DIR}/old.md`]: { content: "Old data", mtimeMs: 1000, size: 8 },
      });

      const queryFn = createMockQueryFn([
        makeInitMessage(),
        makeSuccessResult("Compacted summary"),
      ]);

      const store = createMemoryStore(MEMORY_DIR, makeDeps(mockFs, queryFn));

      await store.compactMemories();

      const compacted = files.get(`${MEMORY_DIR}/compacted.md`);
      expect(compacted).toBeDefined();
      expect(compacted!.content).toBe("Compacted summary");
    });

    it("removes only snapshot files (not files written during compaction)", async () => {
      // Set up the mock to simulate a file being written during compaction.
      // We need the readdir to return the snapshot files, then after the query
      // runs the new file should survive.
      const { fs: mockFs, files, removedFiles } = createMockFs({
        [`${MEMORY_DIR}/pre-existing.md`]: { content: "Old", mtimeMs: 1000, size: 3 },
      });

      // The queryFn will simulate adding a new file during compaction
      const queryFn: QueryFn = (params) => {
        // Simulate a file being written by another store_memory call during compaction
        files.set(`${MEMORY_DIR}/new-during-compact.md`, {
          content: "Written during compaction",
          mtimeMs: 5000,
          size: 24,
        });

        return createMockQueryFn([
          makeInitMessage(),
          makeSuccessResult("Compacted result"),
        ])(params);
      };

      const store = createMemoryStore(MEMORY_DIR, makeDeps(mockFs, queryFn));

      await store.compactMemories();

      // pre-existing.md should be removed
      expect(removedFiles).toContain(`${MEMORY_DIR}/pre-existing.md`);

      // new-during-compact.md should NOT be removed
      expect(removedFiles).not.toContain(`${MEMORY_DIR}/new-during-compact.md`);

      // The new file should still exist
      expect(files.has(`${MEMORY_DIR}/new-during-compact.md`)).toBe(true);
    });

    it("leaves files untouched on query failure", async () => {
      const { fs: mockFs, files, removedFiles } = createMockFs({
        [`${MEMORY_DIR}/keep-me.md`]: { content: "Important", mtimeMs: 1000, size: 9 },
      });

      const queryFn = createErrorQueryFn("API error");

      const store = createMemoryStore(MEMORY_DIR, makeDeps(mockFs, queryFn));

      await store.compactMemories();

      // Files should remain untouched
      expect(files.has(`${MEMORY_DIR}/keep-me.md`)).toBe(true);
      expect(removedFiles).toHaveLength(0);
    });

    it("logs failure but does not throw", async () => {
      const { fs: mockFs } = createMockFs({
        [`${MEMORY_DIR}/data.md`]: { content: "Data", mtimeMs: 1000, size: 4 },
      });

      const queryFn = createErrorQueryFn("Network timeout");
      const logger = { error: mock(() => {}) };
      const deps: MemoryStoreDeps = { fs: mockFs, queryFn, logger };

      const store = createMemoryStore(MEMORY_DIR, deps);

      // Should not throw
      await store.compactMemories();

      expect(logger.error).toHaveBeenCalled();
    });

    it("skips if compaction is already in progress", async () => {
      const { fs: mockFs } = createMockFs({
        [`${MEMORY_DIR}/data.md`]: { content: "Data", mtimeMs: 1000, size: 4 },
      });

      let resolveQuery: (() => void) | undefined;
      const queryStarted = new Promise<void>((resolve) => {
        resolveQuery = resolve;
      });

      // Create a queryFn that blocks until we signal it
      let callCount = 0;
      const blockingQueryFn: QueryFn = () => {
        callCount++;
        async function* generator() {
          resolveQuery!();
          // Block until the test signals completion
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 100);
          });
          yield makeSuccessResult("Compacted");
        }
        const gen = generator();
        (gen as unknown as Record<string, unknown>).interrupt = () => Promise.resolve();
        (gen as unknown as Record<string, unknown>).close = () => {};
        return gen as ReturnType<QueryFn>;
      };

      const store = createMemoryStore(MEMORY_DIR, makeDeps(mockFs, blockingQueryFn));

      // Start first compaction (don't await)
      const first = store.compactMemories();

      // Wait for the query to start
      await queryStarted;

      // Start second compaction (should skip because first is in progress)
      await store.compactMemories();

      // Wait for first to complete
      await first;

      // Only one query should have been spawned
      expect(callCount).toBe(1);
    });

    it("clears in-progress flag after failure", async () => {
      const { fs: mockFs } = createMockFs({
        [`${MEMORY_DIR}/data.md`]: { content: "Data", mtimeMs: 1000, size: 4 },
      });

      const errorQueryFn = createErrorQueryFn("First failure");

      const store = createMemoryStore(MEMORY_DIR, makeDeps(mockFs, errorQueryFn));

      // First compaction fails
      await store.compactMemories();

      // Replace queryFn for second call by creating a new store with same fs state
      // Actually, we can just verify the flag was cleared by trying again.
      // Since we can't change deps after creation, let's create a store
      // that tracks call count.
      let queryCallCount = 0;
      const trackingQueryFn: QueryFn = (params) => {
        queryCallCount++;
        // First call fails, second succeeds
        if (queryCallCount === 1) {
          return createErrorQueryFn("Failure")(params);
        }
        return createMockQueryFn([
          makeInitMessage(),
          makeSuccessResult("Recovered"),
        ])(params);
      };

      const store2 = createMemoryStore(MEMORY_DIR, makeDeps(mockFs, trackingQueryFn));

      // First compaction fails
      await store2.compactMemories();
      expect(queryCallCount).toBe(1);

      // Second compaction should NOT be skipped (flag was cleared)
      await store2.compactMemories();
      expect(queryCallCount).toBe(2);
    });

    it("includes prior compacted.md in re-compaction and preserves the new one", async () => {
      const { fs: mockFs, files, removedFiles } = createMockFs({
        [`${MEMORY_DIR}/compacted.md`]: {
          content: "Prior compacted summary",
          mtimeMs: 1000,
          size: 23,
        },
        [`${MEMORY_DIR}/new-finding.md`]: {
          content: "A new finding",
          mtimeMs: 2000,
          size: 13,
        },
      });

      const { queryFn, calls } = createCapturingQueryFn([
        makeInitMessage(),
        makeSuccessResult("Re-compacted summary with all context"),
      ]);

      const store = createMemoryStore(MEMORY_DIR, makeDeps(mockFs, queryFn));

      await store.compactMemories();

      // Both files' content should appear in the compaction prompt
      expect(calls).toHaveLength(1);
      expect(calls[0].prompt).toContain("Prior compacted summary");
      expect(calls[0].prompt).toContain("A new finding");

      // New compacted.md should contain the re-compacted result
      const compacted = files.get(`${MEMORY_DIR}/compacted.md`);
      expect(compacted).toBeDefined();
      expect(compacted!.content).toBe("Re-compacted summary with all context");

      // new-finding.md should be removed (it was in the snapshot)
      expect(removedFiles).toContain(`${MEMORY_DIR}/new-finding.md`);

      // compacted.md should NOT be removed (it's the file we just wrote)
      expect(removedFiles).not.toContain(`${MEMORY_DIR}/compacted.md`);

      // compacted.md should still exist in the filesystem
      expect(files.has(`${MEMORY_DIR}/compacted.md`)).toBe(true);
    });

    it("uses correct query options: maxTurns 1, no tools, bypassPermissions", async () => {
      const { fs: mockFs } = createMockFs({
        [`${MEMORY_DIR}/data.md`]: { content: "Data", mtimeMs: 1000, size: 4 },
      });

      const { queryFn, calls } = createCapturingQueryFn([
        makeInitMessage(),
        makeSuccessResult("Compacted"),
      ]);

      const store = createMemoryStore(MEMORY_DIR, makeDeps(mockFs, queryFn));

      await store.compactMemories();

      expect(calls).toHaveLength(1);
      const opts = calls[0].options;
      expect(opts.maxTurns).toBe(1);
      expect(opts.permissionMode).toBe("bypassPermissions");
      expect(opts.allowDangerouslySkipPermissions).toBe(true);
      expect(opts.settingSources).toEqual([]);
      expect(opts.persistSession).toBe(false);
      expect(opts.maxBudgetUsd).toBe(0.05);
    });
  });

  describe("triggerCompaction", () => {
    it("is fire-and-forget (returns void, not a promise)", () => {
      const { fs: mockFs } = createMockFs({
        [`${MEMORY_DIR}/data.md`]: { content: "Data", mtimeMs: 1000, size: 4 },
      });

      const queryFn = createMockQueryFn([
        makeInitMessage(),
        makeSuccessResult("Compacted"),
      ]);

      const store = createMemoryStore(MEMORY_DIR, makeDeps(mockFs, queryFn));

      const result = store.triggerCompaction();

      // Should return void (undefined), not a promise
      expect(result).toBeUndefined();
    });

    it("does not trigger compaction when queryFn is not provided", () => {
      const { fs: mockFs } = createMockFs({
        [`${MEMORY_DIR}/data.md`]: { content: "Data", mtimeMs: 1000, size: 4 },
      });

      const deps: MemoryStoreDeps = { fs: mockFs };
      const store = createMemoryStore(MEMORY_DIR, deps);

      // Should not throw even without queryFn
      expect(() => store.triggerCompaction()).not.toThrow();
    });

    it("skips if compaction is already in progress", async () => {
      const { fs: mockFs } = createMockFs({
        [`${MEMORY_DIR}/data.md`]: { content: "Data", mtimeMs: 1000, size: 4 },
      });

      let callCount = 0;
      const slowQueryFn: QueryFn = (params) => {
        callCount++;
        async function* generator() {
          await new Promise<void>((resolve) => setTimeout(resolve, 50));
          yield makeSuccessResult("Compacted");
        }
        const gen = generator();
        (gen as unknown as Record<string, unknown>).interrupt = () => Promise.resolve();
        (gen as unknown as Record<string, unknown>).close = () => {};
        return gen as ReturnType<QueryFn>;
      };

      const store = createMemoryStore(MEMORY_DIR, makeDeps(mockFs, slowQueryFn));

      // Fire first compaction
      store.triggerCompaction();

      // Give it a tick to start
      await new Promise<void>((resolve) => setTimeout(resolve, 10));

      // Fire second compaction (should be skipped)
      store.triggerCompaction();

      // Wait for everything to settle
      await new Promise<void>((resolve) => setTimeout(resolve, 100));

      expect(callCount).toBe(1);
    });
  });
});
