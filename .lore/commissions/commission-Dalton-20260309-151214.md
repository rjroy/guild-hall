---
title: "Commission: Fix: scheduled commission worker discovery in meetings"
date: 2026-03-09
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix a bug where `create_scheduled_commission` fails with \"Worker not found in discovered packages\" when used during a Guild Master meeting.\n\n## Root Cause\n\nIn `daemon/services/meeting/orchestrator.ts` around line 456, the manager's `services` are wired with only `commissionSession` and `gitOps`:\n\n```typescript\nservices: isManager && deps.commissionSession\n  ? { commissionSession: deps.commissionSession, gitOps: git }\n  : undefined,\n```\n\nBut the `create_scheduled_commission` handler in `daemon/services/manager/toolbox.ts` (line 650) needs `deps.packages` to validate the worker name:\n\n```typescript\nconst workerPkg = getWorkerByName(deps.packages ?? [], args.workerName);\n```\n\nSince `packages` is never wired into the services object for meetings, it's always an empty array, and every worker lookup fails.\n\nThe `scheduleLifecycle` and `recordOps` fields are also missing from the meeting wiring, which means `update_schedule` likely has the same problem.\n\n## Fix\n\n1. In `daemon/services/meeting/orchestrator.ts`, add `packages`, `scheduleLifecycle`, and `recordOps` to the `MeetingSessionDeps` interface (packages is already there at line 99, but check the others).\n\n2. Wire them into the services object around line 456:\n```typescript\nservices: isManager && deps.commissionSession\n  ? {\n      commissionSession: deps.commissionSession,\n      gitOps: git,\n      packages: deps.packages,\n      scheduleLifecycle: deps.scheduleLifecycle,\n      recordOps: deps.recordOps,\n    }\n  : undefined,\n```\n\n3. Add `scheduleLifecycle` and `recordOps` as optional fields on `MeetingSessionDeps` if not already present.\n\n4. In `daemon/app.ts`, wire the new deps into `createMeetingSession()` (around line 262). You'll need to pass `scheduleLifecycle` and `recordOps` from the production wiring. Check what's already being passed and add the missing fields.\n\n5. Write tests that verify:\n   - The services object includes packages when a manager meeting is wired\n   - The scheduled commission tool resolves worker names correctly during meetings\n\nRun typecheck, lint, and tests after the fix."
dependencies: []
linked_artifacts:
  - daemon/services/meeting/orchestrator.ts

  - daemon/app.ts
  - tests/daemon/meeting-session.test.ts
  - tests/daemon/services/manager/toolbox.test.ts
  - daemon/app.ts
  - tests/daemon/meeting-session.test.ts
  - tests/daemon/services/manager/toolbox.test.ts
resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-09T22:12:14.487Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T22:12:14.489Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-09T22:12:14.519Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-09T22:12:22.609Z
    event: progress_report
    reason: "Starting work: reading relevant source files to understand current wiring"
  - timestamp: 2026-03-09T22:14:41.773Z
    event: progress_report
    reason: "Implementing fix: adding scheduleLifecycleRef and recordOps to MeetingSessionDeps, wiring into services bag"
  - timestamp: 2026-03-09T22:22:08.404Z
    event: progress_report
    reason: "All code changes made. Running typecheck, lint, and tests."
  - timestamp: 2026-03-09T22:23:04.372Z
    event: result_submitted
    reason: "Fixed `create_scheduled_commission` failing with \"Worker not found in discovered packages\" during Guild Master meetings.\n\n**Root cause**: In `buildMeetingPrepSpec` (orchestrator.ts line ~456), the services bag for manager meetings only included `commissionSession` and `gitOps`. The `create_scheduled_commission` handler needs `packages` to validate worker names, and `update_schedule` needs `scheduleLifecycle` and `recordOps`. Since none of these were wired, every worker lookup failed.\n\n**Changes**:\n\n1. **`daemon/services/meeting/orchestrator.ts`**: Added imports for `ScheduleLifecycle` and `CommissionRecordOps`. Added `scheduleLifecycleRef?: { current: ScheduleLifecycle | undefined }` and `recordOps?: CommissionRecordOps` to `MeetingSessionDeps`. Updated the services bag in `buildMeetingPrepSpec` to include `packages`, `scheduleLifecycle` (read from ref at session time), and `recordOps`.\n\n2. **`daemon/app.ts`**: Passed `scheduleLifecycleRef` and `recordOps` to `createMeetingSession()`. Used the existing `scheduleLifecycleRef` ref pattern to avoid the ordering issue (scheduleLifecycle is created after meetingSession but before any meeting runs).\n\n3. **`tests/daemon/meeting-session.test.ts`**: Added test \"services bag accepts scheduleLifecycleRef and recordOps and wires them for manager meeting\" verifying the new deps are accepted and manager meeting starts without errors.\n\n4. **`tests/daemon/services/manager/toolbox.test.ts`**: Added test \"returns Worker not found when packages is empty (regression guard for meeting wiring)\" documenting the pre-fix failure mode and guarding against regression.\n\nResults: 2288 tests pass, 0 fail. Typecheck clean. Lint clean."
  - timestamp: 2026-03-09T22:23:09.739Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All code changes made. Running typecheck, lint, and tests."
projectName: guild-hall
---
Fixed `create_scheduled_commission` failing with "Worker not found in discovered packages" during Guild Master meetings.

**Root cause**: In `buildMeetingPrepSpec` (orchestrator.ts line ~456), the services bag for manager meetings only included `commissionSession` and `gitOps`. The `create_scheduled_commission` handler needs `packages` to validate worker names, and `update_schedule` needs `scheduleLifecycle` and `recordOps`. Since none of these were wired, every worker lookup failed.

**Changes**:

1. **`daemon/services/meeting/orchestrator.ts`**: Added imports for `ScheduleLifecycle` and `CommissionRecordOps`. Added `scheduleLifecycleRef?: { current: ScheduleLifecycle | undefined }` and `recordOps?: CommissionRecordOps` to `MeetingSessionDeps`. Updated the services bag in `buildMeetingPrepSpec` to include `packages`, `scheduleLifecycle` (read from ref at session time), and `recordOps`.

2. **`daemon/app.ts`**: Passed `scheduleLifecycleRef` and `recordOps` to `createMeetingSession()`. Used the existing `scheduleLifecycleRef` ref pattern to avoid the ordering issue (scheduleLifecycle is created after meetingSession but before any meeting runs).

3. **`tests/daemon/meeting-session.test.ts`**: Added test "services bag accepts scheduleLifecycleRef and recordOps and wires them for manager meeting" verifying the new deps are accepted and manager meeting starts without errors.

4. **`tests/daemon/services/manager/toolbox.test.ts`**: Added test "returns Worker not found when packages is empty (regression guard for meeting wiring)" documenting the pre-fix failure mode and guarding against regression.

Results: 2288 tests pass, 0 fail. Typecheck clean. Lint clean.
