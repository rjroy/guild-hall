---
title: Memory Compaction
date: 2026-02-23
status: complete
tags: [task]
source: .lore/plans/phase-7-hardening.md
related: [.lore/specs/guild-hall-workers.md]
sequence: 7
modules: [guild-hall-core]
---

# Task: Memory Compaction

## What

Create `daemon/services/memory-compaction.ts` implementing fire-and-forget memory compaction triggered when `loadMemories()` (task 006) detects size exceeds the limit.

Follow the Phase 1 design (originally `.lore/_abandoned/phase-1/tasks/worker-dispatch/011-worker-memory-system.md`, deleted during archive migration):

1. **Concurrent guard**: Track `compactionInProgress` per worker+project pair. If compaction is already running for this pair, skip. Clear the flag in a `finally` block.
2. **Snapshot**: Record the list of memory files at the start of compaction. Only process files from this snapshot. Files written during compaction are left alone.
3. **SDK invocation**: Create a one-shot SDK session (`maxTurns: 1`, no tools, `maxBudgetUsd: 0.05`) with a prompt that asks it to summarize the memory entries into a condensed form. Input: the full text of all memory files from the snapshot. Output: a single summary.
4. **Write summary**: Write the summary to a `_compacted.md` file in each scope directory, replacing any prior compacted summary.
5. **Cleanup**: Remove only the files that were in the snapshot (not newer files written during compaction).

**Integration with memory-injector.ts**: When `loadMemories()` returns `needsCompaction: true`, the caller (meeting-session, commission-session) triggers compaction asynchronously. The current activation uses truncated memories (recent entries prioritized). Compaction improves the next activation.

The SDK call dependency should be injected (DI pattern) so tests can mock it. Use a `queryFn` parameter or similar seam.

Resource budget for compaction: `maxTurns: 1`, `maxBudgetUsd: 0.05`. The plan notes this needs real-workload validation before production (dispatch-hardening retro lesson).

## Validation

- Compaction triggered when `needsCompaction` is true: SDK session invoked with memory content as input.
- Concurrent guard: second compaction request for same worker+project pair is skipped while first is running.
- Snapshot isolation: files written during compaction are not included in the summary and not deleted.
- `_compacted.md` written to each scope directory after SDK returns summary.
- Only snapshot files are removed after `_compacted.md` is written.
- `finally` block clears `compactionInProgress` flag even on SDK failure.
- Fire-and-forget: calling code does not await compaction; the current activation proceeds with truncated memories.
- Unit tests with mocked SDK call, temp directories, concurrent guard behavior, snapshot isolation.

## Why

From `.lore/specs/guild-hall-workers.md`:
- REQ-WKR-23: "Compaction condenses older memories into a summary form to stay within bounds. The compaction mechanism is a separate SDK invocation, not part of the worker's own session."

From Phase 1 memory system design (deleted during archive migration): Complete prior design with concurrent guard, snapshot-based cleanup, and fire-and-forget semantics.

## Files

- `daemon/services/memory-compaction.ts` (create)
- `daemon/services/memory-injector.ts` (modify: trigger compaction when over limit)
- `daemon/services/meeting-session.ts` (modify: trigger compaction after loadMemories)
- `daemon/services/commission-session.ts` (modify: trigger compaction after loadMemories)
- `tests/daemon/memory-compaction.test.ts` (create)
