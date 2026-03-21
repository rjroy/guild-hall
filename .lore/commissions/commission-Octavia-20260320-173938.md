---
title: "Commission: Plan: Decisions surface (artifact persistence + triage promotion)"
date: 2026-03-21
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "## Plan Task\n\nRead the spec at `.lore/specs/infrastructure/decisions-surface.md` and prepare an implementation plan at `.lore/plans/infrastructure/decisions-surface.md`.\n\nFollow the plan format established by existing plans in `.lore/plans/`. Reference the spec's REQ IDs. Include:\n\n- Codebase context: which files are touched, what exists today\n- Phased implementation steps with clear boundaries\n- Test strategy for each phase\n- A delegation guide (which worker for which phase, review checkpoints)\n- Risk assessment\n- REQ coverage matrix\n\n### Context to Read\n\n- `.lore/specs/infrastructure/decisions-surface.md` — the spec you're planning for\n- `.lore/brainstorm/decisions-surface.md` — the brainstorm that led to the spec (Option 2 was chosen)\n- `.lore/plans/infrastructure/commission-outcomes-to-memory.md` — the outcomes-to-memory plan, since the triage promotion aspect depends on it\n- `daemon/services/base-toolbox.ts` — where `record_decision` and `makeRecordDecisionHandler` live, where decision JSONL is written\n- `daemon/services/commission/orchestrator.ts` — commission completion/cleanup lifecycle\n- `daemon/services/meeting/orchestrator.ts` — meeting completion/cleanup lifecycle\n- `daemon/services/outcome-triage.ts` — the triage service (may already exist if Dalton's commission completed)\n\n### Key Considerations\n\nThis feature has two parts:\n1. **Artifact persistence** — lifecycle hook reads decisions.jsonl, appends to artifact body before state cleanup. This is standalone code.\n2. **Triage prompt guidance** — the outcomes-to-memory triage prompt should recognize decisions in artifact bodies and promote cross-cutting ones to memory. This may be a prompt tweak to the existing triage service rather than new code.\n\nThe plan should address whether part 2 is a code change or a prompt-only change, and sequence accordingly."
dependencies: []
linked_artifacts:
  - .lore/plans/infrastructure/decisions-surface.md

activity_timeline:
  - timestamp: 2026-03-21T00:39:38.396Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T00:39:38.397Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-21T00:39:38.441Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-21T00:39:45.977Z
    event: progress_report
    reason: "Reading spec, brainstorm, related plan, and codebase files to prepare implementation plan."
  - timestamp: 2026-03-21T00:41:15.321Z
    event: progress_report
    reason: "All context gathered. Drafting the implementation plan now."
  - timestamp: 2026-03-21T00:43:53.685Z
    event: result_submitted
    reason: "Implementation plan written at `.lore/plans/infrastructure/decisions-surface.md`.\n\nKey decisions in the plan:\n\n1. **New file `decisions-persistence.ts`** for `readDecisions`, `formatDecisionsSection`, and `appendDecisionsToArtifact`. Pure functions, fully testable in isolation.\n\n2. **Commission hook** inserts after `lifecycle.executionCompleted()` and before `workspace.finalize()` in `handleSuccessfulCompletion`. Appends to the artifact in the activity worktree before squash-merge.\n\n3. **Meeting hook** inserts after `closeArtifact()` (step 3) and before scope-aware finalization (step 5) in `closeMeeting`. Appends decisions after notes.\n\n4. **Triage timing resolution**: The `commission_result` event fires during the session (before the decisions hook runs), so the triage can't read decisions from the artifact body. Solution: the triage service reads decisions directly from the JSONL state file (still intact at event time) and appends them to `resultText`. Meeting triage works without changes because `meeting_ended` fires after the hook.\n\n5. **Single-agent implementation** for Phases 1-5 (small scope: ~80 lines production, ~200 lines test, 3 small modifications). Thorne review for Phase 6.\n\n6. **Frontmatter safety**: Append-only operation. No `gray-matter` stringify. No frontmatter parsing. Byte-for-byte preservation verified by tests."
  - timestamp: 2026-03-21T00:43:57.218Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All context gathered. Drafting the implementation plan now."
projectName: guild-hall
---
Implementation plan written at `.lore/plans/infrastructure/decisions-surface.md`.

Key decisions in the plan:

1. **New file `decisions-persistence.ts`** for `readDecisions`, `formatDecisionsSection`, and `appendDecisionsToArtifact`. Pure functions, fully testable in isolation.

2. **Commission hook** inserts after `lifecycle.executionCompleted()` and before `workspace.finalize()` in `handleSuccessfulCompletion`. Appends to the artifact in the activity worktree before squash-merge.

3. **Meeting hook** inserts after `closeArtifact()` (step 3) and before scope-aware finalization (step 5) in `closeMeeting`. Appends decisions after notes.

4. **Triage timing resolution**: The `commission_result` event fires during the session (before the decisions hook runs), so the triage can't read decisions from the artifact body. Solution: the triage service reads decisions directly from the JSONL state file (still intact at event time) and appends them to `resultText`. Meeting triage works without changes because `meeting_ended` fires after the hook.

5. **Single-agent implementation** for Phases 1-5 (small scope: ~80 lines production, ~200 lines test, 3 small modifications). Thorne review for Phase 6.

6. **Frontmatter safety**: Append-only operation. No `gray-matter` stringify. No frontmatter parsing. Byte-for-byte preservation verified by tests.
