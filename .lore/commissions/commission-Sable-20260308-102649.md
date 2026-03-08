---
title: "Commission: Integration tests for core daemon flows"
date: 2026-03-08
status: dispatched
tags: [commission]
worker: Sable
workerDisplayTitle: "Guild Breaker"
prompt: "The issue `.lore/issues/test-coverage-holes.md` documents missing integration test coverage across core daemon flows. The individually-tested layers give confidence each piece works in isolation, but nothing verifies they work when assembled.\n\nFocus on these three areas, in priority order:\n\n1. **Meeting lifecycle integration.** Create meeting, stream messages via SSE, close meeting, verify artifact written. The daemon services are individually tested (orchestrator, registry, record, transcript), but the orchestration across them isn't.\n\n2. **Commission lifecycle integration.** Dispatch commission, verify workspace provisioned, complete execution, verify merge and artifact update. Same pattern: layers tested individually, end-to-end sequence isn't.\n\n3. **SSE streaming integration.** Verify that daemon events reach an SSE subscriber through the full `EventBus -> GET /events` path with realistic event sequences.\n\n4. **Daemon startup resilience.** REQ-SYS-38 specifies worktree recovery on daemon startup (recreate missing worktrees, reconcile stale state). Commission crash recovery has tests at the orchestrator layer, but no test for the daemon-level startup path that triggers recovery.\n\nAssess the existing test infrastructure (daemon tests use Hono's `app.request()` with injected deps), decide what level of mocking is appropriate for each flow, and write tests that catch wiring gaps without duplicating existing unit coverage. Use your judgment on scope: better to have solid tests for items 1-2 than thin coverage across all four."
dependencies:
  - W2W mail system test gaps and hardcoded recovery bug
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-08T17:26:49.820Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-08T17:26:49.821Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
