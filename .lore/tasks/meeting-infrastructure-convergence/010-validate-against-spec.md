---
title: Validate against spec
date: 2026-03-02
status: pending
tags: [task]
source: .lore/plans/meeting-infrastructure-convergence.md
related: [.lore/specs/meeting-infrastructure-convergence.md]
sequence: 10
modules: [meeting-orchestrator, meeting-record, meeting-registry, commission-record, record-utils, escalation]
---

# Task: Validate against spec

## What

Launch a sub-agent that reads the spec at `.lore/specs/meeting-infrastructure-convergence.md`, reviews the implementation, and flags any requirements not met. This step is not optional.

Run `code-reviewer` agent for a full pass. DI wiring gaps in `createProductionApp` are the highest-risk area (in-process commission retro lesson).

**Verification checklist:**

1. Shared record utilities exist at `daemon/lib/record-utils.ts` and are imported by both `daemon/services/commission/record.ts` and `daemon/services/meeting/record.ts`.
2. Meetings use `workspace.prepare()` for provisioning and `workspace.finalize()` for merge. No inlined git calls in meeting code.
3. Single merge conflict escalation function at `daemon/lib/escalation.ts` called by both commission and meeting orchestrators.
4. No imports of ActivityMachine in `daemon/services/meeting/` or any meeting code.
5. Active session registry at `daemon/services/meeting/registry.ts` tracks open meetings with concurrent close guard.
6. Meeting orchestrator drives lifecycle as explicit steps (no enter/exit handler routing).
7. Public interface unchanged: all ten method signatures match pre-refactor.
8. Crash recovery works through the registry.
9. ActivityMachine removed. File and types do not exist. No stale imports.
10. meeting-handlers.ts removed. No stale imports.
11. All MTG behaviors preserved. Full test suite passes. Notes display correctly (body, not frontmatter).
12. Commission behavior unaffected. All commission tests pass. Commission record ops produce identical output.
13. Dead code scan: grep for all ActivityMachine-associated type names and old file paths. Zero hits.
14. Directory structure: `daemon/services/meeting/` exists with `record.ts`, `registry.ts`, `orchestrator.ts`. No orphaned files at old paths.

## Validation

- All 14 checklist items pass.
- All spec success criteria (from the spec's Success Criteria section) are met.
- Full test suite passes.
- `code-reviewer` agent produces no critical findings.

## Why

From `.lore/specs/meeting-infrastructure-convergence.md`:
- REQ-MIC-19: "All meeting behaviors defined in the meetings spec are preserved."
- REQ-MIC-20: "All existing meeting tests continue to pass."
- REQ-MIC-21: "Commission behavior is unaffected."

## Files

- No files modified. This is a verification task.
