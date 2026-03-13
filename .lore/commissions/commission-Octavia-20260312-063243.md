---
title: "Commission: Plan: Sandboxed Execution"
date: 2026-03-12
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Read the spec at `.lore/specs/infrastructure/sandboxed-execution.md` and prepare an implementation plan at `.lore/plans/infrastructure/sandboxed-execution.md`.\n\nFollow the plan format used by other plans in `.lore/plans/` — consult a few existing plans for structure. The plan should map spec requirements to concrete implementation steps, identify dependencies between steps, and note which worker is best suited for each step.\n\nReference the codebase to understand current architecture before proposing steps. The spec covers Phase 1 (permission-based) and Phase 2 (container-based) — the plan should cover both phases with a clear boundary between them."
dependencies: []
linked_artifacts:
  - .lore/plans/infrastructure/sandboxed-execution.md

activity_timeline:
  - timestamp: 2026-03-12T13:32:43.106Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-12T13:32:43.108Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-12T13:32:43.188Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-12T13:32:50.354Z
    event: progress_report
    reason: "Starting work. Reading the sandboxed execution spec and existing plans for format reference."
  - timestamp: 2026-03-12T13:33:20.799Z
    event: progress_report
    reason: "Read the spec and 3 existing plans for format reference. Now reading the `prepareSdkSession` function and package validation code to understand where sandbox and canUseTool changes land."
  - timestamp: 2026-03-12T13:34:04.645Z
    event: progress_report
    reason: "Finished reading all source material. Now drafting the implementation plan. I have the spec, 3 reference plans for format, the SDK runner, toolbox resolver, types, and package loading code, plus the SDK sandboxing research."
  - timestamp: 2026-03-12T13:37:41.681Z
    event: progress_report
    reason: "Plan drafted. Running fresh-context review to catch gaps before submission."
  - timestamp: 2026-03-12T13:42:56.117Z
    event: result_submitted
    reason: "Implementation plan created at `.lore/plans/infrastructure/sandboxed-execution.md`.\n\nThe plan maps all 24 requirements (REQ-SBX-1 through REQ-SBX-24) to 9 implementation steps across two phases:\n\n**Phase 1 (Steps 1-4): SDK Sandbox for Bash-Capable Workers**\n- Step 1: Add `sandbox` field to `SdkQueryOptions`\n- Step 2: Inject sandbox settings in `prepareSdkSession` when `builtInTools` includes `\"Bash\"`\n- Step 3: Bubblewrap prerequisite detection at daemon startup (Linux only)\n- Step 4: Phase 1 unit tests (4 test cases covering REQ-SBX-10)\n\n**Phase 2 (Steps 5-9): Worker-Defined `canUseTool` Rules**\n- Step 5: `CanUseToolRule` type, `WorkerMetadata` extension, `ResolvedToolSet` update, toolbox resolver passthrough\n- Step 6: Package validation via `superRefine` (rules must reference tools in `builtInTools`)\n- Step 7: `canUseTool` callback with `micromatch` glob matching, `TOOL_PATH_FIELD` lookup table\n- Step 8: Phase 2 unit tests (9 test cases covering REQ-SBX-24)\n- Step 9: Full suite verification and fresh-context spec validation\n\n**Commission structure**: 6 commissions across Dalton (implementation), Sable (tests), Thorne (review). Commissions B (Phase 1 tests) and C (Phase 2 types) can run in parallel after Commission A.\n\n**Review findings addressed**: Removed premature `canUseToolRules` from Phase 1 test fixtures (would cause typecheck failure before Step 5 lands). Changed `~/.ssh/**` path-deny test to use absolute paths (reflects real SDK behavior). Updated commission sequencing to allow B/C parallelism."
  - timestamp: 2026-03-12T13:43:03.070Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Plan drafted. Running fresh-context review to catch gaps before submission."
projectName: guild-hall
---
Implementation plan created at `.lore/plans/infrastructure/sandboxed-execution.md`.

The plan maps all 24 requirements (REQ-SBX-1 through REQ-SBX-24) to 9 implementation steps across two phases:

**Phase 1 (Steps 1-4): SDK Sandbox for Bash-Capable Workers**
- Step 1: Add `sandbox` field to `SdkQueryOptions`
- Step 2: Inject sandbox settings in `prepareSdkSession` when `builtInTools` includes `"Bash"`
- Step 3: Bubblewrap prerequisite detection at daemon startup (Linux only)
- Step 4: Phase 1 unit tests (4 test cases covering REQ-SBX-10)

**Phase 2 (Steps 5-9): Worker-Defined `canUseTool` Rules**
- Step 5: `CanUseToolRule` type, `WorkerMetadata` extension, `ResolvedToolSet` update, toolbox resolver passthrough
- Step 6: Package validation via `superRefine` (rules must reference tools in `builtInTools`)
- Step 7: `canUseTool` callback with `micromatch` glob matching, `TOOL_PATH_FIELD` lookup table
- Step 8: Phase 2 unit tests (9 test cases covering REQ-SBX-24)
- Step 9: Full suite verification and fresh-context spec validation

**Commission structure**: 6 commissions across Dalton (implementation), Sable (tests), Thorne (review). Commissions B (Phase 1 tests) and C (Phase 2 types) can run in parallel after Commission A.

**Review findings addressed**: Removed premature `canUseToolRules` from Phase 1 test fixtures (would cause typecheck failure before Step 5 lands). Changed `~/.ssh/**` path-deny test to use absolute paths (reflects real SDK behavior). Updated commission sequencing to allow B/C parallelism.
