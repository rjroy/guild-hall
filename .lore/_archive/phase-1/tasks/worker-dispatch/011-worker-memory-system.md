---
title: Build worker memory system with compaction
date: 2026-02-17
status: complete
tags: [task]
source: .lore/plans/phase-1/worker-dispatch.md
related:
  - .lore/specs/phase-1/worker-dispatch.md
  - .lore/research/claude-agent-sdk.md
sequence: 11
modules: [researcher-plugin]
---

# Task: Build Worker Memory System with Compaction

## What

Build the memory system that persists knowledge across worker jobs, including recursive compaction.

**Memory module** (`guild-members/researcher/memory.ts`): Manages the `memory/` directory at the plugin root. Uses DI for filesystem operations and Agent SDK query function. Follow the `createX(deps)` factory pattern.

Functions:

- `loadMemories(memoryDir, cap?)` - reads all `.md` files in `memory/`, sorts by mtime (most recent first), includes whole files until adding the next file would exceed `cap` characters (default 8000). Files are separated by `---`. Soft cap: never cuts a file mid-content, but may be under cap if next file is too large. Returns concatenated string, or empty string if no memories exist.

- `storeMemory(memoryDir, key, content)` - writes to `${memoryDir}/${key}.md`. Overwrites existing. Creates directory if it doesn't exist. Key must be filename-safe.

- `getTotalMemorySize(memoryDir)` - reads all `.md` files in `memory/`, sums their byte lengths. Returns 0 when no files exist.

- `compactMemories(memoryDir, threshold, queryFn)` - triggered when total memory exceeds `threshold` (default configurable). Spawns a separate Agent SDK `query()` session:
  1. Snapshots the current file list in `memory/` before starting
  2. Receives all current memory content in its prompt
  3. Instructed to preserve key facts, decisions, and patterns while removing redundancy
  4. Produces a single condensed output
  5. Caller writes output to `memory/compacted.md` and removes only files from the snapshot (not files written after compaction started)

  **Concurrent compaction guard**: Tracks a `compactionInProgress` flag. If `store_memory` triggers while compaction is running, skip. Only one compaction runs at a time. Flag is cleared in `finally` block.

  Compaction agent configuration:
  - `permissionMode: "bypassPermissions"` with `allowDangerouslySkipPermissions: true`
  - No tools (pure text-in, text-out)
  - `maxTurns: 1` (single response)
  - `maxBudgetUsd: 0.05`
  - `settingSources: []`, `persistSession: false`

  Error handling: if compaction fails, leave memory files as-is. Log failure but don't propagate. Next `store_memory` retries. Compaction is fire-and-forget from `store_memory`'s perspective.

**Memory injection**: `loadMemories()` is called by the prompt builder in Task 012. This task provides the loading, storage, and compaction functions.

## Validation

- `loadMemories` returns empty string when no memory files exist
- `loadMemories` returns concatenated content from all memory files
- `loadMemories` sorts by mtime (most recent first)
- `loadMemories` truncates to cap when total exceeds limit (includes complete files only)
- `loadMemories` never cuts a file mid-content
- `storeMemory` writes file with correct content
- `storeMemory` overwrites existing file
- `storeMemory` creates directory if it doesn't exist
- `getTotalMemorySize` returns sum of all memory file sizes
- `getTotalMemorySize` returns 0 when no memory files exist
- `compactMemories` spawns query with all memory content in prompt
- `compactMemories` writes condensed output to `compacted.md`
- `compactMemories` removes only snapshot files after successful compaction (preserves files written during compaction)
- `compactMemories` preserves `compacted.md` from prior compactions (re-compacts it with new files)
- `compactMemories` leaves files untouched on query failure
- `compactMemories` logs failure but does not throw
- `compactMemories` skips if compaction is already in progress
- `compactMemories` clears in-progress flag after failure (doesn't permanently block)
- Compaction query uses maxTurns: 1, no tools, bypassPermissions
- All operations use injected filesystem and queryFn (no real disk or API calls in tests)
- 90%+ coverage

## Why

From `.lore/specs/phase-1/worker-dispatch.md`:
- REQ-WD-26: `store_memory` writes to plugin `memory/` directory, MAY spawn compaction query
- REQ-WD-27: Plugins maintain a `memory/` directory at plugin root, persists across jobs
- REQ-WD-28: Worker system prompt includes relevant memory content up to size cap (8000 chars default)
- REQ-WD-29: Workers write new memories via `store_memory`, key overwrites existing

## Files

- `guild-members/researcher/memory.ts` (create)
- `tests/researcher/memory.test.ts` (create)
