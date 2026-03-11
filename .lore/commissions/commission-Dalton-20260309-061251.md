---
title: "Commission: Implement Scheduled Commissions"
date: 2026-03-09
status: completed
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the Scheduled Commissions plan at `.lore/plans/commissions/guild-hall-scheduled-commissions.md`. This is a large feature with 11 steps: type system extensions, artifact schema, schedule lifecycle, record operations, manager toolbox, scheduler service, startup catch-up, daemon wiring, UI updates, cron library integration, and spec validation.\n\nKey guidance from the plan:\n\n**Architecture:**\n- Scheduled commissions are a new `type: scheduled` alongside existing `type: one-shot`. The two status sets do not overlap (REQ-SCOM-2).\n- `ScheduleLifecycle` is a separate class from `CommissionLifecycle`, not an extension. Four states: active, paused, completed, failed.\n- Schedule record ops extend existing Layer 1 (`record.ts`), not a parallel module. All artifact I/O stays in one Layer 1 per REQ-CLS-4.\n- The scheduler service is the first timer-based service in the daemon. It establishes the pattern.\n\n**Step ordering (from Delegation Guide):**\n- Step 10 (cron library) can run in parallel with Steps 1-4.\n- Steps 1-4 are a dependency chain (types -> artifact schema -> lifecycle -> record ops).\n- Step 5 (manager toolbox) depends on Steps 3-4.\n- Step 6 (scheduler) depends on Steps 3-4 and 10.\n- Step 7 (catch-up) extends Step 6.\n- Step 8 (daemon wiring) depends on Steps 6-7.\n- Step 9 (UI) depends on Step 2 for artifact format.\n- Step 11 (validation) is last.\n\n**Critical lessons from retros (repeated in the plan):**\n- DI factories need production wiring. Every constructor dep for `SchedulerService` must be instantiated in `createProductionApp` (Step 8). Tests with mocks pass even when production is broken.\n- Timer-based services have subtle failure modes: error in tick handler can kill the interval, unhandled promise rejections, race conditions between tick and shutdown.\n- `createProductionApp` return type changes to `{ app, shutdown }` so the scheduler can be stopped on SIGINT/SIGTERM.\n\n**Model selection integration:**\n- `resourceOverrides` includes `model?: string` (REQ-MODEL-7 already implemented).\n- Schedule templates copy `resource_overrides` including `model` to spawned commissions (REQ-MODEL-10).\n- Validate model names against `VALID_MODELS` using `isValidModel()` during schedule creation and update.\n\n**Open Questions to resolve during implementation:**\n1. Cron library: croner vs cron-parser. Test under bun before committing.\n2. Schedule routes: extend `PUT /commissions/:id` or new `PUT /schedules/:id`. Decide during Step 9.\n3. Consecutive failure threshold: start with 3 as a constant.\n\nSpecs: `.lore/specs/commissions/guild-hall-scheduled-commissions.md`, `.lore/specs/commissions/commission-layer-separation.md`\nBrainstorm: `.lore/brainstorm/scheduled-commissions.md`\n\nRun all tests before completing. Use `/lore-development:implement` to orchestrate the work."
dependencies: []
linked_artifacts:
  - .lore/specs/commissions/guild-hall-scheduled-commissions.md

  - .lore/plans/commissions/guild-hall-scheduled-commissions.md
  - .lore/brainstorm/scheduled-commissions.md
  - .lore/specs/commissions/commission-layer-separation.md
  - .lore/brainstorm/commission-layer-separation.md
  - .lore/retros/in-process-commissions.md
  - .lore/retros/coverage-di-factories.md
  - .lore/retros/phase-4-commissions.md
  - .lore/retros/dispatch-hardening.md
  - .lore/retros/unified-sdk-runner.md
  - .lore/retros/phase-5-git-integration-data-loss.md
  - .lore/retros/worker-domain-plugins.md
  - .lore/retros/commission-batch-cleanup.md
  - .lore/retros/sse-streaming-bug-fix.md
  - .lore/notes/model-selection.md
  - .lore/retros/path-resolution-audit.md
  - .lore/plans/commissions/guild-hall-scheduled-commissions.md
  - .lore/brainstorm/scheduled-commissions.md
  - .lore/specs/commissions/commission-layer-separation.md
  - .lore/brainstorm/commission-layer-separation.md
  - .lore/retros/in-process-commissions.md
  - .lore/retros/coverage-di-factories.md
  - .lore/retros/phase-4-commissions.md
  - .lore/retros/dispatch-hardening.md
  - .lore/retros/unified-sdk-runner.md
  - .lore/retros/phase-5-git-integration-data-loss.md
  - .lore/retros/worker-domain-plugins.md
  - .lore/retros/commission-batch-cleanup.md
  - .lore/retros/sse-streaming-bug-fix.md
  - .lore/notes/model-selection.md
  - .lore/retros/path-resolution-audit.md
activity_timeline:
  - timestamp: 2026-03-09T13:12:51.519Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T13:12:51.520Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-09T13:12:51.555Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-09T13:13:00.145Z
    event: progress_report
    reason: "Starting Scheduled Commissions implementation. Reading plan, specs, and existing code before orchestrating with /lore-development:implement."
  - timestamp: 2026-03-09T13:13:50.598Z
    event: progress_report
    reason: "Starting /lore-development:implement orchestration for the Scheduled Commissions plan. Reading the plan, checking for task files, and researching prior work before dispatching implementation agents."
  - timestamp: 2026-03-09T13:15:15.250Z
    event: progress_report
    reason: "Completed search across all .lore/ directories. Found highly relevant prior work: the scheduled commissions spec (approved), plan (approved), and brainstorm (specified) already exist. Also found 8+ retros with directly applicable lessons, the commission layer separation spec, and the model selection implementation notes. Compiling findings into structured summary."
  - timestamp: 2026-03-09T13:17:18.438Z
    event: result_submitted
    reason: "## Related Learnings\n\n### From Specs\n\n**Guild Hall Scheduled Commissions** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/specs/commissions/guild-hall-scheduled-commissions.md`)\nRelevance: This is the approved spec (REQ-SCOM-1 through REQ-SCOM-28) for the feature being implemented. Defines the full artifact schema (schedule block with cron, repeat, runs_completed, last_run, last_spawned_id), four-status lifecycle (active/paused/completed/failed), daemon scheduler service (60s tick), two manager toolbox tools (create_scheduled_commission, update_schedule), stuck run escalation via meeting requests, catch-up spawns on daemon restart, and UI requirements. Status: **approved**.\n\n**Commission Layer Separation** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/specs/commissions/commission-layer-separation.md`)\nRelevance: The scheduler must interact with Layers 1-2 (record and lifecycle) to create and dispatch spawned commissions without violating the hard boundary (REQ-CLS-16: executor never writes commission artifacts directly). The spec explicitly states the scheduler respects layer boundaries. Key constraint: all commission artifact writes go through Layer 1 (REQ-CLS-4). The `CommissionRecordOps` in `record.ts` is the correct entry point for schedule field reads/writes.\n\n### From Plans\n\n**Plan for Scheduled Commissions** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/plans/commissions/guild-hall-scheduled-commissions.md`)\nRelevance: This is the approved 11-step implementation plan. Key implementation details:\n- **Step 1**: Type extensions in `daemon/types.ts` (CommissionType, ScheduledCommissionStatus) and `daemon/lib/event-bus.ts` (schedule_spawned event)\n- **Step 2**: Extend `createCommission()` with trailing options parameter `{ type?, sourceSchedule? }` for backward compatibility\n- **Step 3**: New `ScheduleLifecycle` class in `daemon/services/scheduler/schedule-lifecycle.ts` (separate from CommissionLifecycle)\n- **Step 4**: Extend existing `CommissionRecordOps` in `record.ts` with schedule-aware methods (readScheduleMetadata, writeScheduleFields)\n- **Step 5**: Two new tools in manager toolbox (makeCreateScheduledCommissionHandler, makeUpdateScheduleHandler)\n- **Step 6**: Core SchedulerService in `daemon/services/scheduler/index.ts` with cron wrapper in `cron.ts`\n- **Step 7**: Catch-up logic (one spawn per missed schedule on startup)\n- **Step 8**: Daemon wiring in `createProductionApp()` -- changes return type to `Promise<{ app, shutdown }>` for scheduler cleanup\n- **Step 9**: UI updates\n- **Step 10**: Cron library integration (croner vs cron-parser, both candidates)\n- **Step 11**: Spec validation sub-agent\n\nCross-cutting: model selection (REQ-MODEL-7, REQ-MODEL-10) is already accounted for in the plan. `resource_overrides` includes `model?: string`.\n\nOpen questions from plan:\n1. Cron library choice (croner vs cron-parser, resolve during Step 10 via bun compatibility testing)\n2. Schedule-specific daemon route vs extending existing PUT /commissions/:id\n3. Consecutive failure threshold (3 as constant, promote to config if needed)\n4. Model selection spec amendments (documentation updates, not code blockers)\n\n### From Brainstorms\n\n**Scheduled Commissions** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/brainstorm/scheduled-commissions.md`)\nExplored: All core design decisions were settled here and carried into the spec. Schedule lives in the commission artifact (not config.yaml), `type` field distinguishes one-shot from scheduled, cron expressions for cadence, spawned commissions are normal one-shot commissions, Guild Master creates/edits schedules, \"assuming yes\" is a prompt concern not a system concern. Includes stuck run escalation concept and timeline compression ideas.\n\n**Commission Layer Separation** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/brainstorm/commission-layer-separation.md`)\nExplored: The five-layer decomposition (later reduced to four in the spec). The hard boundary concept (\"executor cannot write to the commission record; it signals, the commission writes itself\") originates here. Key anti-pattern identified: \"AI Implementation Anti-Pattern: Shotgun Changes\" where changes are scattered across files without respecting boundaries.\n\n### From Retros\n\n**In-Process Commission Migration** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/retros/in-process-commissions.md`)\nKey insight: Fresh-eyes review found a production wiring gap (queryFn not wired in createProductionApp) even though the risk was pre-identified. Race conditions between cancel and completion handlers are structural in fire-and-forget async patterns. Any function that starts an unowned async task and also has a cancel method needs a terminal state guard. **Directly relevant to the scheduler's tick/stop interaction.**\n\n**Coverage DI Factories** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/retros/coverage-di-factories.md`)\nKey insight: The DI factory pattern (`createX(deps)` factory, default instance for production) is the established codebase pattern. Applied to SessionStore, AgentManager, MCPManager, ServerContext, etc. The SchedulerService should follow this same pattern.\n\n**Phase 4 Commissions** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/retros/phase-4-commissions.md`)\nKey insight: \"1032 tests passed and 33/33 spec requirements validated, but the system didn't work end-to-end.\" Spec validation catches capability, not assembly. Happy-path logging is as important as error logging. Build observability into the implementation plan, not as a reaction to failure. **The scheduler service should log its tick activity on the success path, not just errors.**\n\n**Dispatch Hardening** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/retros/dispatch-hardening.md`)\nKey insight: Resource budget defaults need validation against real workloads. Don't dismiss test failures as \"pre-existing\" without controlled proof. Duplicate interface definitions are a drift timebomb. **Relevant to the scheduler's configuration constants (tick interval, escalation threshold).**\n\n**Unified SDK Runner** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/retros/unified-sdk-runner.md`)\nKey insight: Phased migration with per-phase test verification is the only safe way to do a large refactor. Fresh-eyes review after each phase found three production bugs in Phase 7 that the implementation agent missed. **The plan's 11-step sequence with per-step testing follows this lesson.** Also: compaction gaps are silent. Shared infrastructure is the right place to enforce \"this always happens.\"\n\n**Phase 5 Git Integration Data Loss** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/retros/phase-5-git-integration-data-loss.md`)\nKey insight: Git subprocesses spawned during hooks inherit GIT_DIR, GIT_WORK_TREE, and GIT_INDEX_FILE. All code that shells out to git must strip these via cleanGitEnv(). **The scheduler reads from integration worktrees, which involves filesystem reads, not git operations, but any future git interaction must use cleanGitEnv().**\n\n**Worker Domain Plugins** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/retros/worker-domain-plugins.md`)\nKey insight: When a spec defines a filesystem convention, validate it by actually creating the files in the real package before finalizing. Test fixture values drifted from production behavior without tests catching it. **Relevant to the schedule artifact schema: create a real schedule artifact early to validate the schema before building infrastructure around it.**\n\n**Commission Batch Cleanup** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/retros/commission-batch-cleanup.md`)\nKey insight: Commission artifacts are receipts, not products. Fresh-context review catches what tests don't. Retros written from commission artifacts drift from reality; validate claims against the source. **Relevant to cleanup integration: spawned commissions from schedules should follow the same cleanup path.**\n\n**SSE Streaming Bug Fix** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/retros/sse-streaming-bug-fix.md`)\nKey insight: When a system has two ID namespaces for the same concept, the boundary where they meet is highest-risk code. Tests that construct expected values from the code's internal state validate consistency, not correctness. **The scheduler works with CommissionId (branded type) and schedule commission IDs. The boundary between schedule IDs and spawned commission IDs needs careful handling.**\n\n### From Notes\n\n**Model Selection Implementation** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/notes/model-selection.md`)\nRelevance: Model selection is already implemented (12 phases complete). REQ-MODEL-10 (scheduled commission model) was explicitly deferred because scheduled commissions weren't built yet. The note confirms: \"The resource_overrides copy mechanism will naturally include model when built.\" The plan for scheduled commissions already accounts for this in Steps 5 and 6.\n\n### From Issues\n\n*No dedicated scheduling or timer issues found in `.lore/issues/`.*\n\n### Research Gaps\n\n**No cron library research exists.** The brainstorm and spec both flag cron library selection as an open research exit point. Candidates identified (croner, cron-parser) but no evaluation has been performed. The plan's Step 10 is designated for this research. The only requirement is \"given this expression and a timestamp, when is the next occurrence?\" plus validation and interval estimation.\n\n---\n\n## Key Lessons to Carry Forward\n\n1. **DI wiring is the #1 failure mode.** Multiple retros document wiring gaps in `createProductionApp()`. The plan's Step 8 explicitly addresses this. After wiring, run a fresh-eyes review.\n\n2. **The scheduler is the first timer-based service.** No existing pattern to follow for periodic services. Error handling in the tick callback is critical: an unhandled error kills the interval. The plan specifies \"if any step fails for a single schedule, log and continue.\"\n\n3. **Layer boundaries are real.** The scheduler interacts with Layers 1-2 only. It does not write commission artifacts directly. Schedule field updates go through `CommissionRecordOps` (Layer 1). Status transitions go through `ScheduleLifecycle` (a new class parallel to `CommissionLifecycle`).\n\n4. **Test against real artifacts early.** Create a real schedule artifact file and validate the YAML schema works with gray-matter parsing before building the infrastructure. Prior retros document fixture drift from production behavior.\n\n5. **Happy-path logging.** The scheduler should log each tick's findings (N schedules scanned, M due, K spawned) even when nothing happens. When it breaks, the first debugging step should not be \"add logging.\"\n\n6. **Return type change for createProductionApp.** Step 8 changes the return from `Promise<Hono>` to `Promise<{ app: Hono; shutdown: () => void }>`. This has exactly one caller in `daemon/index.ts`. The shutdown function clears the scheduler interval.\n\n7. **Branded CommissionId type.** The existing `CommissionId` branded type works for both one-shot and scheduled commissions. Use `asCommissionId()` when converting from string returns of `createCommission()`."
  - timestamp: 2026-03-09T13:18:26.376Z
    event: progress_report
    reason: "Step 1 complete: Type system extensions added and typecheck passes. Added CommissionType and ScheduledCommissionStatus to daemon/types.ts, and schedule_spawned event to SystemEvent in daemon/lib/event-bus.ts."
  - timestamp: 2026-03-09T13:20:55.547Z
    event: progress_report
    reason: "Step 10 complete: Cron library integration. Installed croner@10.0.1, created daemon/services/scheduler/cron.ts wrapper with three functions (nextOccurrence, isValidCron, intervalSeconds), and wrote 25 tests covering standard expressions, edge cases, validation, interval calculation, and UTC consistency. All 2152 tests pass including the new ones. Typecheck clean."
  - timestamp: 2026-03-09T13:22:36.634Z
    event: progress_report
    reason: "Phases 1 and 10 complete. Types added (CommissionType, ScheduledCommissionStatus, schedule_spawned event). Cron library croner@10.0.1 integrated with wrapper. 25 cron tests pass. Moving to Phase 2: artifact schema extensions."
  - timestamp: 2026-03-09T13:26:05.415Z
    event: progress_report
    reason: "Step 2 complete. All changes implemented: createCommission() signature extended with options parameter, type/source_schedule written to artifact frontmatter, readType() added to CommissionRecordOps. Typecheck passes, all tests pass (57 record tests, 56 orchestrator tests, 80 lifecycle tests)."
  - timestamp: 2026-03-09T13:30:21.065Z
    event: progress_report
    reason: "Step 3 complete: ScheduleLifecycle state machine implemented and tested. Implementation file created at daemon/services/scheduler/schedule-lifecycle.ts. Test file created at tests/daemon/services/scheduler/schedule-lifecycle.test.ts. All 37 tests pass (104 assertions). Typecheck clean for new files; pre-existing typecheck error in commission lifecycle test mock (from prior step adding readScheduleMetadata/writeScheduleFields to the interface) is not from this change."
  - timestamp: 2026-03-09T13:30:49.968Z
    event: progress_report
    reason: "Step 4 implementation complete. Added ScheduleMetadata interface, readScheduleMetadata and writeScheduleFields methods to CommissionRecordOps. All tests pass (76 record tests, 80 lifecycle tests, 56 orchestrator tests). Typecheck clean."
  - timestamp: 2026-03-09T13:31:29.133Z
    event: progress_report
    reason: "Phases 1-4 and 10 complete. Type system, cron library, artifact schema, schedule lifecycle (37 tests), and record operations (76 tests) all implemented. Moving to Phase 5 (manager toolbox) which depends on phases 3-4."
  - timestamp: 2026-03-09T13:38:54.261Z
    event: progress_report
    reason: "Step 5 (Manager toolbox extensions) is complete. Added two new tools (create_scheduled_commission and update_schedule) to the manager toolbox with 16 passing tests. Typecheck clean, full suite passes (2232 tests)."
  - timestamp: 2026-03-09T13:40:11.863Z
    event: progress_report
    reason: "Phases 1-5 and 10 complete. Moving to Phase 6 (scheduler service) - the core timer-based service. This is the most complex step, handling cron evaluation, spawn logic, overlap prevention, stuck run escalation, and error handling."
  - timestamp: 2026-03-09T13:44:50.211Z
    event: progress_report
    reason: "SchedulerService implementation and tests complete. TypeScript typechecks clean. All 14 new tests pass. All 76 scheduler tests (including existing cron and schedule-lifecycle tests) pass."
  - timestamp: 2026-03-09T13:47:13.046Z
    event: progress_report
    reason: "Phases 1-6 and 10 complete. Resuming after context compaction. Dispatching Phase 7 (startup catch-up) to extend SchedulerService."
  - timestamp: 2026-03-09T13:50:26.837Z
    event: progress_report
    reason: "Phase 7 implementation complete. Refactored processSchedule() to extract shared spawnFromSchedule() method, implemented catchUp() method, and added 4 tests. All 18 tests pass, typecheck clean."
  - timestamp: 2026-03-09T13:56:09.318Z
    event: progress_report
    reason: "Phases 1-8 and 10 complete. Scheduler wired into production app, shutdown handler updated. Moving to Phase 9 (UI updates)."
  - timestamp: 2026-03-09T14:01:52.165Z
    event: progress_report
    reason: "Implementation complete. Added \"Recurring\" label for scheduled commissions and \"from: {sourceSchedule}\" link for spawned commissions in CommissionList. Fixed pre-existing type errors in 7 test files caused by the new CommissionMeta fields. Typecheck passes clean. All tests related to my changes pass (1 pre-existing failure in dashboard-commissions.test.ts is from a separate statusToGem mapping change)."
  - timestamp: 2026-03-09T14:07:23.234Z
    event: progress_report
    reason: "All schedule-specific rendering for the commission detail view is complete. Four files modified, four new files created. TypeScript type checking passes (only pre-existing errors in unrelated files remain). Ready to submit."
  - timestamp: 2026-03-09T14:08:01.871Z
    event: progress_report
    reason: "All changes implemented and verified. Typecheck passes clean, all 2258 tests pass (including 4 new tests for sourceSchedule edge behavior). Changes span dependency graph data layer, dashboard flat card list, SVG graph nodes, and CSS for both components."
  - timestamp: 2026-03-09T14:08:21.321Z
    event: progress_report
    reason: "Implementation complete. Commission form now has a type toggle (One-shot / Schedule), with conditional cron expression and repeat count fields. Daemon route accepts and validates schedule fields. All 2262 tests pass, typecheck clean. Backend wiring for full schedule artifact creation is noted as a TODO in the daemon route."
  - timestamp: 2026-03-09T14:09:57.164Z
    event: progress_report
    reason: "All 10 implementation phases complete (1-10). 2262 tests pass, typecheck clean. Moving to Phase 11: validate against spec."
  - timestamp: 2026-03-09T14:12:34.966Z
    event: progress_report
    reason: "All implementation files read and analyzed. Compiling requirement-by-requirement review against the spec. Found several issues including: missing production wiring for scheduleLifecycle/recordOps/packages in the services bag, update_schedule lifecycle registration gap, missing UI elements (next expected run, Recent Runs section, Complete button, confirmation dialogs), missing previous_run_outcome in timeline events, and UI parity gap for schedule creation via the route."
  - timestamp: 2026-03-09T14:22:21.096Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All implementation files read and analyzed. Compiling requirement-by-requirement review against the spec. Found several issues including: missing production wiring for scheduleLifecycle/recordOps/packages in the services bag, update_schedule lifecycle registration gap, missing UI elements (next expected run, Recent Runs section, Complete button, confirmation dialogs), missing previous_run_outcome in timeline events, and UI parity gap for schedule creation via the route."
projectName: guild-hall
---
## Related Learnings

### From Specs

**Guild Hall Scheduled Commissions** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/specs/commissions/guild-hall-scheduled-commissions.md`)
Relevance: This is the approved spec (REQ-SCOM-1 through REQ-SCOM-28) for the feature being implemented. Defines the full artifact schema (schedule block with cron, repeat, runs_completed, last_run, last_spawned_id), four-status lifecycle (active/paused/completed/failed), daemon scheduler service (60s tick), two manager toolbox tools (create_scheduled_commission, update_schedule), stuck run escalation via meeting requests, catch-up spawns on daemon restart, and UI requirements. Status: **approved**.

**Commission Layer Separation** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/specs/commissions/commission-layer-separation.md`)
Relevance: The scheduler must interact with Layers 1-2 (record and lifecycle) to create and dispatch spawned commissions without violating the hard boundary (REQ-CLS-16: executor never writes commission artifacts directly). The spec explicitly states the scheduler respects layer boundaries. Key constraint: all commission artifact writes go through Layer 1 (REQ-CLS-4). The `CommissionRecordOps` in `record.ts` is the correct entry point for schedule field reads/writes.

### From Plans

**Plan for Scheduled Commissions** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/plans/commissions/guild-hall-scheduled-commissions.md`)
Relevance: This is the approved 11-step implementation plan. Key implementation details:
- **Step 1**: Type extensions in `daemon/types.ts` (CommissionType, ScheduledCommissionStatus) and `daemon/lib/event-bus.ts` (schedule_spawned event)
- **Step 2**: Extend `createCommission()` with trailing options parameter `{ type?, sourceSchedule? }` for backward compatibility
- **Step 3**: New `ScheduleLifecycle` class in `daemon/services/scheduler/schedule-lifecycle.ts` (separate from CommissionLifecycle)
- **Step 4**: Extend existing `CommissionRecordOps` in `record.ts` with schedule-aware methods (readScheduleMetadata, writeScheduleFields)
- **Step 5**: Two new tools in manager toolbox (makeCreateScheduledCommissionHandler, makeUpdateScheduleHandler)
- **Step 6**: Core SchedulerService in `daemon/services/scheduler/index.ts` with cron wrapper in `cron.ts`
- **Step 7**: Catch-up logic (one spawn per missed schedule on startup)
- **Step 8**: Daemon wiring in `createProductionApp()` -- changes return type to `Promise<{ app, shutdown }>` for scheduler cleanup
- **Step 9**: UI updates
- **Step 10**: Cron library integration (croner vs cron-parser, both candidates)
- **Step 11**: Spec validation sub-agent

Cross-cutting: model selection (REQ-MODEL-7, REQ-MODEL-10) is already accounted for in the plan. `resource_overrides` includes `model?: string`.

Open questions from plan:
1. Cron library choice (croner vs cron-parser, resolve during Step 10 via bun compatibility testing)
2. Schedule-specific daemon route vs extending existing PUT /commissions/:id
3. Consecutive failure threshold (3 as constant, promote to config if needed)
4. Model selection spec amendments (documentation updates, not code blockers)

### From Brainstorms

**Scheduled Commissions** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/brainstorm/scheduled-commissions.md`)
Explored: All core design decisions were settled here and carried into the spec. Schedule lives in the commission artifact (not config.yaml), `type` field distinguishes one-shot from scheduled, cron expressions for cadence, spawned commissions are normal one-shot commissions, Guild Master creates/edits schedules, "assuming yes" is a prompt concern not a system concern. Includes stuck run escalation concept and timeline compression ideas.

**Commission Layer Separation** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/brainstorm/commission-layer-separation.md`)
Explored: The five-layer decomposition (later reduced to four in the spec). The hard boundary concept ("executor cannot write to the commission record; it signals, the commission writes itself") originates here. Key anti-pattern identified: "AI Implementation Anti-Pattern: Shotgun Changes" where changes are scattered across files without respecting boundaries.

### From Retros

**In-Process Commission Migration** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/retros/in-process-commissions.md`)
Key insight: Fresh-eyes review found a production wiring gap (queryFn not wired in createProductionApp) even though the risk was pre-identified. Race conditions between cancel and completion handlers are structural in fire-and-forget async patterns. Any function that starts an unowned async task and also has a cancel method needs a terminal state guard. **Directly relevant to the scheduler's tick/stop interaction.**

**Coverage DI Factories** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/retros/coverage-di-factories.md`)
Key insight: The DI factory pattern (`createX(deps)` factory, default instance for production) is the established codebase pattern. Applied to SessionStore, AgentManager, MCPManager, ServerContext, etc. The SchedulerService should follow this same pattern.

**Phase 4 Commissions** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/retros/phase-4-commissions.md`)
Key insight: "1032 tests passed and 33/33 spec requirements validated, but the system didn't work end-to-end." Spec validation catches capability, not assembly. Happy-path logging is as important as error logging. Build observability into the implementation plan, not as a reaction to failure. **The scheduler service should log its tick activity on the success path, not just errors.**

**Dispatch Hardening** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/retros/dispatch-hardening.md`)
Key insight: Resource budget defaults need validation against real workloads. Don't dismiss test failures as "pre-existing" without controlled proof. Duplicate interface definitions are a drift timebomb. **Relevant to the scheduler's configuration constants (tick interval, escalation threshold).**

**Unified SDK Runner** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/retros/unified-sdk-runner.md`)
Key insight: Phased migration with per-phase test verification is the only safe way to do a large refactor. Fresh-eyes review after each phase found three production bugs in Phase 7 that the implementation agent missed. **The plan's 11-step sequence with per-step testing follows this lesson.** Also: compaction gaps are silent. Shared infrastructure is the right place to enforce "this always happens."

**Phase 5 Git Integration Data Loss** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/retros/phase-5-git-integration-data-loss.md`)
Key insight: Git subprocesses spawned during hooks inherit GIT_DIR, GIT_WORK_TREE, and GIT_INDEX_FILE. All code that shells out to git must strip these via cleanGitEnv(). **The scheduler reads from integration worktrees, which involves filesystem reads, not git operations, but any future git interaction must use cleanGitEnv().**

**Worker Domain Plugins** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/retros/worker-domain-plugins.md`)
Key insight: When a spec defines a filesystem convention, validate it by actually creating the files in the real package before finalizing. Test fixture values drifted from production behavior without tests catching it. **Relevant to the schedule artifact schema: create a real schedule artifact early to validate the schema before building infrastructure around it.**

**Commission Batch Cleanup** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/retros/commission-batch-cleanup.md`)
Key insight: Commission artifacts are receipts, not products. Fresh-context review catches what tests don't. Retros written from commission artifacts drift from reality; validate claims against the source. **Relevant to cleanup integration: spawned commissions from schedules should follow the same cleanup path.**

**SSE Streaming Bug Fix** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/retros/sse-streaming-bug-fix.md`)
Key insight: When a system has two ID namespaces for the same concept, the boundary where they meet is highest-risk code. Tests that construct expected values from the code's internal state validate consistency, not correctness. **The scheduler works with CommissionId (branded type) and schedule commission IDs. The boundary between schedule IDs and spawned commission IDs needs careful handling.**

### From Notes

**Model Selection Implementation** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260309-061251/.lore/notes/model-selection.md`)
Relevance: Model selection is already implemented (12 phases complete). REQ-MODEL-10 (scheduled commission model) was explicitly deferred because scheduled commissions weren't built yet. The note confirms: "The resource_overrides copy mechanism will naturally include model when built." The plan for scheduled commissions already accounts for this in Steps 5 and 6.

### From Issues

*No dedicated scheduling or timer issues found in `.lore/issues/`.*

### Research Gaps

**No cron library research exists.** The brainstorm and spec both flag cron library selection as an open research exit point. Candidates identified (croner, cron-parser) but no evaluation has been performed. The plan's Step 10 is designated for this research. The only requirement is "given this expression and a timestamp, when is the next occurrence?" plus validation and interval estimation.

---

## Key Lessons to Carry Forward

1. **DI wiring is the #1 failure mode.** Multiple retros document wiring gaps in `createProductionApp()`. The plan's Step 8 explicitly addresses this. After wiring, run a fresh-eyes review.

2. **The scheduler is the first timer-based service.** No existing pattern to follow for periodic services. Error handling in the tick callback is critical: an unhandled error kills the interval. The plan specifies "if any step fails for a single schedule, log and continue."

3. **Layer boundaries are real.** The scheduler interacts with Layers 1-2 only. It does not write commission artifacts directly. Schedule field updates go through `CommissionRecordOps` (Layer 1). Status transitions go through `ScheduleLifecycle` (a new class parallel to `CommissionLifecycle`).

4. **Test against real artifacts early.** Create a real schedule artifact file and validate the YAML schema works with gray-matter parsing before building the infrastructure. Prior retros document fixture drift from production behavior.

5. **Happy-path logging.** The scheduler should log each tick's findings (N schedules scanned, M due, K spawned) even when nothing happens. When it breaks, the first debugging step should not be "add logging."

6. **Return type change for createProductionApp.** Step 8 changes the return from `Promise<Hono>` to `Promise<{ app: Hono; shutdown: () => void }>`. This has exactly one caller in `daemon/index.ts`. The shutdown function clears the scheduler interval.

7. **Branded CommissionId type.** The existing `CommissionId` branded type works for both one-shot and scheduled commissions. Use `asCommissionId()` when converting from string returns of `createCommission()`.
