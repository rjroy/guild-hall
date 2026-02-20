---
title: Validate implementation against spec requirements
date: 2026-02-17
status: complete
tags: [task]
source: .lore/plans/worker-dispatch.md
related:
  - .lore/specs/phase-1/worker-dispatch.md
sequence: 13
modules: [guild-hall-core, researcher-plugin]
---

# Task: Validate Implementation Against Spec Requirements

## What

Launch sub-agents to review the implementation across all modified files and flag any requirements not met. This task is not optional.

**Spec validation**: Read the spec at `.lore/specs/phase-1/worker-dispatch.md`, review implementation across all modified files, and flag any REQ-WD-* requirements not met. Use the spec's AI Validation section criteria mapping:

| Validation Criteria | Covered By |
|---|---|
| Integration test (dispatch, directory structure, status transitions, result) | Tasks 006-008, 012 tests |
| Protocol test (each worker/* method, response schema) | Task 003 tests (JsonRpcClient) + Tasks 007-009 tests (handlers) |
| Error path test (cancel running, unknown job ID, worker crash, delete running) | Tasks 008, 009, 012 tests |
| Delete test (completed/cancelled OK, running/failed error) | Task 009 tests |
| Filter test (multiple jobs, worker/list with filter) | Task 007 tests |
| Template test (copy researcher, change name/prompt, verify discovery + dispatch) | Manual verification or integration sub-agent |
| Memory test (two sequential jobs, second gets first's memories) | Task 012 tests |
| Isolation test (worker gets only internal + read-only tools) | Task 012 tests |

**Template test**: Copy `guild-members/researcher/` to `guild-members/test-copy/`, change the name in `guild-member.json`, verify `discoverGuildMembers()` finds it, and clean up. This cannot be covered by unit tests.

**Sub-agent reviews**:
- `agent-sdk-dev:agent-sdk-verifier-ts` on the researcher plugin's Agent SDK usage
- `pr-review-toolkit:code-reviewer` on all changed files
- `pr-review-toolkit:silent-failure-hunter` on error handling paths

**Coverage check**: Verify 90%+ coverage on all new code across Tasks 001-012.

## Validation

- All 47 REQ-WD-* requirements mapped to implementation and verified
- No unaddressed spec requirements
- Template test passes (copy researcher, rename, discover)
- Agent SDK verifier reports no issues
- Code reviewer reports no critical issues
- Silent failure hunter reports no suppressed errors
- 90%+ coverage across all new code

## Why

From `.lore/plans/worker-dispatch.md`, Step 11: "Launch a sub-agent that reads the spec, reviews the implementation across all modified files, and flags any requirements not met. This step is not optional."

From `.lore/specs/phase-1/worker-dispatch.md`, AI Validation section: eight custom test categories.

## Files

- All files modified in Tasks 001-012 (review)
- `guild-members/test-copy/` (create temporarily for template test, then clean up)
