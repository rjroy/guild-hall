---
title: Memory Injection
date: 2026-02-23
status: complete
tags: [task]
source: .lore/plans/phase-7-hardening.md
related: [.lore/specs/guild-hall-workers.md]
sequence: 6
modules: [guild-hall-core]
---

# Task: Memory Injection

## What

Create `daemon/services/memory-injector.ts` with `loadMemories(workerName, projectName, deps)`:

1. Read all files from three scopes:
   - `~/.guild-hall/memory/global/` (all files)
   - `~/.guild-hall/memory/projects/{projectName}/` (all files)
   - `~/.guild-hall/memory/workers/{workerName}/` (all files)
2. Sort entries: recent files first (by mtime).
3. Assemble into a markdown block: `## Memories\n### Global\n...\n### Project: {name}\n...\n### Worker: {name}\n...`
4. Check total character count against the size limit (default 8000, from config).
5. If under limit, return the full block.
6. If over limit, truncate older entries to fit, then flag for compaction (return a `needsCompaction: boolean` alongside the memory block).

**Wire into activation paths:**
- `daemon/services/meeting-session.ts`: Call `loadMemories()` during meeting creation and acceptance. Inject the result into the system prompt alongside the worker's posture.
- `daemon/services/commission-session.ts`: Call `loadMemories()` during dispatch. Inject the result into the system prompt alongside the worker's posture.
- `daemon/services/manager-context.ts`: `buildManagerContext()` already assembles context with 8000 char truncation. Use `loadMemories()` for the manager's worker name to provide memory alongside the existing context.

**Config** (`lib/config.ts`): Add `memoryLimit?: number` to `ProjectConfig` schema (optional, default 8000).

Use the DI pattern: `loadMemories` accepts a filesystem dependency (or path dependency) for testability.

## Validation

- Empty memory directories: returns empty markdown block, `needsCompaction: false`.
- Files in all three scopes: assembled into correct markdown structure with scope headers.
- Files sorted by mtime (most recent first within each scope).
- Total under limit: full block returned, `needsCompaction: false`.
- Total over limit: older entries truncated to fit, `needsCompaction: true`.
- Truncation never cuts a file mid-content (soft cap: either include a file or don't).
- Memory block is injected into meeting session system prompts on creation/acceptance.
- Memory block is injected into commission session system prompts on dispatch.
- Memory block is injected into manager context alongside existing context.
- Config `memoryLimit` field validates and defaults to 8000.
- Unit tests with temp memory directories, varying file counts and sizes, covering: empty, under-limit, over-limit, truncation behavior, all three scopes.

## Why

From `.lore/specs/guild-hall-workers.md`:
- REQ-WKR-22: "When activating a worker, Guild Hall loads relevant memories from all accessible scopes (global, project for the active workspace, worker-private) and injects them into the system prompt."
- REQ-WKR-23: "Memory injection respects a configurable size limit (default: 8000 tokens estimated by character count). When accumulated memory exceeds the limit, recent entries take priority."

## Files

- `daemon/services/memory-injector.ts` (create)
- `daemon/services/meeting-session.ts` (modify: inject memories on activation)
- `daemon/services/commission-session.ts` (modify: inject memories on dispatch)
- `daemon/services/manager-context.ts` (modify: use loadMemories for manager)
- `lib/config.ts` (modify: add memoryLimit field)
- `tests/daemon/memory-injection.test.ts` (create)
