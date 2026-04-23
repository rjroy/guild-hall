---
title: "Memory Single-File Redesign"
date: 2026-03-17
status: executed
tags: [memory, architecture, toolbox, agent-ux, migration]
modules: [apps/daemon/services/memory-injector, apps/daemon/services/memory-compaction, apps/daemon/services/base-toolbox, apps/daemon/lib/agent-sdk/sdk-runner, apps/daemon/services/meeting/orchestrator, apps/daemon/app]
related:
  - .lore/specs/infrastructure/memory-single-file-redesign.md
  - .lore/brainstorm/memory-single-file-redesign.md
  - .lore/brainstorm/commission-outcomes-to-memory.md
  - .lore/research/agent-memory-systems.md
---

# Plan: Memory Single-File Redesign

## Context

The current memory system stores one file per memory entry per scope, with a `MEMORY.md` index and LLM-driven compaction. This causes file proliferation, unreliable compaction (LLM drops specific details), and index drift. The spec at `.lore/specs/infrastructure/memory-single-file-redesign.md` defines 27 requirements to collapse storage to a single markdown file per scope, replace `write_memory` with section-level `edit_memory`, and remove LLM-based compaction entirely.

### Current Implementation Surface

| File | Role | Lines |
|------|------|-------|
| `apps/daemon/services/memory-injector.ts` | `loadMemories`, `memoryScopeDir`, `MEMORY_GUIDANCE`, budget logic | ~260 |
| `apps/daemon/services/memory-compaction.ts` | `triggerCompaction`, `runCompaction`, SDK-based summarization | ~355 |
| `apps/daemon/services/base-toolbox.ts` | `read_memory`, `write_memory`, `record_decision` MCP tools | ~186 |
| `apps/daemon/lib/agent-sdk/sdk-runner.ts` | Calls `loadMemories`, conditionally calls `triggerCompaction` (lines 383-394) | consumer |
| `apps/daemon/services/meeting/orchestrator.ts` | Wires `triggerCompaction` into session prep deps (lines 419-427) | consumer |
| `apps/daemon/services/manager/context.ts` | Type signature for `loadMemoriesFn`, compaction trigger (line 339) | consumer |
| `apps/daemon/app.ts` | Production wiring: imports `triggerCompaction`, passes to session deps (lines 183-343) | consumer |

### Existing Test Files

| File | Coverage |
|------|----------|
| `apps/daemon/tests/memory-injection.test.ts` | `loadMemories`, budget enforcement, scope directory reading |
| `apps/daemon/tests/memory-compaction.test.ts` | Top-level compaction tests |
| `apps/daemon/tests/services/memory-compaction.test.ts` | Detailed compaction service tests |
| `apps/daemon/tests/memory-access-control.test.ts` | Scope isolation, path validation |
| `apps/daemon/tests/base-toolbox.test.ts` | Tool handler tests for read/write/record_decision |

### Dependency Graph (what calls what)

```
loadMemories (memory-injector.ts)
  ← sdk-runner.ts:383 (prepareSdkSession)
  ← manager/context.ts (loadMemoriesFn type)

triggerCompaction (memory-compaction.ts)
  ← sdk-runner.ts:389 (conditional, after loadMemories)
  ← meeting/orchestrator.ts:421 (wired from deps.queryFn)
  ← app.ts:183 (production import and wiring)

memoryScopeDir (memory-injector.ts)
  ← memory-compaction.ts (reads/writes scope directories)
  ← base-toolbox.ts (resolves tool paths)

needsCompaction (MemoryResult field)
  ← sdk-runner.ts:389 (conditional check)
  ← manager/context.ts:59 (type signature)
  ← meeting/orchestrator.ts:415 (fallback value)
```

## Approach

Five phases, ordered by dependency. The section parser is a pure utility with no dependencies, so it goes first. The tools build on the parser. Injection rewrites build on the new file layout. Compaction removal and migration come last because they clean up the old system after the new one is functional. Each phase is independently testable.

The `write_memory` deprecation alias (spec decision 6) is handled alongside `edit_memory` in Phase 2, since it's a thin mapping from old to new.

## Phase 1: Section Parser

**Goal:** Build the pure parsing/rendering utility that all other phases depend on.

**REQs:** REQ-MEM-2, REQ-MEM-5, REQ-MEM-6

**Risk:** Low. Pure string manipulation, no side effects, no integration points.

### Step 1.1: Create `apps/daemon/services/memory-sections.ts`

New file with two exported functions:

```typescript
type MemorySection = { name: string; content: string };

function parseMemorySections(markdown: string): MemorySection[];
function renderMemorySections(sections: MemorySection[]): string;
```

Parsing rules (from REQ-MEM-2, REQ-MEM-5):
- Split on `## ` at line start (exactly two `#` followed by space)
- Content before first `## ` is preamble (empty `name`)
- `###` and deeper are body content, not boundaries
- Section name is the text after `## ` on the header line

Rendering rules (from REQ-MEM-6):
- Round-trip fidelity after normalizing trailing whitespace per line and single trailing newline at EOF

### Step 1.2: Tests for section parser

**File:** `apps/daemon/tests/services/memory-sections.test.ts`

Test cases:
- Empty string produces empty array
- Single preamble (no `## ` headers) produces one entry with empty name
- Multiple sections with content between them
- Sections with `###` subheaders (must stay as body content)
- Round-trip: `render(parse(input)) === input` for representative inputs
- Sections with empty content (header immediately followed by next header)
- Content with `## ` appearing mid-line (not at start, should not split)
- Trailing whitespace normalization

**Verification:** `bun test apps/daemon/tests/services/memory-sections.test.ts`

---

## Phase 2: `edit_memory` and `read_memory` Rewrite

**Goal:** Replace the file-system navigation tools with section-based operations.

**REQs:** REQ-MEM-1, REQ-MEM-3, REQ-MEM-7, REQ-MEM-8, REQ-MEM-9, REQ-MEM-10, REQ-MEM-11, REQ-MEM-12, REQ-MEM-13, REQ-MEM-14, REQ-MEM-15, REQ-MEM-22, REQ-MEM-27

**Risk:** Medium. This is the largest phase. The tool schema changes, the file paths change, and concurrency control is new. The `write_memory` alias adds a compatibility surface.

### Step 2.1: Update `memoryScopeDir` to `memoryScopeFile`

In `memory-injector.ts`, add a new helper (or rename) that returns single-file paths per REQ-MEM-1:
- Global: `~/.guild-hall/memory/global.md`
- Project: `~/.guild-hall/memory/projects/{projectName}.md`
- Worker: `~/.guild-hall/memory/workers/{workerName}.md`

Keep the old `memoryScopeDir` temporarily (migration needs it). Export both.

### Step 2.2: Implement per-scope mutex

Create a `MemoryMutex` utility (can live in `memory-sections.ts` or a small `memory-mutex.ts`). Pattern from REQ-MEM-22:

```typescript
const locks = new Map<string, Promise<void>>();

async function withMemoryLock<T>(key: string, fn: () => Promise<T>): Promise<T>;
```

Key format: `{scope}:{scopeKey}` (e.g., `project:guild-hall`, `worker:Octavia`, `global:global`).

### Step 2.3: Rewrite `read_memory` handler

In `base-toolbox.ts`, update the `read_memory` tool:
- Remove `path` parameter (REQ-MEM-15)
- Add optional `section` parameter (REQ-MEM-13)
- Resolve scope to single file via `memoryScopeFile`
- Without `section`: return full file content (REQ-MEM-14)
- With `section`: parse sections, case-insensitive match (REQ-MEM-12), return section content or error
- File not found: return "No memories saved yet." (REQ-MEM-14)
- Track the scope in a per-toolbox `readScopes: Set<string>` for REQ-MEM-27

### Step 2.4: Implement `edit_memory` handler

New tool in `base-toolbox.ts` (REQ-MEM-7):

Schema:
```
scope: "global" | "project" | "worker"
section: string (non-empty, no newlines, < 100 chars)
operation: "upsert" | "append" | "delete"
content: string (required for upsert/append)
```

Implementation:
1. Check read-before-write guard: reject if scope not in `readScopes` set (REQ-MEM-27)
2. Validate section name (REQ-MEM-3)
3. Acquire mutex for scope key (REQ-MEM-22)
4. Read file (or empty string if not found)
5. Parse sections
6. Apply operation:
   - **Upsert** (REQ-MEM-8): replace matching section content or append new section
   - **Append** (REQ-MEM-9): add content to existing section (blank line separator) or create
   - **Delete** (REQ-MEM-10): remove section, idempotent
7. Render sections
8. Write file atomically via temp-file-then-rename pattern (write to `{scopeFile}.tmp`, then `fs.rename` to `scopeFile`; create parent dirs if needed). This is the mechanism specified in the spec's Constraints section for preventing partial writes.
9. Check character count, include budget warning if over 16k (REQ-MEM-11)
10. Release mutex (try/finally)

Section matching is case-insensitive; original casing preserved on match, provided casing used on create (REQ-MEM-12).

### Step 2.5: `write_memory` deprecation alias

Map the old `write_memory(scope, path, content)` to `edit_memory(scope, section=path, operation="upsert", content=content)` per spec decision 6. Subject to the same read-before-write guard (REQ-MEM-27). Include deprecation notice in tool description.

### Step 2.6: Tests for tools

**File:** Update `apps/daemon/tests/base-toolbox.test.ts` and `apps/daemon/tests/memory-access-control.test.ts`

Test cases for `edit_memory`:
- Upsert creates file and section when neither exists
- Upsert replaces existing section content
- Upsert creates new section in existing file
- Append to existing section (blank line separator)
- Append creates section if missing
- Delete removes section
- Delete is idempotent (missing section returns success)
- Section name validation (empty, newlines, over 100 chars)
- Case-insensitive matching preserves original casing
- Budget warning when file exceeds 16k
- Concurrent writes: two upserts to same scope produce file with both updates (REQ-MEM-22)
- Atomic write mechanism: verify write goes through temp file, not direct to scope file (mock `fs.rename` or check temp path usage)

Test cases for `read_memory`:
- Full file read (no section param)
- Section read (case-insensitive)
- Section not found error
- File not found: "No memories saved yet."

Test cases for read-before-write guard (REQ-MEM-27):
- `edit_memory` rejected when `read_memory` not called for that scope
- `edit_memory` succeeds after `read_memory` for same scope
- Reading scope A does not authorize editing scope B
- `write_memory` alias also subject to guard

Test cases for `write_memory` alias:
- Maps to upsert correctly
- Path parameter becomes section name

**Verification:** `bun test apps/daemon/tests/base-toolbox.test.ts apps/daemon/tests/memory-access-control.test.ts`

---

## Phase 3: Injection Rewrite

**Goal:** Update `loadMemories` to read single files instead of directories. Remove `needsCompaction` from the return type. Update budget enforcement to drop sections instead of files. Update `MEMORY_GUIDANCE`.

**REQs:** REQ-MEM-16, REQ-MEM-17, REQ-MEM-18, REQ-MEM-19, REQ-MEM-26

**Risk:** Medium. The return type change propagates to `sdk-runner.ts`, `manager/context.ts`, and `meeting/orchestrator.ts`. Budget enforcement changes from file-level to section-level.

### Step 3.1: Rewrite `loadMemories`

In `memory-injector.ts`:
- Read three single files (not directories) per REQ-MEM-16
- Return `{ memoryBlock: string }` without `needsCompaction` (REQ-MEM-17)
- Budget enforcement (REQ-MEM-18): if combined content exceeds limit, drop sections from worker scope first (last sections first), then project, then global
- Format injected block with `### {ScopeName}` headings (REQ-MEM-19): `### Global`, `### Project: {name}`, `### Worker: {name}`. File content (with its `## ` headers) appears under the scope heading as-is.
- `MEMORY_GUIDANCE` always included, not counted against budget (REQ-MEM-18)

### Step 3.2: Update `MEMORY_GUIDANCE`

Per REQ-MEM-26, rewrite the guidance text to:
- Reference `edit_memory` (not `write_memory`)
- Describe section-based organization
- Suggest standard section names (User, Feedback, Project, Reference)
- Explain the budget warning
- Mention that `write_memory` still works but is deprecated

### Step 3.3: Update consumers of `loadMemories` return type

Remove `needsCompaction` from type signatures and conditional logic:

| File | Change |
|------|--------|
| `apps/daemon/lib/agent-sdk/sdk-runner.ts:127` | Remove `needsCompaction` from return type |
| `apps/daemon/lib/agent-sdk/sdk-runner.ts:134-138` | Remove `triggerCompaction` from `SessionPrepDeps` |
| `apps/daemon/lib/agent-sdk/sdk-runner.ts:389-394` | Remove compaction trigger block |
| `apps/daemon/services/manager/context.ts:59` | Remove `needsCompaction` from type signature |
| `apps/daemon/services/manager/context.ts:339` | Remove compaction trigger conditional |
| `apps/daemon/services/meeting/orchestrator.ts:415` | Remove `needsCompaction: false` from fallback |
| `apps/daemon/services/meeting/orchestrator.ts:419-427` | Remove `triggerCompaction` wiring |

### Step 3.4: Remove compaction wiring from `app.ts`

Remove the `triggerCompaction` import (line 183-185) and the production wiring that passes it to session deps (lines 335-343).

### Step 3.5: Update injection tests

**File:** `apps/daemon/tests/memory-injection.test.ts`

Rewrite tests to:
- Use single-file fixtures instead of directory fixtures
- Verify `### ScopeName` heading format in output
- Verify section-level budget enforcement (drop worker sections first, last-in-file first). Assert remaining sections are complete, not truncated mid-content. Use multi-scope fixtures with realistic content.
- Verify `MEMORY_GUIDANCE` not counted against budget
- Remove all `needsCompaction` assertions

Also update any other test files that reference `needsCompaction` or `triggerCompaction` in their fixtures:
- `apps/daemon/tests/services/sdk-runner.test.ts`
- `apps/daemon/tests/services/briefing-generator.test.ts`
- `apps/daemon/tests/services/commission/orchestrator.test.ts`
- `apps/daemon/tests/services/mail/orchestrator.test.ts`
- `apps/daemon/tests/integration-commission.test.ts`

**Verification:** `bun test` (full suite, since type changes propagate widely)

---

## Phase 4: Migration

**Goal:** Auto-migrate legacy directory-based storage to single-file on first read.

**REQs:** REQ-MEM-4, REQ-MEM-23, REQ-MEM-24, REQ-MEM-25

**Risk:** Medium. File system operations (read directory, write file, rename directory) need careful error handling. The migration path is one-way.

### Step 4.1: Implement migration in `memory-injector.ts`

Add a `migrateIfNeeded(scopeFile, legacyDir, deps)` function:

1. If `scopeFile` exists, return immediately (REQ-MEM-24: single file presence prevents re-migration)
2. If legacy directory doesn't exist or is empty, return (no migration for empty directories, REQ-MEM-23)
3. Read all files from legacy directory, excluding `MEMORY.md` and `_compacted.md` from the section list (REQ-MEM-4: no index file concept in the new system)
4. Build sections per REQ-MEM-23:
   - `_compacted.md` content becomes preamble (no `## ` header)
   - `MEMORY.md` is skipped entirely (it was an index, not content)
   - Each remaining file becomes `## {filename}` section, alphabetical order
5. Render sections, write to `scopeFile` (atomic write, create parent dirs)
6. Rename legacy directory to `{dir}.migrated`
7. Log the migration

Call `migrateIfNeeded` at the start of both `loadMemories` (for each scope) and `read_memory` (for the requested scope).

### Step 4.2: Clean up `memoryScopeDir`

After migration is wired in, the old `memoryScopeDir` is only needed by migration itself. Make it private or inline it into `migrateIfNeeded`. Remove any external imports that relied on it (memory-compaction.ts will be deleted in Phase 5).

### Step 4.3: Migration tests

**File:** `apps/daemon/tests/services/memory-migration.test.ts` (new)

Test cases:
- Legacy directory with 5 files including `_compacted.md`: verify single file has preamble + 4 alphabetical sections, legacy dir renamed to `.migrated`
- Legacy directory with `MEMORY.md` present: verify `MEMORY.md` is excluded from sections (REQ-MEM-4)
- Legacy directory without `_compacted.md`: verify no preamble
- Empty legacy directory: no migration, no single file created
- Single file already exists: no migration (even if legacy dir exists)
- Migration via `loadMemories`: triggers migration, returns content from new file
- Migration via `read_memory`: triggers migration, returns content from new file
- Concurrent migration attempts: second caller sees the single file and skips

**Verification:** `bun test apps/daemon/tests/services/memory-migration.test.ts`

---

## Phase 5: Compaction Removal

**Goal:** Delete `memory-compaction.ts` and remove all remaining references.

**REQs:** REQ-MEM-20, REQ-MEM-21

**Risk:** Low. By this phase, all consumers have been updated (Phase 3 removed the call sites). This is cleanup.

### Step 5.1: Delete `apps/daemon/services/memory-compaction.ts`

Remove the file entirely per REQ-MEM-20.

### Step 5.2: Delete compaction test files

Remove:
- `apps/daemon/tests/memory-compaction.test.ts`
- `apps/daemon/tests/services/memory-compaction.test.ts`

### Step 5.3: Deprecate `systemModels.memoryCompaction` config field

Per REQ-MEM-21: leave the field in the Zod schema for backward compatibility but mark it as deprecated in the type definition. Add a comment that it's unused.

### Step 5.4: Remove stale imports

Grep for any remaining references to `memory-compaction`, `triggerCompaction`, `needsCompaction`, or `compactFn` across the codebase. Remove or update each one. Check:
- `apps/daemon/services/meeting/orchestrator.ts` (import statement at line 83)
- Any test fixtures that still reference compaction

### Step 5.5: Verify clean build

**Verification:** `bun run typecheck && bun run lint && bun test`

---

## Files Modified (Summary)

| File | Change |
|------|--------|
| `apps/daemon/services/memory-sections.ts` | **New.** Section parser and renderer |
| `apps/daemon/services/memory-injector.ts` | Rewrite `loadMemories` for single-file reads, add `memoryScopeFile`, add `migrateIfNeeded`, update `MEMORY_GUIDANCE`, remove `needsCompaction` from return type |
| `apps/daemon/services/memory-compaction.ts` | **Deleted.** |
| `apps/daemon/services/base-toolbox.ts` | Replace `write_memory` with `edit_memory` (keep deprecated alias), rewrite `read_memory`, add per-toolbox `readScopes` tracking, add mutex usage |
| `apps/daemon/lib/agent-sdk/sdk-runner.ts` | Remove `triggerCompaction` from deps type, remove compaction trigger block, update `loadMemories` return type |
| `apps/daemon/services/meeting/orchestrator.ts` | Remove `triggerCompaction` import and wiring, update `loadMemories` fallback type |
| `apps/daemon/services/manager/context.ts` | Remove `needsCompaction` from type, remove compaction trigger |
| `apps/daemon/app.ts` | Remove `triggerCompaction` import and production wiring |
| `apps/daemon/tests/services/memory-sections.test.ts` | **New.** Parser/renderer tests |
| `apps/daemon/tests/services/memory-migration.test.ts` | **New.** Migration tests |
| `apps/daemon/tests/base-toolbox.test.ts` | Rewrite for `edit_memory`, updated `read_memory`, guard tests |
| `apps/daemon/tests/memory-access-control.test.ts` | Update for new tool schemas |
| `apps/daemon/tests/memory-injection.test.ts` | Rewrite for single-file, section-level budget |
| `apps/daemon/tests/memory-compaction.test.ts` | **Deleted.** |
| `apps/daemon/tests/services/memory-compaction.test.ts` | **Deleted.** |
| `apps/daemon/tests/services/sdk-runner.test.ts` | Remove compaction-related fixtures |
| `apps/daemon/tests/services/briefing-generator.test.ts` | Update `loadMemories` mock return type |
| `apps/daemon/tests/services/commission/orchestrator.test.ts` | Update `loadMemories` mock return type |
| `apps/daemon/tests/services/mail/orchestrator.test.ts` | Update `loadMemories` mock return type |
| `apps/daemon/tests/integration-commission.test.ts` | Update `loadMemories` mock return type |

## What Stays

- `record_decision` tool in `base-toolbox.ts` is unaffected
- Memory limit constant (16,000 chars) is unchanged
- DI pattern: all functions take deps objects with defaults
- `memoryScopeDir` stays as a private helper for migration only (Phase 4)
- `systemModels.memoryCompaction` stays in schema as deprecated (REQ-MEM-21)

## Delegation Guide

### Phase Sequencing

Phases 1 through 5 are strictly sequential. Each phase depends on the prior phase's output:
- Phase 2 imports `parseMemorySections`/`renderMemorySections` from Phase 1
- Phase 3 depends on Phase 2's file path helpers (`memoryScopeFile`)
- Phase 4 depends on Phase 3's `loadMemories` rewrite (migration must feed into the new reader)
- Phase 5 depends on Phase 3 having removed all compaction call sites

### Within-Phase Parallelism

- **Phase 1:** Steps 1.1 and 1.2 can be developed together (write code and tests simultaneously)
- **Phase 2:** Steps 2.1 and 2.2 are independent. Steps 2.3-2.5 are sequential (each builds on the prior). Step 2.6 can begin after 2.3.
- **Phase 3:** Steps 3.1 and 3.2 are independent. Steps 3.3 and 3.4 depend on 3.1. Step 3.5 depends on all prior steps.
- **Phase 4:** Steps 4.1-4.3 are sequential.
- **Phase 5:** Steps 5.1-5.4 can run in parallel. Step 5.5 depends on all prior steps.

### Single-Agent Recommendation

Phases 1 and 2 together carry the highest design risk (the parser contract and tool schema shape everything downstream). A single agent should handle Phases 1-2 to keep the API surface consistent. Phases 3-5 can be handled by a separate agent if needed, but a single agent through all five phases avoids handoff overhead on a codebase this size.

## Review Strategy

| After | Reviewer | Focus |
|-------|----------|-------|
| Phase 1 | code-reviewer | Round-trip fidelity of parser. Edge cases: empty input, `## ` mid-line, `###` as body. |
| Phase 2 | code-reviewer | Tool schema correctness against REQ-MEM-7 through REQ-MEM-12, REQ-MEM-27. Mutex acquire/release in all code paths. Deprecation alias mapping. |
| Phase 3 | code-reviewer | Type propagation: every file that referenced `needsCompaction` or `triggerCompaction` must be updated. Budget enforcement drops sections (not files). `MEMORY_GUIDANCE` text accuracy. |
| Phase 5 | code-reviewer (fresh context) | Full codebase grep for stale references to compaction, `write_memory`, old directory paths, `needsCompaction`. Verify the spec's success criteria checklist item by item. |
| Final | spec-reviewer | Compare implementation against all 27 REQs. Verify AI Validation test cases from the spec are covered. |

The Phase 5 review uses fresh context because by that point the implementing agent has been deep in the code for four phases. A reviewer without that accumulated context will catch stale references and naming inconsistencies that the implementer's eye slides over.

## Open Questions

None. The spec resolved all six open questions from the brainstorm. The plan follows those decisions.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Phase 3 type propagation misses a consumer | Medium | Build break (caught by typecheck) | `bun run typecheck` after Phase 3; grep for `needsCompaction` |
| Migration races with concurrent reads | Low | Duplicate migration attempt | `migrateIfNeeded` checks file existence first; second caller sees file and skips |
| Budget enforcement drops wrong sections | Medium | Agent loses important context | Test with specific multi-scope fixtures; verify drop order matches spec |
| Deprecated `write_memory` alias surprises agents | Low | Unexpected section names (paths as names) | Documented in spec decision 6; alias is temporary |
