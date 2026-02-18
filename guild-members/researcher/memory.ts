/**
 * MemoryStore: persistent knowledge storage across worker dispatch jobs.
 *
 * Manages a `memory/` directory at the plugin root. Each memory is a `.md`
 * file keyed by a filename-safe identifier. When total memory exceeds a
 * threshold, compaction spawns a separate Agent SDK query session to condense
 * all memories into a single `compacted.md` file.
 *
 * Follows the DI factory pattern: createMemoryStore(memoryDir, deps?) returns
 * a MemoryStore (matching the interface in worker-tools.ts) plus loadMemories
 * for prompt building.
 */

import { join } from "node:path";
import { mkdir, writeFile, readFile, readdir, rm, stat } from "node:fs/promises";

import type { QueryFn } from "@/lib/agent";
import type { MemoryStore } from "./worker-tools";

// -- Types --

/** Filesystem operations required by MemoryStore. Subset of node:fs/promises. */
export type MemoryStoreFs = {
  mkdir: (path: string, opts?: { recursive?: boolean }) => Promise<void>;
  writeFile: (path: string, content: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  readdir: (path: string) => Promise<string[]>;
  rm: (path: string, opts?: { recursive?: boolean; force?: boolean }) => Promise<void>;
  stat: (path: string) => Promise<{ mtimeMs: number; size: number }>;
};

export type MemoryStoreDeps = {
  fs: MemoryStoreFs;
  queryFn?: QueryFn;
  logger?: { error: (...args: unknown[]) => void };
};

/** The full memory store API, including loadMemories for prompt building. */
export type FullMemoryStore = MemoryStore & {
  loadMemories: (cap?: number) => Promise<string>;
  /** Exposed for testing. Returns a promise so tests can await completion. */
  compactMemories: () => Promise<void>;
};

// -- Type guards --

/** Type guard for SDK success result messages. Local to avoid cross-compilation-context imports. */
function isSuccessResult(
  msg: unknown,
): msg is { type: "result"; subtype: "success"; result: string } {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    (msg as Record<string, unknown>).type === "result" &&
    "subtype" in msg &&
    (msg as Record<string, unknown>).subtype === "success" &&
    "result" in msg &&
    typeof (msg as Record<string, unknown>).result === "string"
  );
}

// -- Validation --

const FILENAME_SAFE_RE = /^[a-zA-Z0-9_-]+$/;

function isFilenameSafe(key: string): boolean {
  return FILENAME_SAFE_RE.test(key);
}

// -- Default deps (production wiring) --

export function createDefaultDeps(): MemoryStoreDeps {
  return {
    fs: {
      mkdir: (path, opts) => mkdir(path, opts).then(() => undefined),
      writeFile: (path, content) => writeFile(path, content, "utf-8"),
      readFile: (path) => readFile(path, "utf-8"),
      readdir: (path) => readdir(path),
      rm: (path, opts) => rm(path, opts),
      stat: (path) => stat(path).then((s) => ({ mtimeMs: s.mtimeMs, size: s.size })),
    },
  };
}

// -- Compaction prompt --

const COMPACTION_PROMPT = `You are a memory compactor. Below are research memories accumulated across multiple jobs. Condense them into a single, well-organized summary that preserves all important facts, findings, decisions, and context. Remove redundancy but keep detail that would be useful for future research tasks.

Output only the condensed summary in markdown format. Do not include preamble or meta-commentary.

---

`;

// -- Factory --

/**
 * Creates a MemoryStore bound to a memory directory.
 *
 * @param memoryDir - Directory where memory `.md` files are stored.
 * @param deps - Injected filesystem, query function, and logger.
 */
export function createMemoryStore(memoryDir: string, deps?: MemoryStoreDeps): FullMemoryStore {
  const { fs, queryFn, logger } = deps ?? createDefaultDeps();

  let compactionInProgress = false;

  /** Lists all .md files in the memory directory. Returns empty array if dir doesn't exist. */
  async function listMemoryFiles(): Promise<string[]> {
    try {
      const entries = await fs.readdir(memoryDir);
      return entries.filter((e) => e.endsWith(".md"));
    } catch {
      return [];
    }
  }

  /** Gets stat info for a memory file. */
  async function fileStat(filename: string): Promise<{ mtimeMs: number; size: number }> {
    return fs.stat(join(memoryDir, filename));
  }

  async function loadMemories(cap = 8000): Promise<string> {
    const files = await listMemoryFiles();
    if (files.length === 0) return "";

    // Get mtime for sorting
    const withStats = await Promise.all(
      files.map(async (f) => {
        const s = await fileStat(f);
        return { filename: f, mtimeMs: s.mtimeMs };
      }),
    );

    // Sort by mtime, most recent first
    withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);

    const parts: string[] = [];
    let totalChars = 0;

    for (const entry of withStats) {
      const content = await fs.readFile(join(memoryDir, entry.filename));

      // If this is the first file, always include it regardless of cap
      if (parts.length === 0) {
        parts.push(content);
        totalChars += content.length;
        continue;
      }

      // Soft cap: would adding this file (plus separator) exceed cap?
      const separatorLen = "\n---\n".length;
      if (totalChars + separatorLen + content.length > cap) {
        break;
      }

      parts.push(content);
      totalChars += separatorLen + content.length;
    }

    return parts.join("\n---\n");
  }

  async function storeMemory(key: string, content: string): Promise<void> {
    if (!isFilenameSafe(key)) {
      throw new Error(
        `Invalid memory key "${key}": must contain only alphanumeric characters, hyphens, and underscores`,
      );
    }

    await fs.mkdir(memoryDir, { recursive: true });
    await fs.writeFile(join(memoryDir, `${key}.md`), content);
  }

  async function getTotalMemorySize(): Promise<number> {
    const files = await listMemoryFiles();
    if (files.length === 0) return 0;

    let total = 0;
    for (const f of files) {
      const s = await fileStat(f);
      total += s.size;
    }
    return total;
  }

  function triggerCompaction(): void {
    if (compactionInProgress) return;
    if (!queryFn) return;

    // Fire-and-forget: kick off compaction without awaiting
    compactMemories().catch(() => {
      // Error handling is inside compactMemories; this catch prevents
      // unhandled rejection from the fire-and-forget call.
    });
  }

  async function compactMemories(): Promise<void> {
    if (compactionInProgress) return;
    if (!queryFn) return;

    compactionInProgress = true;

    try {
      // 1. Snapshot current files before starting
      const snapshotFiles = await listMemoryFiles();
      if (snapshotFiles.length === 0) return;

      // 2. Read all memory content
      const contents: string[] = [];
      for (const f of snapshotFiles) {
        const content = await fs.readFile(join(memoryDir, f));
        contents.push(`## ${f}\n\n${content}`);
      }

      const allContent = contents.join("\n\n---\n\n");

      // 3. Spawn a compaction query session
      const prompt = COMPACTION_PROMPT + allContent;
      const q = queryFn({
        prompt,
        options: {
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          maxTurns: 1,
          maxBudgetUsd: 0.05,
          settingSources: [],
          persistSession: false,
        },
      });

      // 4. Iterate the query to get the result
      let resultText = "";
      for await (const msg of q) {
        if (isSuccessResult(msg)) {
          resultText = msg.result;
        }
      }

      if (!resultText) {
        throw new Error("Compaction query returned no result text");
      }

      // 5. Write compacted output
      await fs.writeFile(join(memoryDir, "compacted.md"), resultText);

      // 6. Remove only files from the snapshot (not files written after compaction started)
      for (const f of snapshotFiles) {
        // Don't remove the file we just wrote
        if (f === "compacted.md") continue;
        await fs.rm(join(memoryDir, f));
      }
    } catch (err) {
      // Leave memory files as-is on failure. Log but don't propagate.
      const log = logger ?? console;
      log.error("Memory compaction failed:", err);
    } finally {
      compactionInProgress = false;
    }
  }

  return {
    loadMemories,
    storeMemory,
    getTotalMemorySize,
    triggerCompaction,
    compactMemories,
  };
}
