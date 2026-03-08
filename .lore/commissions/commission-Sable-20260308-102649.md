---
title: "Commission: Integration tests for core daemon flows"
date: 2026-03-08
status: completed
tags: [commission]
worker: Sable
workerDisplayTitle: "Guild Breaker"
prompt: "The issue `.lore/issues/test-coverage-holes.md` documents missing integration test coverage across core daemon flows. The individually-tested layers give confidence each piece works in isolation, but nothing verifies they work when assembled.\n\nFocus on these three areas, in priority order:\n\n1. **Meeting lifecycle integration.** Create meeting, stream messages via SSE, close meeting, verify artifact written. The daemon services are individually tested (orchestrator, registry, record, transcript), but the orchestration across them isn't.\n\n2. **Commission lifecycle integration.** Dispatch commission, verify workspace provisioned, complete execution, verify merge and artifact update. Same pattern: layers tested individually, end-to-end sequence isn't.\n\n3. **SSE streaming integration.** Verify that daemon events reach an SSE subscriber through the full `EventBus -> GET /events` path with realistic event sequences.\n\n4. **Daemon startup resilience.** REQ-SYS-38 specifies worktree recovery on daemon startup (recreate missing worktrees, reconcile stale state). Commission crash recovery has tests at the orchestrator layer, but no test for the daemon-level startup path that triggers recovery.\n\nAssess the existing test infrastructure (daemon tests use Hono's `app.request()` with injected deps), decide what level of mocking is appropriate for each flow, and write tests that catch wiring gaps without duplicating existing unit coverage. Use your judgment on scope: better to have solid tests for items 1-2 than thin coverage across all four."
dependencies:
  - W2W mail system test gaps and hardcoded recovery bug
linked_artifacts:
  - tests/daemon/integration-commission.test.ts

activity_timeline:
  - timestamp: 2026-03-08T17:26:49.820Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-08T17:26:49.821Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-08T17:26:49.854Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-08T17:26:58.198Z
    event: progress_report
    reason: "Starting: reading the issue file, existing test infrastructure, and daemon architecture to understand what's covered and what's missing."
  - timestamp: 2026-03-08T17:28:41.998Z
    event: progress_report
    reason: "Completed reading all relevant code. Assessment:\n\n- Meeting lifecycle: already well covered in tests/daemon/integration.test.ts (create, stream, close, artifact, state, health counts)\n- SSE streaming: EventBus -> GET /events path covered in tests/daemon/routes/events.test.ts\n- Commission orchestrator: tested in isolation (tests/daemon/services/commission/orchestrator.test.ts) with real Layer 1+2, mock Layer 3+4\n- Commission routes: tested with fully mocked session (tests/daemon/routes/commissions.test.ts)\n\nGAP: No test wires a real commission orchestrator to HTTP routes via createApp(), verifying the full create -> dispatch -> execute -> complete -> merge path through HTTP. No test verifies commission lifecycle events reach an SSE subscriber through the EventBus -> GET /events path with realistic event sequences.\n\nWriting commission lifecycle integration tests now."
  - timestamp: 2026-03-08T17:30:26.296Z
    event: progress_report
    reason: "Resuming after context compaction. Re-reading key files to pick up the mock patterns, then writing commission lifecycle integration tests."
  - timestamp: 2026-03-08T17:39:15.792Z
    event: progress_report
    reason: "All work complete. 11 commission lifecycle integration tests written, committed, and passing alongside the full 1996-test suite. Assessing the four priority areas now to write the final summary."
  - timestamp: 2026-03-08T17:39:39.689Z
    event: result_submitted
    reason: "Added 11 commission lifecycle integration tests in `tests/daemon/integration-commission.test.ts`. These wire a real commission orchestrator to HTTP routes via `createApp()`, filling the primary coverage gap: no test previously verified the layers compose correctly through HTTP.\n\n**What was tested:**\n\n1. **Commission lifecycle through HTTP.** POST /commissions creates artifact in integration worktree. POST /commissions/:id/dispatch triggers workspace.prepare, fires SDK session, calls workspace.finalize on completion. Full create -> dispatch -> execute -> complete -> merge path verified.\n\n2. **SSE streaming of commission events.** Real EventBus wired to both the commission orchestrator and the GET /events SSE route. Test subscribes to SSE, dispatches a commission, and reads commission_status (dispatched, in_progress, completed) and commission_result events from the stream. Verifies events arrive in order with correct commission ID.\n\n3. **Health endpoint counts.** Blocking queryFn holds a session active while health is checked. Confirms commissions.running goes 0 -> 1 -> 0 across the lifecycle.\n\n4. **Failure paths.** Session error (SDK throws) produces failed status. Merge conflict (workspace.finalize returns merged: false) produces failed status. Both verified through EventBus emission.\n\n5. **HTTP error handling.** Unknown project (500), unknown worker (500), unknown commission dispatch (500), missing fields (400).\n\n**What was not tested (and why):**\n\n- **Meeting lifecycle integration (priority 1):** Already thoroughly covered in `tests/daemon/integration.test.ts` (22 tests, full create -> stream -> follow-up -> close -> artifact path). No gap found.\n\n- **SSE streaming integration (priority 3):** The EventBus -> GET /events path was already covered in `tests/daemon/routes/events.test.ts`. The new commission tests add realistic event sequences (lifecycle status transitions) flowing through the same path, which was the actual gap.\n\n- **Daemon startup resilience (priority 4):** Worktree recreation tested in `tests/daemon/app.test.ts`. Commission crash recovery extensively tested at the orchestrator layer (7 tests in the recovery describe block). The daemon-level `createProductionApp()` call to `recoverCommissions()` is a single wiring line. Adding a test for it would duplicate orchestrator-level coverage without catching new wiring bugs.\n\n**Mock strategy:** Real Layer 1 (CommissionRecordOps on filesystem) + real Layer 2 (CommissionLifecycle) + real EventBus. Mock Layer 3 (WorkspaceOps) simulates worktree creation by copying artifacts. Mock Layer 4 (queryFn) yields init + result messages. This catches wiring gaps between HTTP routes and orchestrator without duplicating existing layer-level tests."
  - timestamp: 2026-03-08T17:39:47.782Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All work complete. 11 commission lifecycle integration tests written, committed, and passing alongside the full 1996-test suite. Assessing the four priority areas now to write the final summary."
projectName: guild-hall
---
Added 11 commission lifecycle integration tests in `tests/daemon/integration-commission.test.ts`. These wire a real commission orchestrator to HTTP routes via `createApp()`, filling the primary coverage gap: no test previously verified the layers compose correctly through HTTP.

**What was tested:**

1. **Commission lifecycle through HTTP.** POST /commissions creates artifact in integration worktree. POST /commissions/:id/dispatch triggers workspace.prepare, fires SDK session, calls workspace.finalize on completion. Full create -> dispatch -> execute -> complete -> merge path verified.

2. **SSE streaming of commission events.** Real EventBus wired to both the commission orchestrator and the GET /events SSE route. Test subscribes to SSE, dispatches a commission, and reads commission_status (dispatched, in_progress, completed) and commission_result events from the stream. Verifies events arrive in order with correct commission ID.

3. **Health endpoint counts.** Blocking queryFn holds a session active while health is checked. Confirms commissions.running goes 0 -> 1 -> 0 across the lifecycle.

4. **Failure paths.** Session error (SDK throws) produces failed status. Merge conflict (workspace.finalize returns merged: false) produces failed status. Both verified through EventBus emission.

5. **HTTP error handling.** Unknown project (500), unknown worker (500), unknown commission dispatch (500), missing fields (400).

**What was not tested (and why):**

- **Meeting lifecycle integration (priority 1):** Already thoroughly covered in `tests/daemon/integration.test.ts` (22 tests, full create -> stream -> follow-up -> close -> artifact path). No gap found.

- **SSE streaming integration (priority 3):** The EventBus -> GET /events path was already covered in `tests/daemon/routes/events.test.ts`. The new commission tests add realistic event sequences (lifecycle status transitions) flowing through the same path, which was the actual gap.

- **Daemon startup resilience (priority 4):** Worktree recreation tested in `tests/daemon/app.test.ts`. Commission crash recovery extensively tested at the orchestrator layer (7 tests in the recovery describe block). The daemon-level `createProductionApp()` call to `recoverCommissions()` is a single wiring line. Adding a test for it would duplicate orchestrator-level coverage without catching new wiring bugs.

**Mock strategy:** Real Layer 1 (CommissionRecordOps on filesystem) + real Layer 2 (CommissionLifecycle) + real EventBus. Mock Layer 3 (WorkspaceOps) simulates worktree creation by copying artifacts. Mock Layer 4 (queryFn) yields init + result messages. This catches wiring gaps between HTTP routes and orchestrator without duplicating existing layer-level tests.
