---
title: Verify and clean up test suite
date: 2026-03-02
status: complete
tags: [task]
source: .lore/plans/meeting-infrastructure-convergence.md
related: [.lore/specs/meeting-infrastructure-convergence.md]
sequence: 8
modules: [meeting-orchestrator, meeting-handlers, activity-state-machine]
---

# Task: Verify and clean up test suite

## What

Comprehensive test verification after the orchestrator rewrite and recovery implementation. This is a catch-all for test debt that wasn't resolved in prior tasks.

**1. Create `tests/daemon/services/meeting/orchestrator.test.ts`** to test the restructured orchestrator flows (open, close, decline, defer) through the new sequential steps. This file does not currently exist. The orchestrator tests currently embedded in `tests/daemon/services/meeting-handlers.test.ts` need a new home that tests direct sequential steps rather than handler dispatch through the ActivityMachine.

**2. Update import paths.** Search all test files for imports of:
- `daemon/services/meeting-session` (now `daemon/services/meeting/orchestrator`)
- `daemon/services/meeting-artifact-helpers` (now `daemon/services/meeting/record`)

**3. Search for `notes_summary` references.** The `notes_summary` field was removed from meeting artifact frontmatter (task 003). Search the entire codebase (`web/`, `daemon/`, `tests/`, `lib/`) for any remaining references. Update or remove each one.

**4. Handle `tests/daemon/lib/activity-state-machine.test.ts`.** This file tests the ActivityMachine and may have failures for tests that reference meeting-specific handlers (which no longer exist). Mark those tests as pending with a comment explaining they'll be deleted in task 009. Tests that verify ActivityMachine behavior independent of meetings should still pass.

**5. Run the full test suite.** All 1706+ tests must pass.

After implementation, run `pr-test-analyzer` agent to verify coverage of new code paths (registry operations, sequential orchestrator flows, recovery).

## Validation

- `tests/daemon/services/meeting/orchestrator.test.ts` exists and tests open, close, decline, defer flows.
- No imports reference `daemon/services/meeting-session` or `daemon/services/meeting-artifact-helpers` (old paths).
- No references to `notes_summary` remain anywhere in the codebase (except archived docs in `.lore/_archive/`).
- `tests/daemon/lib/activity-state-machine.test.ts` compiles (meeting-specific tests marked pending if needed).
- Full test suite passes: `bun test` with zero failures.

## Why

From `.lore/specs/meeting-infrastructure-convergence.md`:
- REQ-MIC-19: "All meeting behaviors defined in the meetings spec (REQ-MTG-1 through REQ-MTG-30) are preserved."
- REQ-MIC-20: "All existing meeting tests continue to pass."

## Files

- `tests/daemon/services/meeting/orchestrator.test.ts` (create)
- `tests/daemon/services/meeting-handlers.test.ts` (modify: mark meeting-handler-specific tests pending)
- `tests/api/meetings-actions.test.ts` (modify if import paths need updating)
- `tests/daemon/routes/meetings.test.ts` (modify if import paths need updating)
- `web/` components that reference `notes_summary` (modify if found)
