---
title: "Commission: Memory redesign: Review Phases 1-2"
date: 2026-03-18
status: completed
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the implementation of Phases 1-2 from `.lore/plans/infrastructure/memory-single-file-redesign.md`.\n\nFocus areas from the plan's review strategy:\n- **Phase 1:** Round-trip fidelity of parser. Edge cases: empty input, `## ` mid-line, `###` as body content.\n- **Phase 2:** Tool schema correctness against REQ-MEM-7 through REQ-MEM-12, REQ-MEM-27. Mutex acquire/release in all code paths (including error paths). Deprecation alias mapping. Atomic write mechanism.\n\nThe spec is at `.lore/specs/infrastructure/memory-single-file-redesign.md`. Check every REQ covered by these phases.\n\nRun typecheck, lint, and full test suite. Report findings with severity and file/line references."
dependencies:
  - commission-Dalton-20260318-063248
linked_artifacts:
  - daemon/services/memory-sections.ts

  - daemon/services/base-toolbox.ts
  - daemon/services/memory-injector.ts
  - tests/daemon/services/memory-sections.test.ts
  - tests/daemon/base-toolbox.test.ts
  - tests/daemon/memory-access-control.test.ts
  - daemon/services/base-toolbox.ts
  - daemon/services/memory-injector.ts
  - tests/daemon/services/memory-sections.test.ts
  - tests/daemon/base-toolbox.test.ts
  - tests/daemon/memory-access-control.test.ts
activity_timeline:
  - timestamp: 2026-03-18T13:32:56.203Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T13:32:56.205Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-18T13:40:01.747Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-18T13:40:01.750Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-18T13:40:01.789Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-18T13:40:09.405Z
    event: progress_report
    reason: "Starting review. Reading spec, plan, and dependency commission output."
  - timestamp: 2026-03-18T13:40:25.966Z
    event: progress_report
    reason: "Read all implementation files. Now reading the test files, then running typecheck/lint/tests."
  - timestamp: 2026-03-18T13:41:27.910Z
    event: progress_report
    reason: "Typecheck, lint, and all 2961 tests pass. Now performing detailed code review against spec REQs."
  - timestamp: 2026-03-18T13:44:09.156Z
    event: progress_report
    reason: "Code review complete. Compiling findings for submission."
  - timestamp: 2026-03-18T13:44:48.815Z
    event: result_submitted
    reason: "## Review: Memory Redesign Phases 1-2\n\n**Build status:** Typecheck clean, lint clean, 2961 tests pass.\n\n---\n\n### Finding 1: `read_memory` tool description is stale (HIGH)\n\n**File:** `daemon/services/base-toolbox.ts:322`\n\nThe tool description still says: *\"If path is a directory, lists contents. If path is a file, returns content. If path omitted, lists the scope root.\"*\n\nThe `path` parameter was removed (REQ-MEM-15). The new behavior uses an optional `section` parameter. The description tells agents about capabilities that don't exist and omits the ones that do. An agent reading this description would try to pass a `path` parameter, get confused by the mismatch, and have no guidance on how `section` works.\n\n**Fix:** Replace the last three sentences with description of the new behavior: without `section`, returns full file content; with `section`, returns that section's content (case-insensitive match).\n\n---\n\n### Finding 2: Round-trip fidelity fails for `## ` (empty header name) (MEDIUM)\n\n**File:** `daemon/services/memory-sections.ts:32,40`\n\nWhen a line is exactly `## ` (two hashes, space, nothing else), `line.slice(3)` yields `\"\"`. This creates a section with name `\"\"`, which is the same sentinel value used for preamble. On render, both are emitted without a `## ` header, so the original `## ` line is lost.\n\nDemonstrated: `parseMemorySections(\"## \\nContent\\n\")` → `[{name: \"\", content: \"Content\\n\"}]`. Re-rendering produces `\"Content\\n\"`, dropping the `## ` header entirely. This violates REQ-MEM-6 (round-trip fidelity).\n\nWith preamble + empty header, two sections share name `\"\"`, and the renderer joins them without a boundary, losing structure.\n\n**Impact:** Only affects hand-edited files or migrated files that happen to contain a bare `## ` header. The `edit_memory` tool prevents creating empty-named sections (REQ-MEM-3 validation). Unlikely to occur in practice, but the spec requires round-trip fidelity without this caveat.\n\n**Fix:** Either treat `## ` (empty name after trimming) as body content rather than a section boundary, or use a distinct sentinel (e.g., `null`) for preamble to avoid collision.\n\n---\n\n### Finding 3: `read_memory` returns \"No memories saved yet.\" for empty files (LOW)\n\n**File:** `daemon/services/base-toolbox.ts:96`\n\nAfter deleting all sections from a file, the file still exists (empty string written, satisfying REQ-MEM-10's \"does not delete the file\" requirement). But `readScopeFile` returns `\"\"` for this file, and the handler treats `content === \"\"` as the \"no file\" case, returning \"No memories saved yet.\"\n\nREQ-MEM-14 says this message is for when \"the file does not exist.\" An empty file does exist. The behavior is sensible (empty and absent are functionally equivalent for memory), but it's technically inconsistent with the spec wording.\n\n**Impact:** Negligible. An agent that deletes all sections and then reads gets a reasonable message. No action required unless spec precision matters.\n\n---\n\n### Finding 4: Phases 2-3 gap leaves tools and injection reading different locations (INFO)\n\nThe Phase 2 tools (`read_memory`, `edit_memory`) write to single-file paths (`global.md`, `projects/{name}.md`, `workers/{name}.md`). The `loadMemories` function (which injects memory into system prompts) still reads from the legacy directory layout. Memory written via the new tools is invisible to prompt injection until Phase 3 rewrites `loadMemories`.\n\nThis is expected by the plan's phase sequencing and is not a bug, provided all phases ship together. Flagged to ensure Phase 3 does not get deferred independently.\n\n---\n\n### REQ Compliance Summary\n\n| REQ | Status | Notes |\n|-----|--------|-------|\n| REQ-MEM-1 | PASS | `memoryScopeFile` returns correct paths |\n| REQ-MEM-2 | PASS | Parser splits on `## ` at line start, `###` stays as body |\n| REQ-MEM-3 | PASS | Section name validation: non-empty, no newlines, under 100 chars |\n| REQ-MEM-5 | PASS | `parseMemorySections` returns correct type, handles preamble |\n| REQ-MEM-6 | PARTIAL | Round-trip fidelity holds except for bare `## ` (empty header name) edge case. See Finding 2. |\n| REQ-MEM-7 | PASS | `edit_memory` schema matches spec (scope, section, operation, content) |\n| REQ-MEM-8 | PASS | Upsert replaces existing or appends new section |\n| REQ-MEM-9 | PASS | Append uses blank line separator, creates if missing |\n| REQ-MEM-10 | PASS | Delete removes section, idempotent, file preserved when empty |\n| REQ-MEM-11 | PASS | Budget warning at 16k with character count and percentage |\n| REQ-MEM-12 | PASS | Case-insensitive match, original casing preserved, provided casing on create |\n| REQ-MEM-13 | PARTIAL | Schema correct (scope + optional section). Tool description is stale. See Finding 1. |\n| REQ-MEM-14 | PARTIAL | Behavior correct. \"No memories saved yet.\" also returned for empty files, not just missing. See Finding 3. |\n| REQ-MEM-15 | PASS | `path` parameter removed from schema |\n| REQ-MEM-22 | PASS | Per-scope mutex with correct key format, released in try/finally, tested for error recovery |\n| REQ-MEM-27 | PASS | Read-before-write guard per toolbox instance, applies to both `edit_memory` and `write_memory` alias |\n\n### Test Coverage Assessment\n\nTests cover all plan Step 2.6 cases: upsert/append/delete operations, section validation, case-insensitive matching, budget warning, concurrent writes, atomic write mechanism, read-before-write guard (rejection, success, cross-scope isolation), write_memory alias mapping. Round-trip tests for the parser cover the major cases (multiple sections, preamble, nested headers, empty sections, mid-line `## `). The bare `## ` edge case from Finding 2 is not tested.\n\n### Mutex Implementation\n\nThe `withMemoryLock` implementation (`memory-sections.ts:106-127`) uses a `Map<string, Promise<void>>` pattern with a while loop that re-checks after each await. This is correct under JavaScript's single-threaded execution model: between the while check exiting and `locks.set()`, no other coroutine can interleave. Error path releases via try/finally. Tested for serialization, concurrency across keys, and lock release on error."
  - timestamp: 2026-03-18T13:44:57.426Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Code review complete. Compiling findings for submission."
projectName: guild-hall
---
## Review: Memory Redesign Phases 1-2

**Build status:** Typecheck clean, lint clean, 2961 tests pass.

---

### Finding 1: `read_memory` tool description is stale (HIGH)

**File:** `daemon/services/base-toolbox.ts:322`

The tool description still says: *"If path is a directory, lists contents. If path is a file, returns content. If path omitted, lists the scope root."*

The `path` parameter was removed (REQ-MEM-15). The new behavior uses an optional `section` parameter. The description tells agents about capabilities that don't exist and omits the ones that do. An agent reading this description would try to pass a `path` parameter, get confused by the mismatch, and have no guidance on how `section` works.

**Fix:** Replace the last three sentences with description of the new behavior: without `section`, returns full file content; with `section`, returns that section's content (case-insensitive match).

---

### Finding 2: Round-trip fidelity fails for `## ` (empty header name) (MEDIUM)

**File:** `daemon/services/memory-sections.ts:32,40`

When a line is exactly `## ` (two hashes, space, nothing else), `line.slice(3)` yields `""`. This creates a section with name `""`, which is the same sentinel value used for preamble. On render, both are emitted without a `## ` header, so the original `## ` line is lost.

Demonstrated: `parseMemorySections("## \nContent\n")` → `[{name: "", content: "Content\n"}]`. Re-rendering produces `"Content\n"`, dropping the `## ` header entirely. This violates REQ-MEM-6 (round-trip fidelity).

With preamble + empty header, two sections share name `""`, and the renderer joins them without a boundary, losing structure.

**Impact:** Only affects hand-edited files or migrated files that happen to contain a bare `## ` header. The `edit_memory` tool prevents creating empty-named sections (REQ-MEM-3 validation). Unlikely to occur in practice, but the spec requires round-trip fidelity without this caveat.

**Fix:** Either treat `## ` (empty name after trimming) as body content rather than a section boundary, or use a distinct sentinel (e.g., `null`) for preamble to avoid collision.

---

### Finding 3: `read_memory` returns "No memories saved yet." for empty files (LOW)

**File:** `daemon/services/base-toolbox.ts:96`

After deleting all sections from a file, the file still exists (empty string written, satisfying REQ-MEM-10's "does not delete the file" requirement). But `readScopeFile` returns `""` for this file, and the handler treats `content === ""` as the "no file" case, returning "No memories saved yet."

REQ-MEM-14 says this message is for when "the file does not exist." An empty file does exist. The behavior is sensible (empty and absent are functionally equivalent for memory), but it's technically inconsistent with the spec wording.

**Impact:** Negligible. An agent that deletes all sections and then reads gets a reasonable message. No action required unless spec precision matters.

---

### Finding 4: Phases 2-3 gap leaves tools and injection reading different locations (INFO)

The Phase 2 tools (`read_memory`, `edit_memory`) write to single-file paths (`global.md`, `projects/{name}.md`, `workers/{name}.md`). The `loadMemories` function (which injects memory into system prompts) still reads from the legacy directory layout. Memory written via the new tools is invisible to prompt injection until Phase 3 rewrites `loadMemories`.

This is expected by the plan's phase sequencing and is not a bug, provided all phases ship together. Flagged to ensure Phase 3 does not get deferred independently.

---

### REQ Compliance Summary

| REQ | Status | Notes |
|-----|--------|-------|
| REQ-MEM-1 | PASS | `memoryScopeFile` returns correct paths |
| REQ-MEM-2 | PASS | Parser splits on `## ` at line start, `###` stays as body |
| REQ-MEM-3 | PASS | Section name validation: non-empty, no newlines, under 100 chars |
| REQ-MEM-5 | PASS | `parseMemorySections` returns correct type, handles preamble |
| REQ-MEM-6 | PARTIAL | Round-trip fidelity holds except for bare `## ` (empty header name) edge case. See Finding 2. |
| REQ-MEM-7 | PASS | `edit_memory` schema matches spec (scope, section, operation, content) |
| REQ-MEM-8 | PASS | Upsert replaces existing or appends new section |
| REQ-MEM-9 | PASS | Append uses blank line separator, creates if missing |
| REQ-MEM-10 | PASS | Delete removes section, idempotent, file preserved when empty |
| REQ-MEM-11 | PASS | Budget warning at 16k with character count and percentage |
| REQ-MEM-12 | PASS | Case-insensitive match, original casing preserved, provided casing on create |
| REQ-MEM-13 | PARTIAL | Schema correct (scope + optional section). Tool description is stale. See Finding 1. |
| REQ-MEM-14 | PARTIAL | Behavior correct. "No memories saved yet." also returned for empty files, not just missing. See Finding 3. |
| REQ-MEM-15 | PASS | `path` parameter removed from schema |
| REQ-MEM-22 | PASS | Per-scope mutex with correct key format, released in try/finally, tested for error recovery |
| REQ-MEM-27 | PASS | Read-before-write guard per toolbox instance, applies to both `edit_memory` and `write_memory` alias |

### Test Coverage Assessment

Tests cover all plan Step 2.6 cases: upsert/append/delete operations, section validation, case-insensitive matching, budget warning, concurrent writes, atomic write mechanism, read-before-write guard (rejection, success, cross-scope isolation), write_memory alias mapping. Round-trip tests for the parser cover the major cases (multiple sections, preamble, nested headers, empty sections, mid-line `## `). The bare `## ` edge case from Finding 2 is not tested.

### Mutex Implementation

The `withMemoryLock` implementation (`memory-sections.ts:106-127`) uses a `Map<string, Promise<void>>` pattern with a while loop that re-checks after each await. This is correct under JavaScript's single-threaded execution model: between the while check exiting and `locks.set()`, no other coroutine can interleave. Error path releases via try/finally. Tested for serialization, concurrency across keys, and lock release on error.
