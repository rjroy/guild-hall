---
title: "Memory System Redesign: Single File Per Scope"
date: 2026-03-17
status: approved
tags: [memory, architecture, toolbox, agent-ux, file-structure]
modules: [daemon/services/memory-injector, daemon/services/memory-compaction, daemon/services/base-toolbox]
related:
  - .lore/brainstorm/memory-single-file-redesign.md
  - .lore/brainstorm/commission-outcomes-to-memory.md
  - .lore/research/agent-memory-systems.md
req-prefix: MEM
---

# Spec: Memory System Redesign

## Overview

The current memory system stores one file per memory entry per scope, with a `MEMORY.md` index and LLM-driven compaction. This creates three problems: file proliferation (20-30 files per scope over time), unreliable compaction (the LLM drops specific details that matter), and index maintenance overhead (two-step writes that can drift). The redesign collapses storage to a single markdown file per scope, replaces `write_memory` with section-level `edit_memory`, and eliminates LLM-based compaction entirely.

## Entry Points

- Worker memory directories growing to 20-30 files, triggering compaction that produces "odd results"
- The two-step `write_memory` flow (write file, then update index) drifts when one step fails
- Commission-outcomes-to-memory feature (`.lore/brainstorm/commission-outcomes-to-memory.md`) needs a clean memory write target

## Requirements

### Storage: Single File Per Scope

- REQ-MEM-1: Each scope is stored as a single markdown file:
  - Global: `~/.guild-hall/memory/global.md`
  - Project: `~/.guild-hall/memory/projects/{projectName}.md`
  - Worker: `~/.guild-hall/memory/workers/{workerName}.md`

- REQ-MEM-2: Sections within each file are delimited by `## ` headers (exactly two `#` characters followed by a space, at the start of a line). Content between one `## ` header and the next (or EOF) belongs to that section. Content before the first `## ` header is preamble and has no section name.

- REQ-MEM-3: Section names are freeform strings, not restricted to an enum. The `MEMORY_GUIDANCE` text suggests standard sections (`User`, `Feedback`, `Project`, `Reference`) but the tool accepts any non-empty section name. Validation: section names must be non-empty, must not contain newlines, and must be under 100 characters.

- REQ-MEM-4: No `MEMORY.md` index file. No `_compacted.md` summary file. The single file per scope is the complete storage and the complete index.

### Section Parser

- REQ-MEM-5: A `parseMemorySections` utility parses a markdown string into an ordered array of `{ name: string; content: string }` objects. Empty name for preamble content. `###` and deeper headers are treated as body content within their `##` section, not as section boundaries.

- REQ-MEM-6: A `renderMemorySections` utility converts an array of sections back to a markdown string. Round-trip fidelity: `renderMemorySections(parseMemorySections(input))` produces byte-identical output to input after normalizing trailing whitespace per line and ensuring a single trailing newline at EOF.

### Tool: `edit_memory`

- REQ-MEM-7: The `write_memory` tool is replaced by `edit_memory` with this schema:
  ```
  scope: "global" | "project" | "worker"
  section: string (non-empty, no newlines, < 100 chars)
  operation: "upsert" | "append" | "delete"
  content: string (required for upsert/append, ignored for delete)
  ```

- REQ-MEM-8: **Upsert** replaces the named section's content entirely. If the section does not exist, creates it at the end of the file. If the file does not exist, creates it with a single section.

- REQ-MEM-9: **Append** adds content to the end of the named section, separated by a blank line from existing content. If the section does not exist, creates it. If the file does not exist, creates it.

- REQ-MEM-10: **Delete** removes the named section and its content. If the section does not exist, returns success (idempotent). Does not delete the file even if no sections remain.

- REQ-MEM-11: After a successful write, if the file exceeds the memory limit (16,000 characters), the tool response includes a warning: "Memory file is at {N} characters ({P}% of {limit} budget). Consider condensing older entries." The write itself is not blocked. This is a per-file warning, independent of the cross-scope inject-time budget in REQ-MEM-18. An agent may never see this warning and still have sections dropped at injection if the combined content of all three scope files exceeds the limit.

- REQ-MEM-12: Section identification is case-insensitive. `edit_memory` with section "feedback" matches a `## Feedback` header. The header's original casing is preserved on match; on create, the provided casing is used.

- REQ-MEM-27: `edit_memory` rejects calls unless the current SDK session has called `read_memory` for the same scope since session start. On rejection, the tool returns the error: "Read memory before editing. Call read_memory with scope '{scope}' first." Implementation: each toolbox instance tracks a `Set<string>` of scopes that have been read via `read_memory`. The `read_memory` handler adds the scope to the set on any successful call. The `edit_memory` handler checks the set before proceeding. Since each SDK session gets its own toolbox instance, no cross-session coordination is needed. The deprecated `write_memory` alias (decision 6) is also subject to this guard.

### Tool: `read_memory`

- REQ-MEM-13: The `read_memory` tool is updated to this schema:
  ```
  scope: "global" | "project" | "worker"
  section: string (optional)
  ```

- REQ-MEM-14: Without a `section` parameter, returns the full file content. With a `section` parameter, returns only the content of that section (case-insensitive match). Returns an error message if the section does not exist. Returns "No memories saved yet." if the file does not exist.

- REQ-MEM-15: The `path` parameter is removed. There are no directories to navigate.

### Injection

- REQ-MEM-16: `loadMemories` reads one file per scope (three reads max) instead of scanning directories. The function signature remains the same: `loadMemories(workerName, projectName, deps)` returns `MemoryResult`.

- REQ-MEM-17: The `needsCompaction` field is removed from `MemoryResult`. The return type becomes `{ memoryBlock: string }`.

- REQ-MEM-18: Budget enforcement: if the combined content of all three scope files exceeds the memory limit, sections are dropped from the lowest-priority scope first (worker, then project, then global). Within a scope, the last sections in the file are dropped first. The `MEMORY_GUIDANCE` block is always included and is not counted against the budget.

- REQ-MEM-19: The injected block uses `### {ScopeName}` headings for each scope (e.g., `### Global`, `### Project: guild-hall`, `### Worker: Octavia`). Within each scope, the file content is included as-is (the `## ` section headers from the file appear as-is under the `### ` scope heading).

### Compaction Removal

- REQ-MEM-20: The `memory-compaction.ts` module is deleted. No LLM-based compaction exists in the new system. The `triggerCompaction` call site(s) are removed.

- REQ-MEM-21: The `systemModels.memoryCompaction` config field is deprecated. It may remain in the schema for backward compatibility but is unused.

### Concurrency

- REQ-MEM-22: A per-scope mutex serializes `edit_memory` writes. The mutex key is `{scope}:{scopeKey}` (e.g., `project:guild-hall`, `worker:Octavia`, `global:global`). A write acquires the mutex before reading the file and releases it after writing. The mutex is released even if the write fails (standard try/finally). This prevents lost updates when two commissions edit the same project memory concurrently.

### Migration

- REQ-MEM-23: On first read of a scope, if the single file does not exist but the legacy directory does (contains files), the system auto-migrates: reads all files from the directory, consolidates them into sections in a single file, writes the single file, and renames the old directory to `{dir}.migrated`. The migration is logged. Consolidation rules:
  - If `_compacted.md` exists, its content becomes the preamble (content before the first `## ` header). If it does not exist, there is no preamble.
  - Each remaining file becomes a `## {filename}` section, with the filename used verbatim as the section header text (including extensions like `.md`). Files are ordered alphabetically.
  - If the legacy directory is empty (no files), no migration occurs and the single file is not created.

- REQ-MEM-24: Auto-migration runs at most once per scope. The presence of the single file (even if empty) prevents re-migration. The `.migrated` directory is not deleted automatically; the user can remove it when satisfied.

- REQ-MEM-25: The `edit_memory` tool does not need to handle the legacy directory format. Migration happens on first read (via `loadMemories` or `read_memory`), and all subsequent operations use the single file.

### Guidance Update

- REQ-MEM-26: The `MEMORY_GUIDANCE` text injected into system prompts is updated to reference `edit_memory` (not `write_memory`), describe section-based organization, suggest standard section names, and explain the budget warning.

## Decisions on Open Questions

Six open questions from the brainstorm, decided here.

### 1. Migration path

**Decision:** Auto-migrate on first read.

**Rationale:** A manual migration step creates a coordination problem: every worker activation would need to check "has this scope been migrated?" and the user would need to remember to run a command. Auto-migration on first read is transparent. The one-time code path is testable (create a legacy directory in a temp dir, call `loadMemories`, assert the single file exists and the directory is renamed). The `.migrated` directory rename (rather than deletion) preserves a safety net. The code path can be removed in a future release once all installations have migrated.

### 2. Concurrent writes

**Decision:** Per-scope mutex, similar to the compaction guard pattern.

**Rationale:** Last-writer-wins risks losing a section update silently. File locking on Unix is advisory and unreliable across processes. Since all `edit_memory` calls go through the daemon process, an in-process mutex per scope key is sufficient. The pattern already exists in `memory-compaction.ts:69` (the `compactionInProgress` Map). A `Map<string, Promise<void>>` with async acquire/release serializes writes without blocking reads. The performance cost is negligible: memory writes are infrequent and fast.

### 3. Budget enforcement across scopes

**Decision:** Inject all three files; drop sections from lowest-priority scope when over budget.

**Rationale:** Per-scope hard caps force artificial limits ("your project memory can only be 6k") that don't reflect usage patterns. A worker-heavy project might have 12k of project memory and 1k of worker memory; a fixed 8k/4k/4k split would waste budget. Instead, inject everything and only drop content when the total exceeds 16k. Drop order is worker sections first (most ephemeral), then project, then global (most stable). Within a scope, drop from the end of the file, which preserves the sections the agent placed first (presumably the most important ones).

### 4. Section ordering

**Decision:** Suggest order in guidance, don't enforce it.

**Rationale:** The parser doesn't care about order. Human readers benefit from predictable order, and the `MEMORY_GUIDANCE` text can suggest: User, Feedback, Project, Reference as a starting layout. But agents creating domain-specific sections (e.g., "Song Catalog", "Research Notes") need freedom to organize as they see fit. Enforcement would require the tool to reject or reorder writes, adding complexity for no functional benefit.

### 5. Commission outcomes interaction

**Decision:** The commission completion handler appends to a "Recent Outcomes" section in project memory via `edit_memory append`. The agent manages pruning, consistent with the no-compaction principle.

**Rationale:** This follows from the commission-outcomes-to-memory brainstorm (Option A: mechanical extraction). The `handleSuccessfulCompletion` path in the orchestrator calls `edit_memory` with `operation: "append"`, `scope: "project"`, `section: "Recent Outcomes"`, and a short structured entry (worker name, date, 1-2 sentence summary, artifact paths). The section grows over time. The budget warning (REQ-MEM-11) signals when it's getting large. The Guild Master or a future curation mechanism can prune it. This keeps the commission outcomes feature entirely within the new memory system rather than requiring a parallel write path.

Note: the commission-outcomes-to-memory feature itself is out of scope for this spec. This decision only establishes that the memory system's `edit_memory append` operation is the intended write mechanism. The orchestrator integration has its own spec surface.

### 6. `write_memory` backward compatibility

**Decision:** Keep `write_memory` as a deprecated alias for one release cycle, then remove.

**Rationale:** Existing worker instructions (posture files, system prompts, cached session context) reference `write_memory`. A clean break would cause tool-not-found errors in any session that hasn't refreshed its instructions. The alias maps `write_memory(scope, path, content)` to `edit_memory(scope, section=path, operation="upsert", content=content)`, treating the old `path` parameter as a section name. This is imperfect (a path like `decisions/auth.md` becomes a section named `decisions/auth.md`), but it prevents breakage. The tool description for `write_memory` includes a deprecation notice pointing to `edit_memory`. After one release cycle (defined as: all worker packages have been updated and no active commission references `write_memory`), the alias is removed.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Commission outcomes | Memory system is stable | `.lore/brainstorm/commission-outcomes-to-memory.md` becomes specifiable |
| Worker instruction update | `edit_memory` is implemented | All posture files and `MEMORY_GUIDANCE` reference `edit_memory` |
| Migration cleanup | All installations have migrated | Remove auto-migration code path and `.migrated` directory handling |

## Success Criteria

- [ ] Memory files use single-file-per-scope layout at the paths in REQ-MEM-1
- [ ] `edit_memory` supports upsert, append, and delete on named sections
- [ ] `read_memory` returns full file or specific section content
- [ ] `loadMemories` reads three files (not directories), returns a `memoryBlock` without `needsCompaction`
- [ ] `memory-compaction.ts` is deleted; no LLM calls occur for memory management
- [ ] Concurrent `edit_memory` calls to the same scope are serialized (no lost updates)
- [ ] Legacy memory directories are auto-migrated on first read
- [ ] `write_memory` works as a deprecated alias mapping to `edit_memory upsert`
- [ ] Budget warning appears in tool response when file exceeds 16k characters
- [ ] `MEMORY_GUIDANCE` references `edit_memory` and section-based organization
- [ ] `edit_memory` rejects calls when `read_memory` has not been called for the same scope in the current session
- [ ] All existing memory tests are updated or replaced; new tests cover section parsing, edit operations, migration, and concurrency

## AI Validation

**Defaults:**
- Unit tests with mocked filesystem (temp directories)
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Round-trip test: `renderMemorySections(parseMemorySections(input)) === input` for representative inputs including preamble, empty sections, nested `###` headers
- Concurrent write test: two `edit_memory` calls to the same scope file produce a file containing both updates (no lost writes)
- Migration test: create a legacy directory with 5 files including `_compacted.md`, trigger migration via `loadMemories`, verify single file contains all content and legacy directory is renamed
- Migration test (read_memory path): create a legacy directory, call `read_memory`, verify migration is triggered and content is returned from the new single file
- Migration test (no _compacted.md): create a legacy directory without `_compacted.md`, trigger migration, verify no preamble in the resulting file
- Budget test: create a file exceeding 16k chars, verify `loadMemories` drops sections from worker scope first and includes a complete (not truncated) set of remaining sections
- Read-before-edit guard test (rejection): call `edit_memory` with scope "project" without a prior `read_memory` call for that scope, verify the tool returns the error message and does not write to the file
- Read-before-edit guard test (success after read): call `read_memory` with scope "project", then call `edit_memory` with scope "project", verify the edit succeeds. Also verify that reading scope "global" does not authorize editing scope "project" (scopes are tracked independently)

## Constraints

- Memory is a daemon-internal concern. The tools are exposed via the base toolbox MCP server. The web UI and CLI do not interact with memory directly.
- No new external dependencies. The section parser is plain string manipulation.
- The memory limit remains 16,000 characters (configurable via `deps.memoryLimit`). This spec does not change the limit.
- Atomic writes via `fs.writeFile` (write to temp, rename) are the mechanism for preventing partial writes. No backup files or automated recovery beyond this.
- The `record_decision` tool in `base-toolbox.ts` is unaffected by this change.

## Context

- **Brainstorm**: `.lore/brainstorm/memory-single-file-redesign.md` contains the six proposals that this spec codifies.
- **Research**: `.lore/research/agent-memory-systems.md` Section 5 documents why memory systems go unused (no trigger to write, no benefit to reading, generic tools). The single-file design with section-level editing addresses the "generic tools" failure mode.
- **Commission outcomes**: `.lore/brainstorm/commission-outcomes-to-memory.md` proposes writing commission results to project memory. This spec establishes `edit_memory append` as the write mechanism for that feature.
- **Current implementation**: `memory-injector.ts` reads directories and applies per-file budgets. `memory-compaction.ts` runs an SDK session to summarize overflowing files. `base-toolbox.ts` exposes `read_memory` and `write_memory` as file-system navigation tools.
