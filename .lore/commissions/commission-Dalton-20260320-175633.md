---
title: "Commission: Implement: Decisions surface (Phases 1-5)"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Implementation Task\n\nImplement the decisions surface feature, Phases 1-5.\n\n**Plan**: `.lore/plans/infrastructure/decisions-surface.md`\n**Spec**: `.lore/specs/infrastructure/decisions-surface.md`\n\nRead the plan thoroughly. It has detailed step-by-step instructions, codebase context, and risk notes. Follow it closely.\n\n### Summary\n\n**Phase 1**: Create `daemon/services/decisions-persistence.ts` with `readDecisions`, `formatDecisionsSection`, `appendDecisionsToArtifact`, and `DecisionEntry` type. Create tests.\n\n**Phase 2**: Add decisions persistence hook to `handleSuccessfulCompletion` in `daemon/services/commission/orchestrator.ts`. Runs after `lifecycle.executionCompleted()` and before `workspace.finalize()`. Wrapped in try/catch.\n\n**Phase 3**: Add decisions persistence hook to `closeMeeting` in `daemon/services/meeting/orchestrator.ts`. Runs after `closeArtifact()` and before scope-aware finalization. Same try/catch pattern.\n\n**Phase 4**: Modify commission triage input in `daemon/services/outcome-triage.ts` to read decisions directly from JSONL state (not artifact body) and include them in `resultText`. Meeting triage already sees decisions in the artifact body automatically.\n\n**Phase 5**: Update the `record_decision` tool description in `daemon/services/base-toolbox.ts` with the text from REQ-DSRF-14.\n\n### Critical Details\n\n- The `readDecisions` path MUST match `makeRecordDecisionHandler`'s path resolution exactly. Test 1.2.5 verifies this by writing via the handler and reading back.\n- Both hooks must run BEFORE state cleanup (which deletes the JSONL). The plan specifies exact insertion points.\n- Frontmatter must be preserved byte-for-byte. The append operation doesn't touch frontmatter.\n- Phase 4 reads decisions from JSONL directly (not the artifact body) to avoid a timing issue with commission events.\n\n### Commit Strategy\n\nCommit after each phase. Run `bun test` before proceeding to the next phase."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T00:56:33.040Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T00:56:43.115Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
