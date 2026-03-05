---
title: "Commission: Implement: Project-Scoped Meetings"
date: 2026-03-05
status: completed
tags: [commission]
worker: Developer
workerDisplayTitle: "Guild Developer"
prompt: "Implement the Project-Scoped Meetings feature following the approved plan at `.lore/plans/project-scoped-meetings.md` and the spec at `.lore/specs/project-scoped-meetings.md`.\n\n## Important: No User Interaction\n\nYou will NOT have access to the user during this commission. Answer all questions yourself using the plan, spec, and codebase context. Do not use AskUserQuestion. Make reasonable decisions and document them.\n\n## What to Build\n\nProject-scoped meetings allow certain workers (starting with the Guild Master) to run meetings directly in the project's integration worktree instead of an isolated activity worktree. This gives them live visibility into commission results as they merge.\n\n## Implementation Steps (from the plan)\n\nFollow all 9 steps in order:\n\n1. **Add `meetingScope` to WorkerMetadata and Guild Master package** (`lib/types.ts`, `daemon/services/manager/worker.ts`)\n2. **Add `scope` to ActiveMeetingEntry and state serialization** (`daemon/services/meeting/registry.ts`, `daemon/services/meeting/orchestrator.ts`)\n3. **Add scope resolution helper** (`daemon/services/meeting/orchestrator.ts`)\n4. **Branch `createMeeting` and `acceptMeetingRequest` for project scope** (`daemon/services/meeting/orchestrator.ts`)\n5. **Branch `closeMeeting` for project scope** (`daemon/services/meeting/orchestrator.ts`)\n6. **Update `cleanupFailedEntry` for project scope** (`daemon/services/meeting/orchestrator.ts`)\n7. **Update `recoverMeetings` for project scope** (`daemon/services/meeting/orchestrator.ts`)\n8. **Write tests** (`tests/daemon/meeting-session.test.ts` or new file if existing is too large)\n9. **Validate against spec** (launch a sub-agent to compare implementation against all REQ-PSM requirements)\n\n## Key Design Decisions (from the spec and plan)\n\n- `meetingScope` is an optional field on `WorkerMetadata`: `\"project\" | \"activity\"`, absence means `\"activity\"`\n- Guild Master's `createManagerPackage()` sets `meetingScope: \"project\"`\n- Scope is resolved once at creation time and stored on `ActiveMeetingEntry`, never re-derived\n- Project-scoped creation: no `provisionWorkspace()`, `worktreeDir` = integration worktree path, `branchName` = `\"\"`\n- Project-scoped close: no `workspace.finalize()`, instead `commitAll()` on integration worktree under `withProjectLock()`\n- Project-scoped cleanup: deregister only, no worktree removal\n- Project-scoped recovery: skip `fs.access()` worktree existence check\n- State file gains `scope` field, backward-compatible (absent = \"activity\")\n- Activity-scoped meetings are completely unchanged\n\n## Testing Requirements\n\nThe plan's Step 8 lists 10 test scenarios. All must be covered. Use the existing mock patterns from `tests/daemon/meeting-session.test.ts`.\n\n## Verification\n\n- All existing tests must continue to pass (`bun test`)\n- Typecheck must pass (`bun run typecheck`)\n- New tests must cover all 10 scenarios from the plan\n- Step 9: Launch a sub-agent to validate implementation against spec requirements\n\n## Delegation Guide (from the plan)\n\nAfter implementation, use these review agents:\n- `pr-review-toolkit:silent-failure-hunter` on the close flow (Step 5) and recovery path (Step 7)\n- `pr-review-toolkit:pr-test-analyzer` to verify test coverage\n- `lore-development:plan-reviewer` for fresh-context spec validation"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-05T05:06:35.282Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-05T05:06:35.284Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-05T05:06:35.317Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-05T05:06:42.387Z
    event: progress_report
    reason: "Starting Project-Scoped Meetings implementation. Reading plan, spec, and relevant source files."
  - timestamp: 2026-03-05T05:08:40.109Z
    event: progress_report
    reason: "Steps 1-3 complete (types, state serialization, scope resolver). Now implementing Step 4: branching createMeeting and acceptMeetingRequest for project scope."
  - timestamp: 2026-03-05T05:11:26.062Z
    event: progress_report
    reason: "Steps 1-7 complete (all orchestrator, registry, and type changes). Running typecheck before writing tests to catch issues early."
  - timestamp: 2026-03-05T05:13:16.731Z
    event: progress_report
    reason: "Steps 1-7 complete and verified (typecheck passes, all 97+21 existing tests pass). Now writing new test file for project-scoped meetings covering all 10 spec scenarios."
  - timestamp: 2026-03-05T05:16:16.735Z
    event: status_failed
    reason: "Process unresponsive (heartbeat timeout)"
    from: "in_progress"
    to: "failed"
current_progress: "Steps 1-7 complete and verified (typecheck passes, all 97+21 existing tests pass). Now writing new test file for project-scoped meetings covering all 10 spec scenarios."
projectName: guild-hall
---
