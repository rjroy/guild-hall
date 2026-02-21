---
title: Base toolbox and toolbox resolution
date: 2026-02-21
status: pending
tags: [task]
source: .lore/plans/phase-2-workers-first-audience.md
related:
  - .lore/specs/guild-hall-workers.md
  - .lore/research/claude-agent-sdk-ref-typescript.md
sequence: 4
modules: [guild-hall-core]
---

# Task: Base Toolbox and Toolbox Resolution

## What

Create the base toolbox (always-present tools for every worker) and the toolbox resolver (assembles the complete tool set for a worker activation).

**`daemon/services/base-toolbox.ts`**: Creates an in-process MCP server using `createSdkMcpServer()` with the base toolbox tools. Each tool uses the `tool()` helper with Zod schemas. Factory takes project path and meeting ID as parameters (DI).

Base toolbox tools (REQ-WKR-9):

1. `read_memory(scope, path?)`: Read from global, project, or worker memory directory. Returns file content or directory listing.
2. `write_memory(scope, path, content)`: Write to memory directory. Creates parent directories as needed.
3. `read_artifact(relativePath)`: Read artifact from active project's `.lore/`. Returns content + parsed frontmatter.
4. `write_artifact(relativePath, content)`: Write artifact content. Uses frontmatter-preserving splice from `lib/artifacts.ts`.
5. `list_artifacts(directory?)`: List artifacts in `.lore/`, optionally filtered by subdirectory.
6. `record_decision(question, decision, reasoning)`: Append decision entry to meeting log.

Memory directory structure: `~/.guild-hall/memory/{global,projects/<name>,workers/<name>}/`

All tools validate paths to prevent directory traversal. Memory tools operate on `~/.guild-hall/memory/` subdirectories. Artifact tools operate on the project's `.lore/` path.

**Phase 2 scope note**: Memory access is permissive (any worker reads/writes any scope). REQ-SYS-20's worker-memory ownership restriction deferred to Phase 7.

**`daemon/services/toolbox-resolver.ts`**: `resolveToolSet(worker, packages, context)`:

1. Start with base toolbox MCP server (always present)
2. Context toolbox slot (empty in Phase 2; meeting toolbox in Phase 3, commission toolbox in Phase 4)
3. Resolve domain toolboxes: for each name in `worker.domainToolboxes`, find matching toolbox package. If any missing, throw with clear error (REQ-WKR-13).
4. Collect built-in tool names from `worker.builtInTools`.

Returns `ResolvedToolSet` (type defined in Task 003).

**SDK type verification**: The exact type returned by `createSdkMcpServer()` depends on the installed SDK version. Verify against actual package exports during implementation. Define a local interface if the SDK type is internal.

## Validation

- Base toolbox: read/write memory across all three scopes
- Base toolbox: read/write artifacts with frontmatter preservation
- Base toolbox: decision recording appends to meeting log
- Path traversal rejected in memory tools (e.g., `../../etc/passwd`)
- Path traversal rejected in artifact tools
- Memory directories created on first write
- Toolbox resolution: base only (worker with no domain toolboxes)
- Toolbox resolution: base + domain toolbox
- Toolbox resolution: missing domain toolbox fails with clear error naming the missing package
- Built-in tool list assembled correctly from worker metadata

## Why

From `.lore/specs/guild-hall-workers.md`:
- REQ-SYS-5: Toolbox kinds (built-in + extension)
- REQ-WKR-6: Toolbox provides named tool definitions
- REQ-WKR-6a: Toolbox exports tool collection
- REQ-WKR-8: System toolboxes injected by context
- REQ-WKR-9: Base toolbox (memory, artifact, decision tools)
- REQ-WKR-12: Toolbox resolution combines base + context + domain + built-in
- REQ-WKR-13: Missing domain toolbox fails activation

## Files

- `daemon/services/base-toolbox.ts` (create)
- `daemon/services/toolbox-resolver.ts` (create)
- `lib/types.ts` (modify if ResolvedToolSet needs refinement after SDK verification)
- `tests/daemon/base-toolbox.test.ts` (create)
- `tests/daemon/toolbox-resolver.test.ts` (create)
