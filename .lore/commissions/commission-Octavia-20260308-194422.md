---
title: "Commission: Plan from Guild Hall Scheduled Commissions spec"
date: 2026-03-09
status: completed
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Prepare an implementation plan from the spec at `.lore/specs/guild-hall-scheduled-commissions.md`. Use `/lore-development:prep-plan` to build the plan as a persistent lore artifact. Read the spec thoroughly, review the brainstorm at `.lore/brainstorm/scheduled-commissions.md` for additional context, understand the existing codebase patterns (especially the commission layer in `daemon/services/commission/`, the daemon startup in `daemon/index.ts`, config in `lib/`, and the CLI in `cli/`), and produce an ordered, actionable plan that a developer could follow."
dependencies: []
linked_artifacts:
  - .lore/specs/guild-hall-scheduled-commissions.md

  - .lore/specs/commission-layer-separation.md
  - .lore/specs/guild-hall-commissions.md
  - .lore/brainstorm/scheduled-commissions.md
  - .lore/brainstorm/commission-layer-separation.md
  - .lore/brainstorm/lore-proliferation-maintenance.md
  - .lore/retros/phase-4-commissions.md
  - .lore/retros/in-process-commissions.md
  - .lore/retros/unified-sdk-runner.md
  - .lore/retros/commission-batch-cleanup-2026-03-07.md
  - .lore/reference/commissions.md
  - .lore/design/cleanup-commissions-skill.md
  - .lore/specs/commission-layer-separation.md
  - .lore/specs/guild-hall-commissions.md
  - .lore/brainstorm/scheduled-commissions.md
  - .lore/brainstorm/commission-layer-separation.md
  - .lore/brainstorm/lore-proliferation-maintenance.md
  - .lore/retros/phase-4-commissions.md
  - .lore/retros/in-process-commissions.md
  - .lore/retros/unified-sdk-runner.md
  - .lore/retros/commission-batch-cleanup-2026-03-07.md
  - .lore/reference/commissions.md
  - .lore/design/cleanup-commissions-skill.md
activity_timeline:
  - timestamp: 2026-03-09T02:44:22.272Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T02:44:22.273Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-09T02:44:22.309Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-09T02:44:29.243Z
    event: progress_report
    reason: "Starting: reading the spec, brainstorm, and codebase patterns before invoking prep-plan."
  - timestamp: 2026-03-09T02:46:23.749Z
    event: progress_report
    reason: "Finished codebase exploration. Invoking /lore-development:prep-plan to build the implementation plan artifact."
  - timestamp: 2026-03-09T02:48:00.835Z
    event: progress_report
    reason: "Search complete. Found extensive prior work: a full spec (guild-hall-scheduled-commissions.md), a resolved brainstorm, the commission layer separation spec, the base commissions spec, and multiple retros. Compiling findings report now."
  - timestamp: 2026-03-09T02:49:08.274Z
    event: result_submitted
    reason: "## Related Learnings\n\n### From Specs\n\n**Guild Hall Scheduled Commissions** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260308-194422/.lore/specs/guild-hall-scheduled-commissions.md`)\nRelevance: This is the **primary spec** for the feature you are planning. Status: `draft`. It defines 28 requirements (REQ-SCOM-1 through REQ-SCOM-28) covering the complete scheduled commission system: `type` field on commission artifacts, `schedule` block with cron/repeat/runs_completed/last_run/last_spawned_id, four-status lifecycle (active/paused/completed/failed), daemon scheduler service on a 60-second tick, spawned commissions as normal one-shot commissions with `source_schedule` back-reference, overlap prevention (skip when previous spawn still active), catch-up spawns on daemon restart (one per missed schedule, not all), stuck run escalation to Guild Master via meeting request at 2x cadence, two manager toolbox tools (`create_scheduled_commission`, `update_schedule`), UI requirements (REQ-SCOM-22 through REQ-SCOM-25), cleanup integration (spawned commissions eligible, schedule artifacts not), and timeline compression as a `tend` concern. Success criteria checklist and AI validation test cases are fully defined. Exit points: cron library selection and tend skill enhancement.\n\n**Commission Layer Separation** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260308-194422/.lore/specs/commission-layer-separation.md`)\nRelevance: Status: `implemented`. The scheduler service will interact with Layers 1-2 (record and lifecycle) to create and dispatch spawned commissions, as REQ-SCOM-12 states. The spec explicitly notes this in its context. Key architectural constraint: the scheduler must not bypass layer boundaries. Layer 1 owns all artifact writes, Layer 2 owns state transitions. The orchestrator (Layer 4) is the only layer that imports from all others. The scheduler is a new daemon service at the same conceptual level as the orchestrator, interacting with Layers 1-2 directly. The hard boundary (REQ-CLS-16): execution layers never read/write commission artifacts. The production wiring pattern is in `daemon/app.ts` lines 200-252.\n\n**Guild Hall Commissions** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260308-194422/.lore/specs/guild-hall-commissions.md`)\nRelevance: Status: `implemented`. The base commission lifecycle (REQ-COM-1 through REQ-COM-32) that spawned commissions follow in full. Key references for the scheduler: REQ-COM-5 (eight states for one-shot), REQ-COM-9 (dispatch sequence), REQ-COM-21/22 (concurrent limits), REQ-COM-27-29 (crash recovery). The `source_schedule` field is the only addition to the one-shot artifact schema.\n\n### From Brainstorms\n\n**Scheduled Commissions** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260308-194422/.lore/brainstorm/scheduled-commissions.md`)\nExplored: Status: `specified` (decisions carried forward into the spec). Core decisions settled here: schedule lives in the commission artifact (not config.yaml), `type` field separates one-shot from scheduled, cron expressions for cadence, spawned commissions are normal one-shot, Guild Master creates/edits via tools, \"assuming yes\" is a prompt concern. Open questions that were resolved in the spec: paused status (yes, added), tick interval (spec chose 60s over brainstorm's 5min suggestion), spawn event format (fully defined), UI representation (defined), cleanup integration (defined).\n\n**Commission Layer Separation** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260308-194422/.lore/brainstorm/commission-layer-separation.md`)\nExplored: Status: `resolved`. Originated the five-layer model and hard boundary concept. The concrete dispatch-through-completion flow diagram shows exactly how signals flow between layers, which is the pattern the scheduler will follow when spawning commissions.\n\n**Lore Proliferation and Automated Maintenance** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260308-194422/.lore/brainstorm/lore-proliferation-maintenance.md`)\nExplored: Status: `open`. This is the motivating context for scheduled commissions. Discusses triggered events (commission completes -> run cleanup) and scheduled events (run `tend` weekly). The brainstorm explicitly identifies the daemon scheduler as the missing piece and raises the question of whether maintenance should be a worker or a mechanical process. Scheduled commissions are the answer to the \"scheduled events\" half of this brainstorm.\n\n### From Retros\n\n**Phase 4 Commissions** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260308-194422/.lore/retros/phase-4-commissions.md`)\nKey insight: \"1032 tests passed and 33/33 spec requirements validated, but the system didn't work end-to-end.\" Worker packages must handle all activation contexts. When adding the scheduler, verify end-to-end that spawned commissions actually run, not just that the unit tests pass. Happy-path logging should be built in from the start.\n\n**In-Process Commission Migration** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260308-194422/.lore/retros/in-process-commissions.md`)\nKey insight: Race conditions between cancel and completion handlers are structural in fire-and-forget async patterns. Any function that starts an unowned async task and also has a cancel method needs a terminal state guard. Applies to the scheduler: pausing a schedule while a spawn is in progress needs the same guard. Fresh-eyes review catches DI wiring gaps the implementer misses. After building the scheduler, verify the production wiring in `daemon/app.ts`.\n\n**Unified SDK Runner** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260308-194422/.lore/retros/unified-sdk-runner.md`)\nKey insight: Phased migration with per-phase test verification is the only safe way to do a large refactor. The scheduler adds a new daemon service that interacts with existing commission infrastructure, so phased implementation with test verification at each step is the safe approach. The `prepareSdkSession`/`runSdkSession`/`drainSdkSession` pipeline is the session infrastructure the scheduler's spawned commissions will use.\n\n**Commission Batch Cleanup** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260308-194422/.lore/retros/commission-batch-cleanup-2026-03-07.md`)\nKey insight: Commission artifacts are receipts, not products. Cleanup should be routine. The `cleanup-commissions` integration with scheduled commissions (REQ-SCOM-26/27) is directly informed by this retro: spawned commissions are eligible for cleanup, schedule artifacts are not.\n\n### From Reference Docs\n\n**Commissions Reference** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260308-194422/.lore/reference/commissions.md`)\nRelevance: Current-state reference documenting all commission routes, file roles, data locations, and the state machine. The scheduler will create commissions through the same internal path as the manager toolbox. Key detail: \"the queue is not a data structure; it's readdir + sort by creation date.\" Auto-dispatch scans all projects' pending commissions when capacity opens. The scheduler needs to integrate with this pattern.\n\n### From Design Docs\n\n**Cleanup Commissions Skill** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260308-194422/.lore/design/cleanup-commissions-skill.md`)\nRelevance: The `cleanup-commissions` skill is the first domain plugin and a key consumer of scheduled commissions. The skill reviews completed commission artifacts as a batch, extracts loose threads, and deletes commission files. When scheduled commissions run this skill periodically, the `source_schedule` field gives provenance context for grouping spawned commissions by parent schedule.\n\n### From Issues\n\n*No matches.* No issues in `.lore/issues/` relate to scheduling, cron, recurring work, or timers.\n\n### From Notes\n\n*No matches.* No notes in `.lore/notes/` relate to scheduling or cron.\n\n### Daemon Infrastructure Context\n\n**Existing daemon service patterns** (from `daemon/app.ts` and `daemon/services/commission/`):\n\nThe daemon has **no existing timer/interval-based services**. A `grep` for `setInterval`, `setTimeout`, `timer`, and `tick` across the entire `daemon/` directory returned zero matches. The scheduler will be the first timer-based service in the daemon. Production wiring follows the DI factory pattern: `createProductionApp()` in `daemon/app.ts` assembles all services with explicit dependency injection (lines 200-252 show the commission layer assembly). The commission layer is structured as:\n- `daemon/services/commission/record.ts` (Layer 1)\n- `daemon/services/commission/lifecycle.ts` (Layer 2)\n- `daemon/services/workspace.ts` (Layer 3)\n- `daemon/services/commission/orchestrator.ts` (Layer 4)\n- `daemon/services/commission/toolbox.ts` (commission-context tools)\n- `daemon/services/commission/capacity.ts` (concurrent limit checks)\n\nThe scheduler service would be a new file (e.g., `daemon/services/scheduler.ts` or `daemon/services/commission/scheduler.ts`) wired in `createProductionApp()` after the commission orchestrator is assembled but before the return statement. It would need references to `lifecycle`, `recordOps`, `config`, `guildHallHome`, `eventBus`, and `commissionSession` (for dispatch).\n\n---\n\n**Summary for plan authoring:** The spec is fully written and in `draft` status. The brainstorm is resolved. All open questions from the brainstorm were answered in the spec. The implementation plan needs to cover: (1) cron library selection, (2) scheduler service creation with 60-second tick, (3) schedule-aware commission record/lifecycle extensions, (4) manager toolbox additions, (5) UI extensions, (6) production wiring in `app.ts`, (7) cleanup integration, and (8) end-to-end verification. Key risks from retros: production wiring gaps (wire it explicitly), end-to-end failures despite passing unit tests (test the full spawn cycle), and race conditions in async patterns (terminal state guards for pause-during-spawn)."
  - timestamp: 2026-03-09T02:51:31.625Z
    event: progress_report
    reason: "Context gathering complete. All gaps surfaced and resolved. Drafting the implementation plan document now."
  - timestamp: 2026-03-09T02:54:37.454Z
    event: progress_report
    reason: "Plan drafted and saved to .lore/plans/guild-hall-scheduled-commissions.md. Running fresh-eyes review via plan-reviewer agent."
  - timestamp: 2026-03-09T03:01:02.636Z
    event: progress_report
    reason: "Commission complete. Plan artifact saved at .lore/plans/guild-hall-scheduled-commissions.md. All 28 REQ-SCOM requirements mapped to 11 implementation steps. Fresh-eyes review ran, 6 findings addressed in-place."
  - timestamp: 2026-03-09T03:01:13.505Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Commission complete. Plan artifact saved at .lore/plans/guild-hall-scheduled-commissions.md. All 28 REQ-SCOM requirements mapped to 11 implementation steps. Fresh-eyes review ran, 6 findings addressed in-place."
projectName: guild-hall
---
## Related Learnings

### From Specs

**Guild Hall Scheduled Commissions** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260308-194422/.lore/specs/guild-hall-scheduled-commissions.md`)
Relevance: This is the **primary spec** for the feature you are planning. Status: `draft`. It defines 28 requirements (REQ-SCOM-1 through REQ-SCOM-28) covering the complete scheduled commission system: `type` field on commission artifacts, `schedule` block with cron/repeat/runs_completed/last_run/last_spawned_id, four-status lifecycle (active/paused/completed/failed), daemon scheduler service on a 60-second tick, spawned commissions as normal one-shot commissions with `source_schedule` back-reference, overlap prevention (skip when previous spawn still active), catch-up spawns on daemon restart (one per missed schedule, not all), stuck run escalation to Guild Master via meeting request at 2x cadence, two manager toolbox tools (`create_scheduled_commission`, `update_schedule`), UI requirements (REQ-SCOM-22 through REQ-SCOM-25), cleanup integration (spawned commissions eligible, schedule artifacts not), and timeline compression as a `tend` concern. Success criteria checklist and AI validation test cases are fully defined. Exit points: cron library selection and tend skill enhancement.

**Commission Layer Separation** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260308-194422/.lore/specs/commission-layer-separation.md`)
Relevance: Status: `implemented`. The scheduler service will interact with Layers 1-2 (record and lifecycle) to create and dispatch spawned commissions, as REQ-SCOM-12 states. The spec explicitly notes this in its context. Key architectural constraint: the scheduler must not bypass layer boundaries. Layer 1 owns all artifact writes, Layer 2 owns state transitions. The orchestrator (Layer 4) is the only layer that imports from all others. The scheduler is a new daemon service at the same conceptual level as the orchestrator, interacting with Layers 1-2 directly. The hard boundary (REQ-CLS-16): execution layers never read/write commission artifacts. The production wiring pattern is in `daemon/app.ts` lines 200-252.

**Guild Hall Commissions** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260308-194422/.lore/specs/guild-hall-commissions.md`)
Relevance: Status: `implemented`. The base commission lifecycle (REQ-COM-1 through REQ-COM-32) that spawned commissions follow in full. Key references for the scheduler: REQ-COM-5 (eight states for one-shot), REQ-COM-9 (dispatch sequence), REQ-COM-21/22 (concurrent limits), REQ-COM-27-29 (crash recovery). The `source_schedule` field is the only addition to the one-shot artifact schema.

### From Brainstorms

**Scheduled Commissions** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260308-194422/.lore/brainstorm/scheduled-commissions.md`)
Explored: Status: `specified` (decisions carried forward into the spec). Core decisions settled here: schedule lives in the commission artifact (not config.yaml), `type` field separates one-shot from scheduled, cron expressions for cadence, spawned commissions are normal one-shot, Guild Master creates/edits via tools, "assuming yes" is a prompt concern. Open questions that were resolved in the spec: paused status (yes, added), tick interval (spec chose 60s over brainstorm's 5min suggestion), spawn event format (fully defined), UI representation (defined), cleanup integration (defined).

**Commission Layer Separation** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260308-194422/.lore/brainstorm/commission-layer-separation.md`)
Explored: Status: `resolved`. Originated the five-layer model and hard boundary concept. The concrete dispatch-through-completion flow diagram shows exactly how signals flow between layers, which is the pattern the scheduler will follow when spawning commissions.

**Lore Proliferation and Automated Maintenance** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260308-194422/.lore/brainstorm/lore-proliferation-maintenance.md`)
Explored: Status: `open`. This is the motivating context for scheduled commissions. Discusses triggered events (commission completes -> run cleanup) and scheduled events (run `tend` weekly). The brainstorm explicitly identifies the daemon scheduler as the missing piece and raises the question of whether maintenance should be a worker or a mechanical process. Scheduled commissions are the answer to the "scheduled events" half of this brainstorm.

### From Retros

**Phase 4 Commissions** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260308-194422/.lore/retros/phase-4-commissions.md`)
Key insight: "1032 tests passed and 33/33 spec requirements validated, but the system didn't work end-to-end." Worker packages must handle all activation contexts. When adding the scheduler, verify end-to-end that spawned commissions actually run, not just that the unit tests pass. Happy-path logging should be built in from the start.

**In-Process Commission Migration** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260308-194422/.lore/retros/in-process-commissions.md`)
Key insight: Race conditions between cancel and completion handlers are structural in fire-and-forget async patterns. Any function that starts an unowned async task and also has a cancel method needs a terminal state guard. Applies to the scheduler: pausing a schedule while a spawn is in progress needs the same guard. Fresh-eyes review catches DI wiring gaps the implementer misses. After building the scheduler, verify the production wiring in `daemon/app.ts`.

**Unified SDK Runner** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260308-194422/.lore/retros/unified-sdk-runner.md`)
Key insight: Phased migration with per-phase test verification is the only safe way to do a large refactor. The scheduler adds a new daemon service that interacts with existing commission infrastructure, so phased implementation with test verification at each step is the safe approach. The `prepareSdkSession`/`runSdkSession`/`drainSdkSession` pipeline is the session infrastructure the scheduler's spawned commissions will use.

**Commission Batch Cleanup** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260308-194422/.lore/retros/commission-batch-cleanup-2026-03-07.md`)
Key insight: Commission artifacts are receipts, not products. Cleanup should be routine. The `cleanup-commissions` integration with scheduled commissions (REQ-SCOM-26/27) is directly informed by this retro: spawned commissions are eligible for cleanup, schedule artifacts are not.

### From Reference Docs

**Commissions Reference** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260308-194422/.lore/reference/commissions.md`)
Relevance: Current-state reference documenting all commission routes, file roles, data locations, and the state machine. The scheduler will create commissions through the same internal path as the manager toolbox. Key detail: "the queue is not a data structure; it's readdir + sort by creation date." Auto-dispatch scans all projects' pending commissions when capacity opens. The scheduler needs to integrate with this pattern.

### From Design Docs

**Cleanup Commissions Skill** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260308-194422/.lore/design/cleanup-commissions-skill.md`)
Relevance: The `cleanup-commissions` skill is the first domain plugin and a key consumer of scheduled commissions. The skill reviews completed commission artifacts as a batch, extracts loose threads, and deletes commission files. When scheduled commissions run this skill periodically, the `source_schedule` field gives provenance context for grouping spawned commissions by parent schedule.

### From Issues

*No matches.* No issues in `.lore/issues/` relate to scheduling, cron, recurring work, or timers.

### From Notes

*No matches.* No notes in `.lore/notes/` relate to scheduling or cron.

### Daemon Infrastructure Context

**Existing daemon service patterns** (from `daemon/app.ts` and `daemon/services/commission/`):

The daemon has **no existing timer/interval-based services**. A `grep` for `setInterval`, `setTimeout`, `timer`, and `tick` across the entire `daemon/` directory returned zero matches. The scheduler will be the first timer-based service in the daemon. Production wiring follows the DI factory pattern: `createProductionApp()` in `daemon/app.ts` assembles all services with explicit dependency injection (lines 200-252 show the commission layer assembly). The commission layer is structured as:
- `daemon/services/commission/record.ts` (Layer 1)
- `daemon/services/commission/lifecycle.ts` (Layer 2)
- `daemon/services/workspace.ts` (Layer 3)
- `daemon/services/commission/orchestrator.ts` (Layer 4)
- `daemon/services/commission/toolbox.ts` (commission-context tools)
- `daemon/services/commission/capacity.ts` (concurrent limit checks)

The scheduler service would be a new file (e.g., `daemon/services/scheduler.ts` or `daemon/services/commission/scheduler.ts`) wired in `createProductionApp()` after the commission orchestrator is assembled but before the return statement. It would need references to `lifecycle`, `recordOps`, `config`, `guildHallHome`, `eventBus`, and `commissionSession` (for dispatch).

---

**Summary for plan authoring:** The spec is fully written and in `draft` status. The brainstorm is resolved. All open questions from the brainstorm were answered in the spec. The implementation plan needs to cover: (1) cron library selection, (2) scheduler service creation with 60-second tick, (3) schedule-aware commission record/lifecycle extensions, (4) manager toolbox additions, (5) UI extensions, (6) production wiring in `app.ts`, (7) cleanup integration, and (8) end-to-end verification. Key risks from retros: production wiring gaps (wire it explicitly), end-to-end failures despite passing unit tests (test the full spawn cycle), and race conditions in async patterns (terminal state guards for pause-during-spawn).
